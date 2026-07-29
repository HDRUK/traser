import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  utimesSync,
  readdirSync,
} from "fs";
import os from "os";
import path from "path";

const DAY = 24 * 60 * 60 * 1000;

let dataDir: string;
let benchmarkDir: string;
// Imported dynamically AFTER env is set, because the module reads DATA_DIR and
// the TTL knobs into constants at load time.
let retention: typeof import("../../app/lib/retention.server");

function writeDataset(pid: string, ageDays: number) {
  const file = path.join(dataDir, `${pid}.json`);
  writeFileSync(
    file,
    JSON.stringify({ status: "ACTIVE", versions: [{ metadata: { metadata: {} } }] })
  );
  const t = (Date.now() - ageDays * DAY) / 1000;
  utimesSync(file, t, t);
}

function iso(ageDays: number): string {
  return new Date(Date.now() - ageDays * DAY).toISOString();
}

function clearDir(dir: string) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "traser-retention-"));
  benchmarkDir = path.join(dataDir, "benchmark");
  process.env.DATA_DIR = dataDir;
  process.env.DATA_CACHE_TTL_DAYS = "7";
  process.env.RESULT_BODY_TTL_DAYS = "3";
  process.env.BENCHMARK_TTL_DAYS = "30";
  delete process.env.DATA_MAX_BYTES;
  delete process.env.DATA_MAX_FILES;
  retention = await import("../../app/lib/retention.server");
});

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

beforeEach(() => {
  clearDir(dataDir);
});

describe("sweepDatasetFiles", () => {
  it("deletes {pid}.json older than the TTL but keeps recent ones", async () => {
    writeDataset("old-1", 10);
    writeDataset("old-2", 8);
    writeDataset("fresh", 1);

    const { deleted } = await retention.sweepDatasetFiles();

    expect(deleted).toBe(2);
    expect(existsSync(path.join(dataDir, "old-1.json"))).toBe(false);
    expect(existsSync(path.join(dataDir, "old-2.json"))).toBe(false);
    expect(existsSync(path.join(dataDir, "fresh.json"))).toBe(true);
  });

  it("never deletes protected files (test-results.json / datasets-index.json)", async () => {
    const results = path.join(dataDir, "test-results.json");
    const index = path.join(dataDir, "datasets-index.json");
    writeFileSync(results, JSON.stringify({ results: {} }));
    writeFileSync(index, JSON.stringify([]));
    // Backdate them well beyond the TTL.
    const t = (Date.now() - 30 * DAY) / 1000;
    utimesSync(results, t, t);
    utimesSync(index, t, t);
    writeDataset("old", 30);

    await retention.sweepDatasetFiles();

    expect(existsSync(results)).toBe(true);
    expect(existsSync(index)).toBe(true);
    expect(existsSync(path.join(dataDir, "old.json"))).toBe(false);
  });
});

describe("trimTestResults", () => {
  it("strips old embedded bodies, keeps recent ones, and prunes orphan pids", async () => {
    // pidA is on disk; pidB is not (orphan).
    writeDataset("pidA", 1);

    const cache = {
      results: {
        pidA: {
          "HDRUK:2.1.2": {
            translated: false,
            valid: false,
            reason: "boom",
            translateBody: { big: "x".repeat(1000) },
            at: iso(5), // older than RESULT_BODY_TTL_DAYS (3)
          },
          "GWDM:1.0": {
            translated: true,
            valid: true,
            validateBody: { big: "y".repeat(1000) },
            at: iso(1), // recent — keep the body
          },
        },
        pidB: {
          "HDRUK:2.1.2": { translated: true, valid: true, at: iso(1) },
        },
      },
    };
    writeFileSync(path.join(dataDir, "test-results.json"), JSON.stringify(cache));

    const { trimmed, prunedPids } = await retention.trimTestResults();

    expect(trimmed).toBe(1);
    expect(prunedPids).toBe(1);

    const after = JSON.parse(
      readFileSync(path.join(dataDir, "test-results.json"), "utf-8")
    );
    // orphan gone
    expect(after.results.pidB).toBeUndefined();
    // old cell: body stripped, pass/fail + reason kept
    const oldCell = after.results.pidA["HDRUK:2.1.2"];
    expect(oldCell.translateBody).toBeUndefined();
    expect(oldCell.translated).toBe(false);
    expect(oldCell.reason).toBe("boom");
    // recent cell: body retained
    expect(after.results.pidA["GWDM:1.0"].validateBody).toBeDefined();
  });
});

describe("sweepBenchmarkRuns", () => {
  it("deletes completed runs older than the TTL, keeps recent + in-progress", async () => {
    mkdirSync(benchmarkDir, { recursive: true });
    const runs = [
      { id: "old", running: false, completedAt: iso(40) },
      { id: "recent", running: false, completedAt: iso(5) },
      { id: "inprogress", running: true },
    ];
    writeFileSync(path.join(benchmarkDir, "index.json"), JSON.stringify(runs));
    for (const r of runs) {
      writeFileSync(path.join(benchmarkDir, `${r.id}.json`), JSON.stringify({ id: r.id }));
    }

    const { deleted } = await retention.sweepBenchmarkRuns();

    expect(deleted).toBe(1);
    expect(existsSync(path.join(benchmarkDir, "old.json"))).toBe(false);
    expect(existsSync(path.join(benchmarkDir, "recent.json"))).toBe(true);
    expect(existsSync(path.join(benchmarkDir, "inprogress.json"))).toBe(true);

    const idx = JSON.parse(readFileSync(path.join(benchmarkDir, "index.json"), "utf-8"));
    expect(idx.map((r: { id: string }) => r.id).sort()).toEqual(["inprogress", "recent"]);
  });
});
