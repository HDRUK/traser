import { readFile, writeFile, rename, unlink, mkdir } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { getDataDir } from "./cache.server";

const BENCHMARK_DIR = path.join(getDataDir(), "benchmark");
const INDEX_FILE = path.join(BENCHMARK_DIR, "index.json");

export interface BenchmarkAttempt {
  id: number;
  repeatIndex: number;
  durationMs: number;
  success: boolean;
  httpStatus?: number;
  error?: string;
}

export interface DatasetSnapshot {
  id: number;
  lastFetchedAt: string;
  success: boolean;
  metadata: unknown | null;
  fingerprint: string;
}

export interface RunStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  successRate: number;
}

export interface BenchmarkRunSummary {
  id: string;
  label: string;
  baseUrl: string;
  schemaModel: string;
  schemaVersion: string;
  idRangeStart: number;
  idRangeEnd: number;
  repeat: number;
  concurrency: number;
  createdAt: string;
  completedAt?: string;
  running: boolean;
  progress: { completed: number; total: number };
  stats?: RunStats;
}

export interface BenchmarkRun extends BenchmarkRunSummary {
  log: string[];
  attempts: BenchmarkAttempt[];
  datasets: Record<string, DatasetSnapshot>;
}

async function ensureBenchmarkDir(): Promise<void> {
  await mkdir(BENCHMARK_DIR, { recursive: true });
}

export async function readIndex(): Promise<BenchmarkRunSummary[]> {
  try {
    const content = await readFile(INDEX_FILE, "utf-8");
    return JSON.parse(content) as BenchmarkRunSummary[];
  } catch {
    return [];
  }
}

// Serialise writes through a single promise chain + atomic tmp-write + rename,
// same technique as writeTestResults() in cache.server.ts.
let _indexWriteChain: Promise<void> = Promise.resolve();

export function writeIndex(entries: BenchmarkRunSummary[]): Promise<void> {
  const content = JSON.stringify(entries, null, 2);
  _indexWriteChain = _indexWriteChain.then(async () => {
    await ensureBenchmarkDir();
    const tmp = INDEX_FILE + ".tmp";
    await writeFile(tmp, content, "utf-8");
    await rename(tmp, INDEX_FILE);
  }).catch((err) => {
    console.error("writeIndex failed:", err);
  });
  return _indexWriteChain;
}

export async function upsertIndexEntry(summary: BenchmarkRunSummary): Promise<void> {
  const entries = await readIndex();
  const idx = entries.findIndex((e) => e.id === summary.id);
  if (idx === -1) entries.push(summary);
  else entries[idx] = summary;
  await writeIndex(entries);
}

export async function removeIndexEntry(runId: string): Promise<void> {
  const entries = await readIndex();
  await writeIndex(entries.filter((e) => e.id !== runId));
}

function runFile(runId: string): string {
  return path.join(BENCHMARK_DIR, `${runId}.json`);
}

export async function readRun(runId: string): Promise<BenchmarkRun | null> {
  try {
    const content = await readFile(runFile(runId), "utf-8");
    return JSON.parse(content) as BenchmarkRun;
  } catch {
    return null;
  }
}

// One write chain is sufficient since only a single benchmark run is active
// at a time, and history runs are never mutated after completion (except delete).
let _runWriteChain: Promise<void> = Promise.resolve();

export function writeRun(run: BenchmarkRun): Promise<void> {
  const content = JSON.stringify(run, null, 2);
  const file = runFile(run.id);
  _runWriteChain = _runWriteChain.then(async () => {
    await ensureBenchmarkDir();
    const tmp = file + ".tmp";
    await writeFile(tmp, content, "utf-8");
    await rename(tmp, file);
  }).catch((err) => {
    console.error("writeRun failed:", err);
  });
  return _runWriteChain;
}

export async function deleteRun(runId: string): Promise<void> {
  await removeIndexEntry(runId);
  try {
    await unlink(runFile(runId));
  } catch {
    // already gone
  }
}

export function toSummary(run: BenchmarkRun): BenchmarkRunSummary {
  const {
    id, label, baseUrl, schemaModel, schemaVersion, idRangeStart, idRangeEnd, repeat, concurrency,
    createdAt, completedAt, running, progress, stats,
  } = run;
  return { id, label, baseUrl, schemaModel, schemaVersion, idRangeStart, idRangeEnd, repeat, concurrency, createdAt, completedAt, running, progress, stats };
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "").digest("hex");
}
