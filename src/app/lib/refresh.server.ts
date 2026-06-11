import { readFile, writeFile } from "fs/promises";
import path from "path";
import pLimit from "p-limit";
import {
  getDatasetIndex,
  getDataDir,
  invalidateDatasetIndex,
  readTestResults,
  writeTestResults,
} from "./cache.server";
import { listSchemas, translateAndValidate } from "./traser.server";

let _running = false;

const GATEWAY_API_URL =
  process.env.GATEWAY_API_URL ?? "https://api.prod.hdruk.cloud/api/v2";

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function appendLog(log: string[], entry: string): string[] {
  const next = [...log, `[${ts()}] ${entry}`];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

export function isRefreshRunning(): boolean {
  return _running;
}

// ─── Phase 1: sync dataset files from the Gateway API ─────────────────────

async function syncDatasetsFromApi(
  cacheLog: string[],
  flush: (log: string[]) => Promise<void>
): Promise<string[]> {
  let log = cacheLog;

  // 1. Fetch ACTIVE + DRAFT dataset lists (IDs only — fast)
  let allApiIds: string[];
  try {
    const fetchStatus = async (status: string) => {
      const res = await fetch(
        `${GATEWAY_API_URL}/datasets?with_metadata=0&status=${status}&per_page=100000`,
        { signal: AbortSignal.timeout(30_000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status} for status=${status}`);
      const body = (await res.json()) as { data: Array<{ id: string | number }> };
      return body.data.map((d) => String(d.id));
    };

    const [activeIds, draftIds] = await Promise.all([fetchStatus("ACTIVE"), fetchStatus("DRAFT").catch(() => [] as string[])]);
    allApiIds = Array.from(new Set([...activeIds, ...draftIds]));
    log = appendLog(log, `API returned ${activeIds.length} active + ${draftIds.length} draft datasets`);
    await flush(log);
  } catch (err) {
    log = appendLog(log, `Dataset sync skipped — API unreachable: ${err}`);
    await flush(log);
    return log;
  }

  // 2. Build set of already-synced gateway IDs from the in-memory index
  //    (getDatasetIndex() reads all existing data/{pid}.json files)
  const existingDatasets = await getDatasetIndex();
  const existingGatewayIds = new Set(
    existingDatasets.map((d) => d.gatewayId).filter(Boolean)
  );
  const toFetch = allApiIds.filter((id) => !existingGatewayIds.has(id));

  log = appendLog(
    log,
    `${existingGatewayIds.size} already cached · ${toFetch.length} new to fetch`
  );
  await flush(log);

  if (toFetch.length === 0) {
    return log;
  }

  // 3. Fetch and save missing datasets with concurrency limit
  const limit = pLimit(20);
  const dataDir = getDataDir();
  let fetched = 0;
  let fetchFailed = 0;

  await Promise.all(
    toFetch.map((id) =>
      limit(async () => {
        try {
          const res = await fetch(`${GATEWAY_API_URL}/datasets/${id}`, {
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as { data: { pid?: string } };
          const dataset = body.data;
          const pid = dataset?.pid;
          if (!pid) return;

          await writeFile(
            path.join(dataDir, `${pid}.json`),
            JSON.stringify(dataset),
            "utf-8"
          );
          fetched++;
        } catch (err) {
          fetchFailed++;
          console.error(`Failed to fetch dataset ${id}:`, err);
        }

        // Log progress every 100 fetches
        const done = fetched + fetchFailed;
        if (done % 100 === 0 || done === toFetch.length) {
          log = appendLog(
            log,
            `Fetched ${fetched}/${toFetch.length} new datasets${fetchFailed > 0 ? ` (${fetchFailed} failed)` : ""}`
          );
          await flush(log);
        }
      })
    )
  );

  // 4. Bust the index so getDatasetIndex() re-reads all files including new ones
  invalidateDatasetIndex();

  const total = existingGatewayIds.size + fetched;
  log = appendLog(log, `Dataset sync complete — ${total} total datasets on disk`);
  await flush(log);

  return log;
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

  type DataFile = { versions?: Array<{ metadata?: { metadata?: unknown } }> };
  const parsed = JSON.parse(content) as DataFile;
  const metadata = parsed?.versions?.[0]?.metadata?.metadata ?? null;
  if (!metadata) return;

  if (!cache.results[pid]) cache.results[pid] = {};

  await Promise.all(
    Object.entries(schemas).flatMap(([schema, versions]) =>
      (versions as string[]).map(async (version) => {
        try {
          cache.results[pid][`${schema}:${version}`] = await translateAndValidate(
            metadata,
            schema,
            version
          );
        } catch (err) {
          console.error(`runSingleDataset ${pid} ${schema}:${version}:`, err);
          cache.results[pid][`${schema}:${version}`] = { translated: false, valid: false };
        }
      })
    )
  );

  cache.lastUpdated = new Date().toISOString();
  await writeTestResults(cache);
}

// ─── Full refresh (background job) ────────────────────────────────────────

export async function runAllTests(): Promise<void> {
  if (_running) return;
  _running = true;

  try {
    const cache = await readTestResults();
    cache.running = true;
    cache.results = cache.results ?? {};
    cache.log = cache.log ?? [];
    cache.progress = { completed: 0, total: 0 };

    // Flush helper — writes intermediate state to disk
    const flush = async (log: string[]) => {
      cache.log = log;
      await writeTestResults({ ...cache, running: true });
    };

    // ── Phase 1: sync dataset files from the API ──────────────────────────
    cache.log = appendLog(cache.log, "Phase 1: syncing datasets from API…");
    await writeTestResults(cache);

    cache.log = await syncDatasetsFromApi(cache.log, flush);

    // ── Phase 2: run translation tests ───────────────────────────────────
    const [datasets, schemas] = await Promise.all([
      getDatasetIndex(),
      listSchemas(),
    ]);

    const schemaCombos: Array<{ schema: string; version: string }> = [];
    for (const [schema, versions] of Object.entries(schemas)) {
      for (const version of versions as string[]) {
        schemaCombos.push({ schema, version });
      }
    }

    const pending = datasets.flatMap(({ pid }) =>
      schemaCombos
        .filter(({ schema, version }) => !cache.results[pid]?.[`${schema}:${version}`])
        .map((combo) => ({ pid, ...combo }))
    );

    const total = pending.length;
    cache.progress = { completed: 0, total };
    cache.log = appendLog(
      cache.log,
      `Phase 2: testing — ${datasets.length} datasets × ${schemaCombos.length} schemas = ${total} pending`
    );
    await writeTestResults(cache);

    const limit = pLimit(10);
    let completed = 0;
    let succeeded = 0;
    let failed = 0;
    const dataDir = getDataDir();

    const tasks = pending.map(({ pid, schema, version }) =>
      limit(async () => {
        try {
          const content = await readFile(path.join(dataDir, `${pid}.json`), "utf-8");
          type DataFile = { versions?: Array<{ metadata?: { metadata?: unknown } }> };
          const data = JSON.parse(content) as DataFile;
          const metadata = data?.versions?.[0]?.metadata?.metadata ?? null;
          if (!metadata) return;

          const result = await translateAndValidate(metadata, schema, version);
          if (!cache.results[pid]) cache.results[pid] = {};
          cache.results[pid][`${schema}:${version}`] = result;

          if (result.translated) succeeded++;
          else failed++;
        } catch (err) {
          console.error(`Error testing ${pid} ${schema}:${version}:`, err);
          if (!cache.results[pid]) cache.results[pid] = {};
          cache.results[pid][`${schema}:${version}`] = { translated: false, valid: false };
          failed++;
        }

        completed++;
        cache.progress = { completed, total };

        if (completed % 50 === 0 || completed === total) {
          cache.log = appendLog(
            cache.log ?? [],
            `${completed}/${total} done (${succeeded} ok, ${failed} failed)`
          );
          try {
            await writeTestResults({ ...cache, running: true });
          } catch (writeErr) {
            console.error("Progress flush failed:", writeErr);
          }
        }
      })
    );

    await Promise.all(tasks);

    cache.log = appendLog(
      cache.log ?? [],
      `Finished — ${succeeded} translated ok, ${failed} failed`
    );
    cache.lastUpdated = new Date().toISOString();
    cache.running = false;
    await writeTestResults(cache);
  } finally {
    _running = false;
  }
}
