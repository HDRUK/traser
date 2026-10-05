import pLimit from "p-limit";
import { getStorage } from "./storage/index.server";
import { getCoordination, DATASET_INDEX_COUNTER } from "./coordination/index.server";

// Datasets and benchmark runs each sit under their own prefix so a bucket
// lifecycle rule can expire them on different schedules. The two control
// objects stay at the root, outside every rule's reach.
const DATASET_PREFIX = "datasets/";
const RESULTS_KEY = "test-results.json";
const CONTROL_KEY = "test-results-control.json";

export interface DatasetEntry {
  pid: string;
  title: string;
  gatewayId?: string;
  status?: string;  // "ACTIVE" | "DRAFT" — from the saved gateway data
}

export interface TestResult {
  translated: boolean;
  valid: boolean;
  reason?: string;
  translateBody?: unknown;  // full TRASER /translate response on failure
  validateBody?: unknown;   // full TRASER /validate response on failure
  at?: string;              // ISO timestamp the result was recorded (for body-TTL trimming)
}

// A dataset ID that appeared in the Gateway API's list endpoint
// (`/datasets?status=...`) but whose individual `/datasets/{id}` fetch failed —
// i.e. it exists, but the direct endpoint doesn't work for it. Cleared as soon
// as a subsequent fetch for the same ID succeeds; pruned if the ID drops out of
// the Gateway's list entirely (nothing left to retry).
export interface FetchFailure {
  id: string;
  error: string;
  status?: number;
  attempts: number;
  firstFailedAt: string;
  lastFailedAt: string;
  // Best-effort title looked up from the Gateway's list endpoint (which returns
  // it even for datasets whose individual /datasets/{id} fetch errors out) —
  // undefined until enrichFetchFailureTitles() fills it in.
  title?: string;
}

// Small, rewritten often: this is what a running refresh flushes every few
// seconds. The heavy results matrix lives in its own object and is written on a
// much slower cadence, so progress updates cost kilobytes rather than tens of
// megabytes. `running` is deliberately absent — it is derived from the refresh
// lease, so it cannot go stale when a process dies mid-run.
export interface ResultsControl {
  lastUpdated?: string;
  progress?: { completed: number; total: number };
  log?: string[];
  fetchFailures?: Record<string, FetchFailure>;
}

export interface ResultsCache extends ResultsControl {
  results: Record<string, Record<string, TestResult>>;
}

const INDEX_READ_CONCURRENCY = 25;
const DELETE_CONCURRENCY = 25;
const GENERATION_CHECK_MS = 5_000;

let _datasetIndex: DatasetEntry[] | null = null;
let _datasetIndexGeneration = -1;
let _generationCheckedAt = 0;
let _knownGeneration = 0;

function isDatasetKey(key: string): boolean {
  return key.endsWith(".json");
}

function pidFromKey(key: string): string {
  return key.slice(DATASET_PREFIX.length).replace(/\.json$/, "");
}

export function datasetKey(pid: string): string {
  return `${DATASET_PREFIX}${pid}.json`;
}

async function datasetIndexGeneration(): Promise<number> {
  const now = Date.now();
  if (now - _generationCheckedAt < GENERATION_CHECK_MS) return _knownGeneration;
  _generationCheckedAt = now;
  _knownGeneration = await getCoordination().readCounter(DATASET_INDEX_COUNTER);
  return _knownGeneration;
}

export async function listCachedPids(): Promise<string[]> {
  const objects = await getStorage().list(DATASET_PREFIX);
  return objects.filter((o) => isDatasetKey(o.key)).map((o) => pidFromKey(o.key));
}

export async function readDataset(pid: string): Promise<unknown | null> {
  return getStorage().readJson(datasetKey(pid));
}

export async function writeDataset(pid: string, dataset: unknown): Promise<void> {
  await getStorage().writeJson(datasetKey(pid), dataset);
}

export async function getDatasetIndex(): Promise<DatasetEntry[]> {
  const generation = await datasetIndexGeneration();
  if (_datasetIndex && generation === _datasetIndexGeneration) return _datasetIndex;

  const storage = getStorage();
  const keys = (await storage.list(DATASET_PREFIX)).map((o) => o.key).filter(isDatasetKey);

  const limit = pLimit(INDEX_READ_CONCURRENCY);
  const datasets = await Promise.all(
    keys.map((key) => limit(async (): Promise<DatasetEntry> => {
      const pid = pidFromKey(key);
      try {
        const data = await storage.readJson<Record<string, unknown>>(key);
        const meta = extractMetadata(data);
        const rawTitle: unknown = meta?.summary?.title;
        const title: string = typeof rawTitle === "string" ? rawTitle : pid;
        const gatewayId: string | undefined = meta?.required?.gatewayId ?? undefined;
        const status: string | undefined = (data?.status as string) ?? undefined;
        return { pid, title, gatewayId, status };
      } catch {
        return { pid, title: pid };
      }
    }))
  );

  _datasetIndexGeneration = generation;
  _datasetIndex = datasets.sort((a, b) => a.title.localeCompare(b.title));
  return _datasetIndex;
}

export async function readResultsControl(): Promise<ResultsControl> {
  const storage = getStorage();
  const control = await storage.readJson<ResultsControl>(CONTROL_KEY);
  if (control) return control;

  // Pre-split caches kept these fields inside test-results.json. Read them back
  // once so an upgrade doesn't lose the log, failures and last-updated stamp.
  const legacy = await storage.readJson<ResultsCache>(RESULTS_KEY);
  if (!legacy) return {};
  const { lastUpdated, progress, log, fetchFailures } = legacy;
  return { lastUpdated, progress, log, fetchFailures };
}

export async function readTestResults(): Promise<ResultsCache> {
  const [control, stored] = await Promise.all([
    readResultsControl(),
    getStorage().readJson<ResultsCache>(RESULTS_KEY),
  ]);
  return { ...control, results: stored?.results ?? {} };
}

// Serialise writes per object through a promise chain so two concurrent callers
// in this process can't interleave on the same key. Across processes the
// refresh lease is what keeps a single writer in play.
const _writeChains = new Map<string, Promise<void>>();

function enqueueWrite(key: string, value: unknown): Promise<void> {
  const previous = _writeChains.get(key) ?? Promise.resolve();
  const next = previous
    .then(() => getStorage().writeJson(key, value))
    .catch((err) => {
      console.error(`write ${key} failed:`, err);
    });
  _writeChains.set(key, next);
  return next;
}

export function writeResultsControl(control: ResultsControl): Promise<void> {
  return enqueueWrite(CONTROL_KEY, { ...control });
}

export function writeTestResults(cache: ResultsCache): Promise<void> {
  const { results, ...control } = cache;
  return Promise.all([
    enqueueWrite(RESULTS_KEY, { results }),
    writeResultsControl(control),
  ]).then(() => undefined);
}

export async function invalidateDatasetIndex(): Promise<void> {
  _datasetIndex = null;
  _generationCheckedAt = 0;
  await getCoordination().bumpCounter(DATASET_INDEX_COUNTER);
}

export async function clearAllDatasetFiles(): Promise<void> {
  const storage = getStorage();
  const keys = (await storage.list(DATASET_PREFIX)).map((o) => o.key).filter(isDatasetKey);
  const limit = pLimit(DELETE_CONCURRENCY);
  await Promise.all(keys.map((key) => limit(() => storage.remove(key))));
  await invalidateDatasetIndex();
}

/**
 * Pull metadata out of a saved gateway dataset record.
 *
 * Active datasets store the final translated/cleaned form at `versions[0].metadata.metadata`.
 * Drafts haven't been processed yet, so they only have `versions[0].metadata.original_metadata`.
 * Returns `null` if neither exists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractMetadata(data: any): any {
  const ver = data?.versions?.[0]?.metadata;
  if (!ver) return null;
  if (data?.status === "DRAFT") {
    return ver.original_metadata ?? ver.metadata ?? null;
  }
  return ver.metadata ?? ver.original_metadata ?? null;
}
