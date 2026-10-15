import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import os from "os";
import path from "path";

import {
  datasetKey,
  readTestResults,
  readResultsControl,
  writeTestResults,
  writeResultsControl,
} from "../../app/lib/cache.server";
import { resetStorageForTests } from "../../app/lib/storage/index.server";
import { resetCoordinationForTests } from "../../app/lib/coordination/index.server";

let dataDir: string;
const dirs: string[] = [];

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "traser-cache-"));
  dirs.push(dataDir);
  process.env.DATA_DIR = dataDir;
  delete process.env.STORAGE_BACKEND;
  delete process.env.COORDINATION_BACKEND;
  resetStorageForTests();
  resetCoordinationForTests();
});

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("results cache", () => {
  it("keeps the heavy matrix and the hot control document in separate objects", async () => {
    await writeTestResults({
      results: { pidA: { "HDRUK:2.1.2": { translated: true, valid: true } } },
      log: ["started"],
      progress: { completed: 1, total: 2 },
    });

    const matrix = JSON.parse(readFileSync(path.join(dataDir, "test-results.json"), "utf-8"));
    const control = JSON.parse(
      readFileSync(path.join(dataDir, "test-results-control.json"), "utf-8")
    );

    expect(Object.keys(matrix)).toEqual(["results"]);
    expect(control.log).toEqual(["started"]);
    expect(control.results).toBeUndefined();
  });

  it("round-trips both halves through readTestResults", async () => {
    await writeTestResults({
      results: { pidA: { "GWDM:1.0": { translated: true, valid: false } } },
      lastUpdated: "2026-01-01T00:00:00.000Z",
      log: ["done"],
    });

    const cache = await readTestResults();
    expect(cache.results.pidA["GWDM:1.0"].valid).toBe(false);
    expect(cache.lastUpdated).toBe("2026-01-01T00:00:00.000Z");
    expect(cache.log).toEqual(["done"]);
  });

  // Caches written before the split kept the control fields inside
  // test-results.json; an upgrade must not drop the log or the failure list.
  it("recovers control fields from a pre-split test-results.json", async () => {
    writeFileSync(
      path.join(dataDir, "test-results.json"),
      JSON.stringify({
        results: { pidA: { "HDRUK:2.1.2": { translated: true, valid: true } } },
        lastUpdated: "2025-12-25T00:00:00.000Z",
        log: ["legacy entry"],
        fetchFailures: { "7": { id: "7", error: "boom", attempts: 1, firstFailedAt: "x", lastFailedAt: "y" } },
      })
    );

    const cache = await readTestResults();
    expect(cache.lastUpdated).toBe("2025-12-25T00:00:00.000Z");
    expect(cache.log).toEqual(["legacy entry"]);
    expect(cache.fetchFailures?.["7"].error).toBe("boom");
    expect(cache.results.pidA["HDRUK:2.1.2"].translated).toBe(true);
  });

  it("writes the control document without touching the matrix", async () => {
    await writeTestResults({ results: { pidA: {} } });
    await writeResultsControl({ log: ["progress"] });

    const matrix = JSON.parse(readFileSync(path.join(dataDir, "test-results.json"), "utf-8"));
    expect(matrix.results.pidA).toEqual({});
    expect((await readResultsControl()).log).toEqual(["progress"]);
  });

  it("reports an empty cache when nothing has been written", async () => {
    expect(await readTestResults()).toEqual({ results: {} });
    expect(existsSync(path.join(dataDir, "test-results.json"))).toBe(false);
  });

  // The bucket lifecycle rules expire datasets and benchmark runs on different
  // schedules, which only works if each sits under its own prefix.
  it("keys datasets under a prefix the control objects never share", async () => {
    expect(datasetKey("abc")).toBe("datasets/abc.json");
  });
});
