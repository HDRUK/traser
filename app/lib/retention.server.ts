import { readdir, stat, unlink } from "fs/promises";
import path from "path";
import {
  getDataDir,
  invalidateDatasetIndex,
  readTestResults,
  writeTestResults,
} from "./cache.server";
import { isRefreshRunning } from "./refresh.server";
import { readIndex, deleteRun } from "./benchmarkStorage.server";

// ─── Configuration (all env-driven, all optional) ─────────────────────────
//
// The disk cache under DATA_DIR is a derived, re-fetchable cache: deleting a
// {pid}.json just means the next "Refresh All" re-downloads it. These knobs
// bound its growth on the VM. Set a TTL to 0 (or negative) to disable that
// particular sweep; leave DATA_MAX_* unset to disable the size guardrails.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Delete {pid}.json dataset files older than this many days (by mtime).
const DATA_CACHE_TTL_DAYS = intEnv("DATA_CACHE_TTL_DAYS", 7);
// Delete completed benchmark runs older than this many days (by completedAt).
const BENCHMARK_TTL_DAYS = intEnv("BENCHMARK_TTL_DAYS", 30);
// Strip the heavy embedded translate/validate bodies from result cells older
// than this many days (keeps the boolean pass/fail + reason).
const RESULT_BODY_TTL_DAYS = intEnv("RESULT_BODY_TTL_DAYS", 3);
// Hard size guardrails, applied after the TTL sweep. 0 = disabled.
const DATA_MAX_BYTES = intEnv("DATA_MAX_BYTES", 0);
const DATA_MAX_FILES = intEnv("DATA_MAX_FILES", 0);

const SWEEP_INTERVAL_MS = DAY_MS; // re-check once a day

// Never touch these top-level files (they are not dataset caches).
const PROTECTED_FILES = new Set(["test-results.json", "datasets-index.json"]);

function isDatasetFile(name: string): boolean {
  return name.endsWith(".json") && !name.endsWith(".tmp") && !PROTECTED_FILES.has(name);
}

interface FileInfo {
  name: string;
  full: string;
  mtimeMs: number;
  size: number;
}

async function listDatasetFiles(dataDir: string): Promise<FileInfo[]> {
  let names: string[];
  try {
    names = await readdir(dataDir);
  } catch {
    return [];
  }
  const infos: FileInfo[] = [];
  for (const name of names.filter(isDatasetFile)) {
    const full = path.join(dataDir, name);
    try {
      const info = await stat(full);
      if (info.isFile()) {
        infos.push({ name, full, mtimeMs: info.mtimeMs, size: info.size });
      }
    } catch {
      // vanished between readdir and stat — ignore
    }
  }
  return infos;
}

// ─── {pid}.json TTL sweep + size guardrails ───────────────────────────────

export async function sweepDatasetFiles(): Promise<{ deleted: number; freedBytes: number }> {
  const dataDir = getDataDir();
  let files = await listDatasetFiles(dataDir);
  let deleted = 0;
  let freedBytes = 0;

  const remove = async (f: FileInfo) => {
    try {
      await unlink(f.full);
      deleted++;
      freedBytes += f.size;
      return true;
    } catch (err) {
      console.error(`[retention] failed to delete ${f.name}:`, err);
      return false;
    }
  };

  // Pass 1 — TTL by mtime
  if (DATA_CACHE_TTL_DAYS > 0) {
    const cutoff = Date.now() - DATA_CACHE_TTL_DAYS * DAY_MS;
    const survivors: FileInfo[] = [];
    for (const f of files) {
      if (f.mtimeMs < cutoff) await remove(f);
      else survivors.push(f);
    }
    files = survivors;
  }

  // Pass 2 — size/count guardrails: evict oldest-mtime first until under caps
  if (DATA_MAX_FILES > 0 || DATA_MAX_BYTES > 0) {
    files.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
    let totalBytes = files.reduce((s, f) => s + f.size, 0);
    let count = files.length;
    let i = 0;
    while (
      ((DATA_MAX_FILES > 0 && count > DATA_MAX_FILES) ||
        (DATA_MAX_BYTES > 0 && totalBytes > DATA_MAX_BYTES)) &&
      i < files.length
    ) {
      const f = files[i++];
      if (await remove(f)) {
        totalBytes -= f.size;
        count--;
      }
    }
  }

  if (deleted > 0) {
    invalidateDatasetIndex();
    console.log(
      `[retention] deleted ${deleted} dataset file(s), freed ${(freedBytes / 1e6).toFixed(1)} MB`
    );
  }
  return { deleted, freedBytes };
}

// ─── test-results.json body trimming + orphan pruning ─────────────────────

export async function trimTestResults(): Promise<{ trimmed: number; prunedPids: number }> {
  const cache = await readTestResults();
  if (!cache.results) return { trimmed: 0, prunedPids: 0 };

  // Current on-disk pid set (post dataset sweep) for orphan pruning.
  const onDisk = new Set(
    (await listDatasetFiles(getDataDir())).map((f) => f.name.replace(/\.json$/, ""))
  );

  const bodyCutoff =
    RESULT_BODY_TTL_DAYS > 0 ? Date.now() - RESULT_BODY_TTL_DAYS * DAY_MS : null;

  let trimmed = 0;
  let prunedPids = 0;

  for (const pid of Object.keys(cache.results)) {
    if (!onDisk.has(pid)) {
      delete cache.results[pid];
      prunedPids++;
      continue;
    }
    if (bodyCutoff === null) continue;
    const cells = cache.results[pid];
    for (const key of Object.keys(cells)) {
      const cell = cells[key];
      const age = cell.at ? Date.parse(cell.at) : NaN;
      // Trim when the cell is older than the body-TTL. Cells with no timestamp
      // (written before this change) are treated as old and trimmed too.
      const stale = Number.isNaN(age) || age < bodyCutoff;
      if (stale && (cell.translateBody !== undefined || cell.validateBody !== undefined)) {
        delete cell.translateBody;
        delete cell.validateBody;
        trimmed++;
      }
    }
  }

  if (trimmed > 0 || prunedPids > 0) {
    await writeTestResults(cache);
    console.log(
      `[retention] trimmed ${trimmed} result body/bodies, pruned ${prunedPids} orphan dataset(s) from test-results.json`
    );
  }
  return { trimmed, prunedPids };
}

// ─── benchmark run TTL ─────────────────────────────────────────────────────

export async function sweepBenchmarkRuns(): Promise<{ deleted: number }> {
  if (BENCHMARK_TTL_DAYS <= 0) return { deleted: 0 };
  const cutoff = Date.now() - BENCHMARK_TTL_DAYS * DAY_MS;
  const runs = await readIndex();
  let deleted = 0;
  for (const run of runs) {
    // Protect in-progress runs and runs that never completed (no timestamp).
    if (run.running || !run.completedAt) continue;
    const completed = Date.parse(run.completedAt);
    if (!Number.isNaN(completed) && completed < cutoff) {
      await deleteRun(run.id);
      deleted++;
    }
  }
  if (deleted > 0) console.log(`[retention] deleted ${deleted} old benchmark run(s)`);
  return { deleted };
}

// ─── Orchestration ─────────────────────────────────────────────────────────

function allDisabled(): boolean {
  return (
    DATA_CACHE_TTL_DAYS <= 0 &&
    BENCHMARK_TTL_DAYS <= 0 &&
    RESULT_BODY_TTL_DAYS <= 0 &&
    DATA_MAX_BYTES <= 0 &&
    DATA_MAX_FILES <= 0
  );
}

export async function runRetentionSweep(): Promise<void> {
  // A refresh actively reads/writes these same files (and phase 1 relies on
  // {pid}.json presence to decide what to re-fetch), so never sweep during one.
  if (isRefreshRunning()) {
    console.log("[retention] skipped — refresh in progress");
    return;
  }
  try {
    await sweepDatasetFiles();
    await trimTestResults(); // runs after dataset sweep so orphan pruning sees deletions
    await sweepBenchmarkRuns();
  } catch (err) {
    console.error("[retention] sweep failed:", err);
  }
}

let _started = false;

/**
 * Idempotent — safe to call from every request (e.g. the root loader). Starts a
 * once-per-server-lifetime retention sweep on startup plus a daily interval.
 * Matches the lazy-singleton convention used by ensureLoaded() in schema.server.ts.
 */
export function ensureRetentionSweeperStarted(): void {
  if (_started) return;
  _started = true;
  if (allDisabled()) {
    console.log("[retention] all retention limits disabled — sweeper not started");
    return;
  }
  runRetentionSweep().catch((err) => console.error("[retention] initial sweep failed:", err));
  const timer = setInterval(() => {
    runRetentionSweep().catch((err) => console.error("[retention] periodic sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
  timer.unref?.(); // don't keep the process alive solely for this timer
}
