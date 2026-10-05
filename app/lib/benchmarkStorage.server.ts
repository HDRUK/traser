import { createHash } from "crypto";
import { getStorage } from "./storage/index.server";

const BENCHMARK_PREFIX = "benchmark/";
const INDEX_KEY = `${BENCHMARK_PREFIX}index.json`;

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

export async function readIndex(): Promise<BenchmarkRunSummary[]> {
  return (await getStorage().readJson<BenchmarkRunSummary[]>(INDEX_KEY)) ?? [];
}

// Serialise writes through a single promise chain, same technique as
// writeTestResults() in cache.server.ts. Across instances the benchmark lease
// is what keeps a single writer in play.
let _indexWriteChain: Promise<void> = Promise.resolve();

export function writeIndex(entries: BenchmarkRunSummary[]): Promise<void> {
  const snapshot = [...entries];
  _indexWriteChain = _indexWriteChain
    .then(() => getStorage().writeJson(INDEX_KEY, snapshot))
    .catch((err) => {
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

function runKey(runId: string): string {
  return `${BENCHMARK_PREFIX}${runId}.json`;
}

export async function readRun(runId: string): Promise<BenchmarkRun | null> {
  return getStorage().readJson<BenchmarkRun>(runKey(runId));
}

// One write chain is sufficient since only a single benchmark run is active
// at a time, and history runs are never mutated after completion (except delete).
let _runWriteChain: Promise<void> = Promise.resolve();

export function writeRun(run: BenchmarkRun): Promise<void> {
  const snapshot = structuredClone(run);
  _runWriteChain = _runWriteChain
    .then(() => getStorage().writeJson(runKey(run.id), snapshot))
    .catch((err) => {
      console.error("writeRun failed:", err);
    });
  return _runWriteChain;
}

export async function deleteRun(runId: string): Promise<void> {
  await removeIndexEntry(runId);
  await getStorage().remove(runKey(runId));
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
