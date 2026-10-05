import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import {
  listCachedPids,
  extractMetadata,
  invalidateDatasetIndex,
  readDataset,
  writeDataset,
  readResultsControl,
  readTestResults,
  writeResultsControl,
  writeTestResults,
  type FetchFailure,
} from "./cache.server";
import { getCoordination, REFRESH_LEASE, type LeaseState } from "./coordination/index.server";
import { listSchemas, translateAndValidate, REFERENCE_SCHEMA, REFERENCE_VERSION } from "./traser.server";

const OWNER_ID = randomUUID();

let _lease: LeaseState | null = null;
let _cancelRequested = false;
let _abort: AbortController | null = null;
let _lastRenewAt = 0;

// A run that stops renewing — because the process died, or the instance was
// scaled away — loses the lease once the TTL lapses, and the next refresh can
// start. That replaces the old in-process stall detector, which could not see
// runs owned by another instance.
const LEASE_TTL_MS = 5 * 60_000;
const RENEW_INTERVAL_MS = 10_000;
const FETCH_TIMEOUT_MS = 15_000;
const RECORD_DEADLINE_MS = 45_000;
const FLUSH_INTERVAL_MS = 5_000;
const RESULTS_FLUSH_INTERVAL_MS = 60_000;
const SYNC_CONCURRENCY = Number(process.env.SYNC_CONCURRENCY) || 8;
const BACKOFF_MS = 5_000;
const PROGRESS_LOG_INTERVAL_MS = 15_000;
const TEST_CONCURRENCY = Number(process.env.TEST_CONCURRENCY) || 10;

function getGatewayApiUrl(): string {
  const url = process.env.GATEWAY_API_URL;
  if (!url) throw new Error("GATEWAY_API_URL must be set — no default to production is provided");
  return url;
}

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function appendLog(log: string[], entry: string): string[] {
  const next = [...log, `[${ts()}] ${entry}`];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

export async function isRefreshRunning(): Promise<boolean> {
  return (await getCoordination().read(REFRESH_LEASE)) !== null;
}

// Renewing is throttled rather than done on every tick so the hot loops do not
// turn into one Redis round trip per dataset. Losing the lease here means some
// other instance took over, so the run stands down.
async function markProgress(): Promise<void> {
  if (!_lease) return;
  const now = Date.now();
  if (now - _lastRenewAt < RENEW_INTERVAL_MS) return;
  _lastRenewAt = now;

  const held = await getCoordination()
    .renew(REFRESH_LEASE, _lease, LEASE_TTL_MS)
    .catch((err) => {
      console.error("[refresh] lease renewal failed:", err);
      return false;
    });
  if (!held) standDown();
}

function standDown(): void {
  _cancelRequested = true;
  _abort?.abort();
  _abort = null;
  _lease = null;
}

function requestSignal(timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return _abort ? AbortSignal.any([_abort.signal, timeout]) : timeout;
}

// An undrained error body keeps its keep-alive connection checked out of
// undici's pool. Ninety of those against one origin exhausted the pool mid-run
// and left the remaining requests queued behind it, waiting forever.
async function discardBody(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => undefined);
}

type FetchOutcome =
  | { ok: true }
  | { ok: false; error: string; status?: number; timedOut?: boolean };

function isTimeout(err: unknown): boolean {
  const name = (err as Error)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

// Belt and braces around the abort signals: whatever goes wrong inside, every
// record settles within RECORD_DEADLINE_MS so the phase cannot hang on one of
// them. The signal is aborted too, so the abandoned work stops rather than
// lingering on a connection.
async function withRecordDeadline(
  work: (signal: AbortSignal) => Promise<FetchOutcome>
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const signal = AbortSignal.any([
    ...(_abort ? [_abort.signal] : []),
    controller.signal,
    AbortSignal.timeout(FETCH_TIMEOUT_MS),
  ]);

  let abortTimer: NodeJS.Timeout | undefined;
  let deadlineTimer: NodeJS.Timeout | undefined;
  const deadline = new Promise<FetchOutcome>((resolve) => {
    abortTimer = setTimeout(() => controller.abort(), RECORD_DEADLINE_MS);
    deadlineTimer = setTimeout(
      () => resolve({ ok: false, error: `No response after ${RECORD_DEADLINE_MS / 1000}s`, timedOut: true }),
      RECORD_DEADLINE_MS + 1_000
    );
  });

  try {
    return await Promise.race([work(signal), deadline]);
  } finally {
    clearTimeout(abortTimer);
    clearTimeout(deadlineTimer);
  }
}

// Releasing the lease is what cancels: the owning instance — this one or
// another — sees the renewal fail and winds down cooperatively.
export async function requestCancelRefresh(): Promise<boolean> {
  const released = await getCoordination().release(REFRESH_LEASE);
  if (!released) return false;
  if (_lease) standDown();

  const control = await readResultsControl();
  control.log = appendLog(control.log ?? [], "Cancelled by user");
  await writeResultsControl(control);
  return true;
}

// ─── Phase 1: sync dataset files from the Gateway API ─────────────────────

function recordFetchFailure(
  fetchFailures: Record<string, FetchFailure>,
  id: string,
  error: string,
  status?: number
): void {
  const now = new Date().toISOString();
  const existing = fetchFailures[id];
  fetchFailures[id] = {
    id,
    error,
    status,
    attempts: (existing?.attempts ?? 0) + 1,
    firstFailedAt: existing?.firstFailedAt ?? now,
    lastFailedAt: now,
  };
}

// The Gateway's own `/datasets/{id}` endpoint (with or without a
// schema_model/schema_version translation request) only ever resolves
// ACTIVE datasets — it 404s unconditionally for DRAFT ones, even though
// those same IDs appear in `/datasets?status=DRAFT`. So DRAFT records are
// never fetched individually: the list call itself is made with
// `with_metadata=1`, which returns each draft's full `latest_metadata` body
// inline, and that's used to build the cached record directly.
interface ListItem {
  id: string | number;
  pid?: string;
  status?: string;
  latest_metadata?: unknown;
}

// Even `with_metadata=0` list rows include `pid` — and the Gateway reuses one
// `pid` across many top-level `id`s (they're revisions/versions of the same
// dataset; one pid had 17 distinct ids on prod). Fetching every id individually
// both wastes ~17x the requests and races multiple ids writing the same
// `data/{pid}.json` concurrently (seen in practice as an ENOENT on the tmp-file
// rename, when one id's write finished and deleted the tmp file out from under
// another). Dedupe to one representative id per pid — the highest id, as a
// proxy for "most recent revision" — before fetching.
function dedupeByPid(records: ListItem[]): ListItem[] {
  const byPid = new Map<string, ListItem>();
  for (const rec of records) {
    if (!rec.pid) continue;
    const existing = byPid.get(rec.pid);
    if (!existing || Number(rec.id) > Number(existing.id)) byPid.set(rec.pid, rec);
  }
  return Array.from(byPid.values());
}

// Best-effort enrichment: the Gateway's list endpoint returns a title even for
// datasets whose individual fetch errors out (e.g. "failed to translate"), but
// only a modest per_page is safe — with_metadata=1 at very high per_page has
// been observed to exhaust the API's own PHP memory limit. Paginates at a safe
// page size and stops as soon as every needed id is found.
async function enrichFetchFailureTitles(
  fetchFailures: Record<string, FetchFailure>,
  isCurrent: () => boolean
): Promise<void> {
  const needed = new Set(
    Object.values(fetchFailures)
      .filter((f) => !f.title)
      .map((f) => f.id)
  );
  if (needed.size === 0) return;

  const PER_PAGE = 200;
  const MAX_PAGES = 10;
  for (let page = 1; page <= MAX_PAGES && needed.size > 0; page++) {
    if (!isCurrent()) return;
    await markProgress();
    let body: { data: ListItem[]; last_page?: number };
    try {
      const res = await fetch(
        `${getGatewayApiUrl()}/datasets?with_metadata=1&status=ACTIVE&per_page=${PER_PAGE}&page=${page}`,
        { signal: requestSignal(30_000) }
      );
      if (!res.ok) {
        await discardBody(res);
        break;
      }
      body = await res.json();
    } catch {
      break;
    }
    for (const rec of body.data) {
      const id = String(rec.id);
      if (!needed.has(id)) continue;
      const lm = rec.latest_metadata as { title?: string; short_title?: string } | undefined;
      const title = lm?.title ?? lm?.short_title;
      if (title) {
        fetchFailures[id].title = title;
        needed.delete(id);
      }
    }
    if (!body.last_page || page >= body.last_page) break;
  }
}

async function syncDatasetsFromApi(
  cacheLog: string[],
  fetchFailures: Record<string, FetchFailure>,
  flush: (log: string[]) => Promise<void>,
  isCurrent: () => boolean
): Promise<string[]> {
  let log = cacheLog;

  // 1. Fetch ACTIVE dataset ids+pids (fast, no metadata) and DRAFT datasets
  //    with their metadata inline (since we can't fetch drafts individually).
  let activeRecords: ListItem[];
  let draftRecords: ListItem[];
  try {
    const res = await fetch(
      `${getGatewayApiUrl()}/datasets?with_metadata=0&status=ACTIVE&per_page=100000`,
      { signal: requestSignal(30_000) }
    );
    if (!res.ok) {
      await discardBody(res);
      throw new Error(`HTTP ${res.status} for status=ACTIVE`);
    }
    const body = (await res.json()) as { data: ListItem[] };
    activeRecords = body.data;

    draftRecords = await (async () => {
      try {
        const res = await fetch(
          `${getGatewayApiUrl()}/datasets?with_metadata=1&status=DRAFT&per_page=100000`,
          { signal: requestSignal(30_000) }
        );
        if (!res.ok) {
          await discardBody(res);
          throw new Error(`HTTP ${res.status} for status=DRAFT`);
        }
        const body = (await res.json()) as { data: ListItem[] };
        return body.data;
      } catch {
        return [] as ListItem[];
      }
    })();

    log = appendLog(log, `API returned ${activeRecords.length} active + ${draftRecords.length} draft datasets`);
    await flush(log);
  } catch (err) {
    log = appendLog(log, `Dataset sync skipped — API unreachable: ${err}`);
    await flush(log);
    return log;
  }

  // id -> pid for every raw list row (not just the deduped representatives) —
  // used below to prune fetch failures for ids whose pid got cached via a
  // different representative id in this or an earlier run.
  const idToPid = new Map<string, string>();
  for (const rec of [...activeRecords, ...draftRecords]) {
    if (rec.pid) idToPid.set(String(rec.id), rec.pid);
  }

  // Prune fetch-failure records for ids that no longer appear in the Gateway's
  // own list at all — nothing left there to retry against.
  const apiIdSet = new Set(idToPid.keys());
  for (const id of Object.keys(fetchFailures)) {
    if (!apiIdSet.has(id)) delete fetchFailures[id];
  }

  const dedupedActive = dedupeByPid(activeRecords);
  const dedupedDrafts = dedupeByPid(draftRecords);

  // 2. Build set of already-synced pids straight from the cache directory
  //    listing — only the filenames are needed, so the files stay unread.
  const existingPids = new Set(await listCachedPids());

  // Now that pids satisfied by an earlier sync are known, drop any remaining
  // fetch failure whose id maps to an already-cached pid (e.g. it failed under
  // one id, but a different id sharing the same pid succeeded since).
  for (const id of Object.keys(fetchFailures)) {
    const pid = idToPid.get(id);
    if (pid && existingPids.has(pid)) delete fetchFailures[id];
  }

  const toFetchActive = dedupedActive.filter((r) => r.pid && !existingPids.has(r.pid));
  const toWriteDrafts = dedupedDrafts.filter((r) => r.pid && !existingPids.has(r.pid));

  const retryCount = toFetchActive.filter((r) => fetchFailures[String(r.id)]).length;
  log = appendLog(
    log,
    `${existingPids.size} already cached · ${toFetchActive.length} new active to fetch · ${toWriteDrafts.length} new drafts` +
      (retryCount > 0 ? ` (${retryCount} retrying previous failures)` : "")
  );
  await flush(log);

  // 3. Write DRAFT datasets straight from the list response — no per-ID
  //    fetch needed (and none would succeed anyway).
  let draftsWritten = 0;
  for (const record of toWriteDrafts) {
    const id = String(record.id);
    if (!record.pid) {
      recordFetchFailure(fetchFailures, id, "Draft list entry missing pid");
      continue;
    }
    if (!record.latest_metadata) {
      recordFetchFailure(fetchFailures, id, "Draft list entry missing latest_metadata");
      continue;
    }
    try {
      const dataset = { id: record.id, pid: record.pid, status: "DRAFT", versions: [record.latest_metadata] };
      await writeDataset(record.pid, dataset);
      draftsWritten++;
      delete fetchFailures[id];
    } catch (err) {
      recordFetchFailure(fetchFailures, id, err instanceof Error ? err.message : String(err));
      console.error(`Failed to write draft dataset ${id}:`, err);
    }
  }
  if (toWriteDrafts.length > 0) {
    log = appendLog(log, `Wrote ${draftsWritten}/${toWriteDrafts.length} draft datasets from list metadata`);
    await flush(log);
  }

  if (toFetchActive.length === 0) {
    await invalidateDatasetIndex();
    if (Object.keys(fetchFailures).length > 0) await enrichFetchFailureTitles(fetchFailures, isCurrent);
    return log;
  }

  // 4. Fetch and save missing ACTIVE datasets with concurrency limit
  const limit = pLimit(SYNC_CONCURRENCY);
  let fetched = 0;
  let fetchFailed = 0;
  let timedOut = 0;
  let lastLogAt = Date.now();
  let backoffUntil = 0;

  const fetchActiveRecord = async (id: string, signal: AbortSignal): Promise<FetchOutcome> => {
    try {
      // translateAndValidate() assumes every cached {pid}.json is already
      // shaped like REFERENCE_SCHEMA:REFERENCE_VERSION — request the Gateway
      // API's own translation so that assumption holds, instead of caching
      // whichever schema the dataset happens to be natively stored as.
      const qs = new URLSearchParams({
        schema_model: REFERENCE_SCHEMA,
        schema_version: REFERENCE_VERSION,
      });
      const res = await fetch(`${getGatewayApiUrl()}/datasets/${id}?${qs}`, { signal });
      if (!res.ok) {
        await discardBody(res);
        return { ok: false, error: `HTTP ${res.status}`, status: res.status };
      }
      const dataset = ((await res.json()) as { data: { pid?: string } }).data;
      const pid = dataset?.pid;
      if (!pid) return { ok: false, error: "Response missing pid", status: res.status };

      await writeDataset(pid, dataset);
      return { ok: true };
    } catch (err) {
      if (!isTimeout(err)) console.error(`Failed to fetch dataset ${id}:`, err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        timedOut: isTimeout(err),
      };
    }
  };

  await Promise.all(
    toFetchActive.map((record) =>
      limit(async () => {
        if (!isCurrent()) return;

        // A timeout means the API already has more queued than it can serve, so
        // every slot pauses before adding to that queue rather than replacing
        // the timed-out request immediately.
        const wait = backoffUntil - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        if (!isCurrent()) return;

        const id = String(record.id);
        const outcome = await withRecordDeadline((signal) => fetchActiveRecord(id, signal));

        if (outcome.ok) {
          fetched++;
          delete fetchFailures[id];
        } else {
          fetchFailed++;
          recordFetchFailure(fetchFailures, id, outcome.error, outcome.status);
          if (outcome.timedOut) {
            timedOut++;
            backoffUntil = Date.now() + BACKOFF_MS;
          }
        }
        await markProgress();

        // Time-based, not every N fetches: the tail of a run can slow to a
        // crawl when the API starts queueing, and a count-based line makes that
        // indistinguishable from a hang because the next one never arrives.
        const done = fetched + fetchFailed;
        if (done === toFetchActive.length || Date.now() - lastLogAt >= PROGRESS_LOG_INTERVAL_MS) {
          lastLogAt = Date.now();
          log = appendLog(
            log,
            `Fetched ${fetched}/${toFetchActive.length} new active datasets` +
              (fetchFailed > 0 ? ` (${fetchFailed} failed` : "") +
              (timedOut > 0 ? `, ${timedOut} timed out` : "") +
              (fetchFailed > 0 ? ")" : "")
          );
          await flush(log);
        }
      })
    )
  );

  if (!isCurrent()) return log;

  // 5. Bust the index so getDatasetIndex() re-reads all files including new ones
  await invalidateDatasetIndex();

  const total = existingPids.size + fetched + draftsWritten;
  const remainingFailures = Object.keys(fetchFailures).length;

  if (remainingFailures > 0) {
    log = appendLog(log, `Looking up titles for ${remainingFailures} failed dataset(s)…`);
    await flush(log);
    await enrichFetchFailureTitles(fetchFailures, isCurrent);
  }

  log = appendLog(
    log,
    `Dataset sync complete — ${total} total datasets on disk` +
      (remainingFailures > 0 ? ` · ${remainingFailures} dataset(s) failing to fetch (see Fetch Failures tab)` : "")
  );
  await flush(log);

  return log;
}

// A cached file can legitimately disappear between the directory listing and
// the read — a Deep Refresh clears data/ and the retention sweeper evicts from
// it — so a missing file is a skip, not an error.
async function readDatasetMetadata(pid: string) {
  try {
    return extractMetadata(await readDataset(pid));
  } catch (err) {
    console.error(`Error reading dataset ${pid}:`, err);
    return null;
  }
}

// ─── Per-dataset test (per-row action) ────────────────────────────────────

export async function runSingleDataset(pid: string): Promise<void> {
  const [schemas, cache] = await Promise.all([listSchemas(), readTestResults()]);

  const parsed = await readDataset(pid);
  if (!parsed) {
    console.error(`runSingleDataset: no cached dataset for pid ${pid}`);
    return;
  }

  const metadata = extractMetadata(parsed);
  if (!metadata) return;

  if (!cache.results[pid]) cache.results[pid] = {};

  await Promise.all(
    Object.entries(schemas).flatMap(([schema, versions]) =>
      (versions as string[]).map(async (version) => {
        try {
          cache.results[pid][`${schema}:${version}`] = {
            ...(await translateAndValidate(metadata, schema, version)),
            at: new Date().toISOString(),
          };
        } catch (err) {
          console.error(`runSingleDataset ${pid} ${schema}:${version}:`, err);
          cache.results[pid][`${schema}:${version}`] = {
            translated: false,
            valid: false,
            at: new Date().toISOString(),
          };
        }
      })
    )
  );

  cache.lastUpdated = new Date().toISOString();
  await writeTestResults(cache);
}

// ─── Full refresh (background job) ────────────────────────────────────────

export async function runAllTests(): Promise<void> {
  const coordination = getCoordination();
  const lease = await coordination.acquire(REFRESH_LEASE, OWNER_ID, LEASE_TTL_MS);
  if (!lease) return;

  _lease = lease;
  _cancelRequested = false;
  _abort = new AbortController();
  _lastRenewAt = Date.now();

  const isCurrent = () => _lease?.generation === lease.generation;

  try {
    const cache = await readTestResults();
    cache.results = cache.results ?? {};
    cache.fetchFailures = cache.fetchFailures ?? {};
    cache.log = cache.log ?? [];
    cache.progress = { completed: 0, total: 0 };

    // Two cadences: the control document is small enough to write on every
    // progress tick, the results matrix is tens of megabytes and is only
    // written periodically and at the end.
    const flush = async (log: string[]) => {
      if (!isCurrent()) return;
      cache.log = log;
      await writeResultsControl(cache);
    };

    // ── Phase 1: sync dataset files from the API ──────────────────────────
    cache.log = appendLog(cache.log, "Phase 1: syncing datasets from API…");
    await flush(cache.log);

    // syncDatasetsFromApi mutates cache.fetchFailures in place (add on failure,
    // delete on a subsequent success) — flush() picks up the changes because it
    // closes over the same `cache` object.
    cache.log = await syncDatasetsFromApi(cache.log, cache.fetchFailures, flush, isCurrent);

    if (!isCurrent()) return;

    // ── Phase 2: run translation tests ───────────────────────────────────
    const [pids, schemas] = await Promise.all([
      listCachedPids(),
      listSchemas(),
    ]);

    const schemaCombos: Array<{ schema: string; version: string }> = [];
    for (const [schema, versions] of Object.entries(schemas)) {
      for (const version of versions as string[]) {
        schemaCombos.push({ schema, version });
      }
    }

    const pending = pids
      .map((pid) => ({
        pid,
        combos: schemaCombos.filter(
          ({ schema, version }) => !cache.results[pid]?.[`${schema}:${version}`]
        ),
      }))
      .filter(({ combos }) => combos.length > 0);

    const total = pending.reduce((sum, { combos }) => sum + combos.length, 0);
    cache.progress = { completed: 0, total };
    cache.log = appendLog(
      cache.log,
      `Phase 2: testing — ${pids.length} datasets × ${schemaCombos.length} schemas = ${total} pending`
    );
    await flush(cache.log);

    const limit = pLimit(TEST_CONCURRENCY);
    let completed = 0;
    let succeeded = 0;
    let failed = 0;
    let lastFlushAt = Date.now();
    let lastResultsFlushAt = Date.now();

    const tasks = pending.map(({ pid, combos }) =>
      limit(async () => {
        if (!isCurrent()) return;

        const metadata = await readDatasetMetadata(pid);
        if (!metadata) return;

        if (!cache.results[pid]) cache.results[pid] = {};

        for (const { schema, version } of combos) {
          if (!isCurrent()) return;
          try {
            const result = await translateAndValidate(metadata, schema, version);
            cache.results[pid][`${schema}:${version}`] = {
              ...result,
              at: new Date().toISOString(),
            };
            if (result.translated) succeeded++;
            else failed++;
          } catch (err) {
            console.error(`Error testing ${pid} ${schema}:${version}:`, err);
            cache.results[pid][`${schema}:${version}`] = {
              translated: false,
              valid: false,
              at: new Date().toISOString(),
            };
            failed++;
          }
          completed++;
        }

        cache.progress = { completed, total };
        await markProgress();

        if (completed === total || Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) {
          lastFlushAt = Date.now();
          cache.log = appendLog(
            cache.log ?? [],
            `${completed}/${total} done (${succeeded} ok, ${failed} failed)`
          );
          try {
            await flush(cache.log);
            if (Date.now() - lastResultsFlushAt >= RESULTS_FLUSH_INTERVAL_MS) {
              lastResultsFlushAt = Date.now();
              await writeTestResults(cache);
            }
          } catch (writeErr) {
            console.error("Progress flush failed:", writeErr);
          }
        }
      })
    );

    await Promise.all(tasks);

    if (!isCurrent()) return;

    cache.log = appendLog(
      cache.log ?? [],
      _cancelRequested
        ? `Cancelled by user — ${completed}/${total} tested (${succeeded} ok, ${failed} failed)`
        : `Finished — ${succeeded} translated ok, ${failed} failed`
    );
    cache.lastUpdated = new Date().toISOString();
    await writeTestResults(cache);
  } finally {
    if (isCurrent()) {
      await coordination.release(REFRESH_LEASE, OWNER_ID).catch((err) => {
        console.error("[refresh] lease release failed:", err);
      });
      _lease = null;
      _cancelRequested = false;
      _abort = null;
    }
  }
}
