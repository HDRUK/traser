import pLimit from "p-limit";
import { extractMetadata } from "./cache.server";
import { diffValues, type DiffEntry } from "./diff.server";
import {
  writeRun,
  upsertIndexEntry,
  fingerprint,
  toSummary,
  type BenchmarkRun,
  type RunStats,
} from "./benchmarkStorage.server";

let _running = false;
let _cancelRequested = false;

export const MAX_WORK_ITEMS = 5000;

export function isBenchmarkRunning(): boolean {
  return _running;
}

// Cooperative cancellation: a hung/slow run (e.g. a local endpoint that never
// responds, or an unbounded discovery scan) can't be killed outright since we
// don't hold a reference to every in-flight fetch, but every loop below polls
// this between iterations so a stuck run can be un-stuck without restarting
// the whole dev server.
export function requestCancel(): boolean {
  if (!_running) return false;
  _cancelRequested = true;
  return true;
}

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function appendLog(log: string[], entry: string): string[] {
  const next = [...log, `[${ts()}] ${entry}`];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

interface WorkItem {
  id: number;
  repeatIndex: number;
}

export function buildShuffledWorkList(ids: number[], repeat: number): WorkItem[] {
  const items: WorkItem[] = [];
  for (const id of ids) {
    for (let r = 0; r < repeat; r++) items.push({ id, repeatIndex: r });
  }
  // Fisher-Yates — spreads repeats of the same id across the run instead of
  // fetching them back-to-back, which would just measure a warm cache/connection.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ─── Pre-flight existence check ────────────────────────────────────────────
// Numeric id ranges are frequently sparse (deleted/never-issued ids), so we
// list the Gateway API's datasets first and only benchmark ids that actually
// exist — avoids polluting timing stats with guaranteed 404s. Mirrors the
// ACTIVE+DRAFT merge pattern in refresh.server.ts, which found a single
// per_page=100000 request returns everything in one page for the real API;
// we still page properly in case a given endpoint caps per_page lower, but
// bound the whole scan by a wall-clock deadline so a misbehaving endpoint
// (ignores `page`, never reports `last_page`) can't hang the run for hours.

interface ListDatasetsResponse {
  data?: Array<{ id: string | number }>;
  last_page?: number;
  meta?: { last_page?: number };
}

const DISCOVERY_PER_PAGE = 100_000;
const DISCOVERY_MAX_PAGES = 50;
const DISCOVERY_DEADLINE_MS = 15_000;

async function fetchIdsForStatus(
  baseUrl: string,
  status: string,
  start: number,
  end: number,
  deadlineAt: number
): Promise<number[]> {
  let page = 1;
  const ids: number[] = [];

  while (page <= DISCOVERY_MAX_PAGES && !_cancelRequested && performance.now() < deadlineAt) {
    const res = await fetch(
      `${baseUrl}/datasets?with_metadata=0&status=${status}&per_page=${DISCOVERY_PER_PAGE}&page=${page}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} listing datasets (status=${status}, page=${page})`);
    const body = (await res.json()) as ListDatasetsResponse;
    const rows = body.data ?? [];

    for (const row of rows) {
      const id = Number(row.id);
      if (Number.isFinite(id) && id >= start && id <= end) ids.push(id);
    }

    const lastPage = body.last_page ?? body.meta?.last_page;
    if (rows.length < DISCOVERY_PER_PAGE || (lastPage !== undefined && page >= lastPage)) break;
    page++;
  }

  return ids;
}

export interface DiscoveryResult {
  ids: number[]; // sorted, deduped, within [start, end]
  discovered: boolean; // false if the list endpoint was unreachable/timed out and we fell back to the raw range
}

export async function discoverAvailableIds(baseUrl: string, start: number, end: number): Promise<DiscoveryResult> {
  const deadlineAt = performance.now() + DISCOVERY_DEADLINE_MS;
  try {
    const [activeIds, draftIds] = await Promise.all([
      fetchIdsForStatus(baseUrl, "ACTIVE", start, end, deadlineAt),
      fetchIdsForStatus(baseUrl, "DRAFT", start, end, deadlineAt).catch(() => [] as number[]),
    ]);
    const ids = Array.from(new Set([...activeIds, ...draftIds])).sort((a, b) => a - b);
    return { ids, discovered: true };
  } catch (err) {
    console.error(`discoverAvailableIds failed for ${baseUrl} — falling back to full range:`, err);
    const ids: number[] = [];
    for (let id = start; id <= end; id++) ids.push(id);
    return { ids, discovered: false };
  }
}

export function computeStats(durations: number[]): Omit<RunStats, "successRate"> {
  if (durations.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    median: pct(0.5),
    p95: pct(0.95),
  };
}

export interface StartBenchmarkOpts {
  runId: string;
  label: string;
  baseUrl: string;
  schemaModel: string;
  schemaVersion: string;
  start: number;
  end: number;
  repeat: number;
  concurrency: number;
}

// Built and persisted by the caller (the route action) BEFORE startBenchmark()
// is invoked, so `running: true` is on disk the instant the action returns —
// otherwise the fire-and-forget startBenchmark() call can still be mid-discovery
// (a real network round trip) when the browser's post-action revalidation reads
// index.json, finds no running entry yet, and the UI looks like the click did
// nothing. Mirrors refresh.server.ts's action, which awaits writeTestResults()
// with running:true before ever calling runAllTests().
export function buildInitialRun(opts: StartBenchmarkOpts): BenchmarkRun {
  return {
    id: opts.runId,
    label: opts.label,
    baseUrl: opts.baseUrl,
    schemaModel: opts.schemaModel,
    schemaVersion: opts.schemaVersion,
    idRangeStart: opts.start,
    idRangeEnd: opts.end,
    repeat: opts.repeat,
    concurrency: opts.concurrency,
    createdAt: new Date().toISOString(),
    running: true,
    progress: { completed: 0, total: 0 },
    log: appendLog([], `Checking which ids exist in range ${opts.start}-${opts.end}…`),
    attempts: [],
    datasets: {},
  };
}

export async function startBenchmark(run: BenchmarkRun, opts: StartBenchmarkOpts): Promise<void> {
  if (_running) return;
  _running = true;
  _cancelRequested = false;

  try {
    const flush = async () => {
      await writeRun(run);
      await upsertIndexEntry(toSummary(run));
    };

    const rangeSize = opts.end - opts.start + 1;
    const discovery = await discoverAvailableIds(opts.baseUrl, opts.start, opts.end);

    if (_cancelRequested) {
      run.running = false;
      run.completedAt = new Date().toISOString();
      run.log = appendLog(run.log, "Cancelled by user before any requests were made");
      await flush();
      return;
    }

    const work = buildShuffledWorkList(discovery.ids, opts.repeat);
    const total = work.length;

    const schemaSuffix = ` (schema_model=${opts.schemaModel}, schema_version=${opts.schemaVersion})`;
    if (!discovery.discovered) {
      run.log = appendLog(run.log, `Could not list datasets from ${opts.baseUrl} — falling back to the raw range ${opts.start}-${opts.end} (${rangeSize} ids × ${opts.repeat} repeats = ${total} requests), concurrency ${opts.concurrency}${schemaSuffix}`);
    } else if (discovery.ids.length === 0) {
      run.log = appendLog(run.log, `No datasets found in range ${opts.start}-${opts.end} (checked ${rangeSize} ids) — nothing to benchmark`);
    } else {
      run.log = appendLog(run.log, `Found ${discovery.ids.length} of ${rangeSize} ids in range ${opts.start}-${opts.end} — benchmarking ${discovery.ids.length} ids × ${opts.repeat} repeats = ${total} requests, concurrency ${opts.concurrency}${schemaSuffix}`);
    }
    run.progress = { completed: 0, total };
    await flush();

    const limit = pLimit(opts.concurrency);
    let completed = 0;

    await Promise.all(
      work.map((item) =>
        limit(async () => {
          if (_cancelRequested) return;

          const startedAt = performance.now();
          let httpStatus: number | undefined;
          let error: string | undefined;
          let success = false;
          let metadata: unknown = null;

          try {
            const qs = new URLSearchParams({ schema_model: opts.schemaModel, schema_version: opts.schemaVersion });
            const res = await fetch(`${opts.baseUrl}/datasets/${item.id}?${qs}`, {
              signal: AbortSignal.timeout(15_000),
            });
            httpStatus = res.status;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as { data: unknown };
            metadata = extractMetadata(body.data);
            success = metadata != null;
            if (!success) error = "No metadata found in response";
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }

          const durationMs = performance.now() - startedAt;

          run.attempts.push({
            id: item.id,
            repeatIndex: item.repeatIndex,
            durationMs,
            success,
            httpStatus,
            error,
          });

          if (success) {
            run.datasets[item.id] = {
              id: item.id,
              lastFetchedAt: new Date().toISOString(),
              success: true,
              metadata,
              fingerprint: fingerprint(metadata),
            };
          } else if (!run.datasets[item.id]) {
            run.datasets[item.id] = {
              id: item.id,
              lastFetchedAt: new Date().toISOString(),
              success: false,
              metadata: null,
              fingerprint: "",
            };
          }

          completed++;
          run.progress = { completed, total };

          if (completed % 25 === 0 || completed === total) {
            const failed = run.attempts.filter((a) => !a.success).length;
            run.log = appendLog(run.log, `${completed}/${total} done (${completed - failed} ok, ${failed} failed)`);
            try {
              await flush();
            } catch (writeErr) {
              console.error("Benchmark progress flush failed:", writeErr);
            }
          }
        })
      )
    );

    const successDurations = run.attempts.filter((a) => a.success).map((a) => a.durationMs);
    const baseStats = computeStats(successDurations);
    run.stats = { ...baseStats, successRate: total > 0 ? successDurations.length / total : 0 };
    run.running = false;
    run.completedAt = new Date().toISOString();
    run.log = appendLog(
      run.log,
      _cancelRequested
        ? `Cancelled by user — ${run.attempts.length}/${total} requests completed`
        : `Benchmark complete — ${successDurations.length}/${total} succeeded`
    );
    await flush();
  } finally {
    _running = false;
    _cancelRequested = false;
  }
}

export interface ComparisonIdResult {
  id: number;
  changed: boolean;
  diffs: DiffEntry[];
}

export interface RunComparison {
  common: ComparisonIdResult[];
  onlyInA: number[];
  onlyInB: number[];
}

function lastAttemptFor(run: BenchmarkRun, id: number) {
  for (let i = run.attempts.length - 1; i >= 0; i--) {
    if (run.attempts[i].id === id) return run.attempts[i];
  }
  return undefined;
}

function describeOutcome(success: boolean, attempt: ReturnType<typeof lastAttemptFor>): string {
  if (success) return "fetched successfully";
  if (attempt?.httpStatus) return `HTTP ${attempt.httpStatus}`;
  return attempt?.error ?? "fetch failed";
}

export function buildComparison(runA: BenchmarkRun, runB: BenchmarkRun): RunComparison {
  const idsA = new Set(Object.keys(runA.datasets).map(Number));
  const idsB = new Set(Object.keys(runB.datasets).map(Number));

  const common: ComparisonIdResult[] = [];
  const onlyInA: number[] = [];
  const onlyInB: number[] = [];

  for (const id of idsA) {
    if (!idsB.has(id)) {
      onlyInA.push(id);
      continue;
    }
    const a = runA.datasets[id];
    const b = runB.datasets[id];
    if (!a.success || !b.success) {
      // Only flag "changed" (and surface a diff explaining why) when the fetch
      // outcome itself differs between runs — two runs that both failed the
      // same way are unchanged, not "changed" with a suspiciously empty diff.
      if (a.success === b.success) {
        common.push({ id, changed: false, diffs: [] });
      } else {
        const outcomeDiff: DiffEntry = {
          path: "$ (fetch outcome)",
          before: describeOutcome(a.success, lastAttemptFor(runA, id)),
          after: describeOutcome(b.success, lastAttemptFor(runB, id)),
          changeType: "changed",
        };
        common.push({ id, changed: true, diffs: [outcomeDiff] });
      }
      continue;
    }
    if (a.fingerprint === b.fingerprint) {
      common.push({ id, changed: false, diffs: [] });
    } else {
      const diffs = diffValues(a.metadata, b.metadata);
      common.push({ id, changed: diffs.length > 0, diffs });
    }
  }
  for (const id of idsB) {
    if (!idsA.has(id)) onlyInB.push(id);
  }

  common.sort((a, b) => a.id - b.id);
  onlyInA.sort((a, b) => a - b);
  onlyInB.sort((a, b) => a - b);

  return { common, onlyInA, onlyInB };
}
