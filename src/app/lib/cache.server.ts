import { readFile, writeFile, rename, readdir } from "fs/promises";
import path from "path";

// DATA_DIR env var lets the combined service (CWD = traser/) override the default.
// Standalone web/ dev keeps the default: CWD is web/, so ../data = traser/data.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "../data");
const RESULTS_FILE = path.join(DATA_DIR, "test-results.json");

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
}

export interface ResultsCache {
  lastUpdated?: string;
  running?: boolean;
  progress?: { completed: number; total: number };
  log?: string[];
  results: Record<string, Record<string, TestResult>>;
}

// In-process memo so 584-file reads only happen once per server start
let _datasetIndex: DatasetEntry[] | null = null;

export async function getDatasetIndex(): Promise<DatasetEntry[]> {
  if (_datasetIndex) return _datasetIndex;

  const files = await readdir(DATA_DIR);
  const jsonFiles = files.filter(
    (f) =>
      f.endsWith(".json") &&
      f !== "test-results.json" &&
      f !== "datasets-index.json"
  );

  const datasets = await Promise.all(
    jsonFiles.map(async (filename): Promise<DatasetEntry> => {
      const pid = filename.replace(".json", "");
      try {
        const content = await readFile(path.join(DATA_DIR, filename), "utf-8");
        const data = JSON.parse(content);
        const meta = data?.versions?.[0]?.metadata?.metadata;
        const title: string = meta?.summary?.title ?? pid;
        const gatewayId: string | undefined = meta?.required?.gatewayId ?? undefined;
        const status: string | undefined = data?.status ?? undefined;
        return { pid, title, gatewayId, status };
      } catch {
        return { pid, title: pid };
      }
    })
  );

  _datasetIndex = datasets.sort((a, b) => a.title.localeCompare(b.title));
  return _datasetIndex;
}

export async function readTestResults(): Promise<ResultsCache> {
  try {
    const content = await readFile(RESULTS_FILE, "utf-8");
    return JSON.parse(content) as ResultsCache;
  } catch {
    return { results: {} };
  }
}

// Serialise all writes through a single promise chain to prevent concurrent
// writeFile calls on the same path (which can interleave and corrupt the JSON).
let _writeChain: Promise<void> = Promise.resolve();

export function writeTestResults(cache: ResultsCache): Promise<void> {
  // Snapshot the data synchronously before queuing so late mutations don't
  // affect what gets written.
  const content = JSON.stringify(cache, null, 2);
  _writeChain = _writeChain.then(async () => {
    const tmp = RESULTS_FILE + ".tmp";
    await writeFile(tmp, content, "utf-8");
    await rename(tmp, RESULTS_FILE); // atomic swap — reader always gets a complete file
  }).catch((err) => {
    console.error("writeTestResults failed:", err);
  });
  return _writeChain;
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function invalidateDatasetIndex(): void {
  _datasetIndex = null;
}
