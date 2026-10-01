import { readFile, writeFile, rename } from "fs/promises";
import path from "path";
import pLimit from "p-limit";
import {
  listCachedPids,
  getDataDir,
  extractMetadata,
  invalidateDatasetIndex,
  readTestResults,
  writeTestResults,
  type FetchFailure,
} from "./cache.server";
import { listSchemas, translateAndValidate, REFERENCE_SCHEMA, REFERENCE_VERSION } from "./traser.server";

let _running = false;
let _cancelRequested = false;
let _generation = 0;
let _abort: AbortController | null = null;
let _lastProgressAt = 0;

const STALL_TIMEOUT_MS = 10 * 60_000;
const FLUSH_INTERVAL_MS = 5_000;
const SYNC_CONCURRENCY = Number(process.env.SYNC_CONCURRENCY) || 40;
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

function isRefreshStalled(): boolean {
  return _running && Date.now() - _lastProgressAt > STALL_TIMEOUT_MS;
}

export function isRefreshRunning(): boolean {
  return _running && !isRefreshStalled();
}

function markProgress(): void {
  _lastProgressAt = Date.now();
}

function requestSignal(timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return _abort ? AbortSignal.any([_abort.signal, timeout]) : timeout;
}

// Cooperative cancellation: loops below poll this between iterations so a
// long-running (or stuck, e.g. slow API) refresh can be stopped without
// restarting the dev server, and a new refresh started right after. Bumping the
// generation also orphans a run wedged somewhere unpollable.
function abandonCurrentRun(): void {
  _generation++;
  _cancelRequested = true;
  _abort?.abort();
  _abort = null;
  _running = false;
}

export function abandonStalledRefresh(): boolean {
  if (!isRefreshStalled()) return false;
  abandonCurrentRun();
  return true;
}

export async function requestCancelRefresh(): Promise<boolean> {
  if (!_running) return false;
  abandonCurrentRun();
  const cache = await readTestResults();
  cache.running = false;
  cache.log = appendLog(cache.log ?? [], "Cancelled by user");
  await writeTestResults(cache);
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
async function enrichFetchFailureTitles(fetchFailures: Record<string, FetchFailure>): Promise<void> {
  const needed = new Set(
    Object.values(fetchFailures)
      .filter((f) => !f.title)
      .map((f) => f.id)
  );
  if (needed.size === 0) return;

  const PER_PAGE = 200;
  const MAX_PAGES = 10;
  for (let page = 1; page <= MAX_PAGES && needed.size > 0; page++) {
    if (_cancelRequested) return;
    markProgress();
    let body: { data: ListItem[]; last_page?: number };
    try {
      const res = await fetch(
        `${getGatewayApiUrl()}/datasets?with_metadata=1&status=ACTIVE&per_page=${PER_PAGE}&page=${page}`,
        { signal: requestSignal(30_000) }
      );
      if (!res.ok) break;
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
  flush: (log: string[]) => Promise<void>
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
    if (!res.ok) throw new Error(`HTTP ${res.status} for status=ACTIVE`);
    const body = (await res.json()) as { data: ListItem[] };
    activeRecords = body.data;

    draftRecords = await (async () => {
      try {
        const res = await fetch(
          `${getGatewayApiUrl()}/datasets?with_metadata=1&status=DRAFT&per_page=100000`,
          { signal: requestSignal(30_000) }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status} for status=DRAFT`);
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

  const dataDir = getDataDir();

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
      const target = path.join(dataDir, `${record.pid}.json`);
      const tmp = `${target}.tmp`;
      await writeFile(tmp, JSON.stringify(dataset), "utf-8");
      await rename(tmp, target);
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
    invalidateDatasetIndex();
    if (Object.keys(fetchFailures).length > 0) await enrichFetchFailureTitles(fetchFailures);
    return log;
  }

  // 4. Fetch and save missing ACTIVE datasets with concurrency limit
  const limit = pLimit(SYNC_CONCURRENCY);
  let fetched = 0;
  let fetchFailed = 0;

  const fetchActiveRecord = async (record: ListItem): Promise<void> => {
    const id = String(record.id);
    try {
      // translateAndValidate() assumes every cached {pid}.json is already
      // shaped like REFERENCE_SCHEMA:REFERENCE_VERSION — request the Gateway
      // API's own translation so that assumption holds, instead of caching
      // whichever schema the dataset happens to be natively stored as.
      const qs = new URLSearchParams({
        schema_model: REFERENCE_SCHEMA,
        schema_version: REFERENCE_VERSION,
      });
      const res = await fetch(`${getGatewayApiUrl()}/datasets/${id}?${qs}`, {
        signal: requestSignal(15_000),
      });
      if (!res.ok) {
        fetchFailed++;
        recordFetchFailure(fetchFailures, id, `HTTP ${res.status}`, res.status);
        return;
      }
      const body = (await res.json()) as { data: { pid?: string } };
      const dataset = body.data;
      const pid = dataset?.pid;
      if (!pid) {
        fetchFailed++;
        recordFetchFailure(fetchFailures, id, "Response missing pid", res.status);
        return;
      }

      // Atomic write (tmp + rename) so a process kill mid-write can't leave
      // a truncated {pid}.json that getDatasetIndex() would silently drop.
      // The pid is unique and toFetchActive is deduplicated, so the tmp
      // name won't collide within a run.
      const target = path.join(dataDir, `${pid}.json`);
      const tmp = `${target}.tmp`;
      await writeFile(tmp, JSON.stringify(dataset), "utf-8");
      await rename(tmp, target);
      fetched++;
      delete fetchFailures[id];
    } catch (err) {
      fetchFailed++;
      recordFetchFailure(fetchFailures, id, err instanceof Error ? err.message : String(err));
      console.error(`Failed to fetch dataset ${id}:`, err);
    }
  };

  await Promise.all(
    toFetchActive.map((record) =>
      limit(async () => {
        if (_cancelRequested) return;
        await fetchActiveRecord(record);
        markProgress();

        // Log progress every 100 fetches
        const done = fetched + fetchFailed;
        if (done % 100 === 0 || done === toFetchActive.length) {
          log = appendLog(
            log,
            `Fetched ${fetched}/${toFetchActive.length} new active datasets${fetchFailed > 0 ? ` (${fetchFailed} failed)` : ""}`
          );
          await flush(log);
        }
      })
    )
  );

  if (_cancelRequested) return log;

  // 5. Bust the index so getDatasetIndex() re-reads all files including new ones
  invalidateDatasetIndex();

  const total = existingPids.size + fetched + draftsWritten;
  const remainingFailures = Object.keys(fetchFailures).length;

  if (remainingFailures > 0) {
    log = appendLog(log, `Looking up titles for ${remainingFailures} failed dataset(s)…`);
    await flush(log);
    await enrichFetchFailureTitles(fetchFailures);
  }

  log = appendLog(
    log,
    `Dataset sync complete — ${total} total datasets on disk` +
      (remainingFailures > 0 ? ` · ${remainingFailures} dataset(s) failing to fetch (see Fetch Failures tab)` : "")
  );
  await flush(log);

  return log;
}

async function readDatasetMetadata(dataDir: string, pid: string) {
  try {
    const content = await readFile(path.join(dataDir, `${pid}.json`), "utf-8");
    return extractMetadata(JSON.parse(content));
  } catch (err) {
    console.error(`Error reading dataset ${pid}:`, err);
    return null;
  }
}

// ─── Per-dataset test (per-row action) ────────────────────────────────────

export async function runSingleDataset(pid: string): Promise<void> {
  const [schemas, cache] = await Promise.all([listSchemas(), readTestResults()]);

  let content: string;
  try {
    content = await readFile(path.join(getDataDir(), `${pid}.json`), "utf-8");
  } catch {
    console.error(`runSingleDataset: file not found for pid ${pid}`);
    return;
  }

  const parsed = JSON.parse(content);
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
  if (isRefreshRunning()) return;
  if (_running) abandonCurrentRun();
  _running = true;
  _cancelRequested = false;
  _abort = new AbortController();
  const generation = ++_generation;
  markProgress();

  const isCurrent = () => generation === _generation;

  try {
    const cache = await readTestResults();
    cache.running = true;
    cache.results = cache.results ?? {};
    cache.fetchFailures = cache.fetchFailures ?? {};
    cache.log = cache.log ?? [];
    cache.progress = { completed: 0, total: 0 };

    // Flush helper — writes intermediate state to disk
    const flush = async (log: string[]) => {
      if (!isCurrent()) return;
      cache.log = log;
      await writeTestResults({ ...cache, running: true });
    };

    // ── Phase 1: sync dataset files from the API ──────────────────────────
    cache.log = appendLog(cache.log, "Phase 1: syncing datasets from API…");
    await writeTestResults(cache);

    // syncDatasetsFromApi mutates cache.fetchFailures in place (add on failure,
    // delete on a subsequent success) — flush() picks up the changes because it
    // closes over the same `cache` object.
    cache.log = await syncDatasetsFromApi(cache.log, cache.fetchFailures, flush);

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
    const dataDir = getDataDir();

    const tasks = pending.map(({ pid, combos }) =>
      limit(async () => {
        if (_cancelRequested) return;

        const metadata = await readDatasetMetadata(dataDir, pid);
        if (!metadata) return;

        if (!cache.results[pid]) cache.results[pid] = {};

        for (const { schema, version } of combos) {
          if (_cancelRequested) return;
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
        markProgress();

        if (completed === total || Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) {
          lastFlushAt = Date.now();
          cache.log = appendLog(
            cache.log ?? [],
            `${completed}/${total} done (${succeeded} ok, ${failed} failed)`
          );
          try {
            await flush(cache.log);
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
    cache.running = false;
    await writeTestResults(cache);
  } finally {
    if (isCurrent()) {
      _running = false;
      _cancelRequested = false;
      _abort = null;
    }
  }
}
