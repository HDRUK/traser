import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import os from "os";
import path from "path";

import { createFsDriver } from "../../app/lib/storage/fsDriver.server";

let root: string;
const roots: string[] = [];

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "traser-storage-"));
  roots.push(root);
});

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("fs driver", () => {
  it("returns null for a missing object rather than throwing", async () => {
    expect(await createFsDriver(root).readJson("nope.json")).toBeNull();
  });

  it("round-trips JSON and creates intermediate directories", async () => {
    const driver = createFsDriver(root);
    await driver.writeJson("benchmark/run-1.json", { id: "run-1" });

    expect(await driver.readJson("benchmark/run-1.json")).toEqual({ id: "run-1" });
    expect(existsSync(path.join(root, "benchmark", "run-1.json"))).toBe(true);
  });

  it("leaves no .tmp file behind after a write", async () => {
    const driver = createFsDriver(root);
    await driver.writeJson("a.json", { a: 1 });

    const keys = (await driver.list("")).map((o) => o.key);
    expect(keys).toEqual(["a.json"]);
  });

  // The GCS driver lists with delimiter "/", so the fs driver has to agree:
  // listing the root must not surface benchmark/ objects as dataset pids.
  it("lists only direct children, skipping subdirectories and .tmp files", async () => {
    const driver = createFsDriver(root);
    writeFileSync(path.join(root, "a.json"), "{}");
    writeFileSync(path.join(root, "stale.json.tmp"), "{}");
    mkdirSync(path.join(root, "benchmark"));
    writeFileSync(path.join(root, "benchmark", "run-1.json"), "{}");

    expect((await driver.list("")).map((o) => o.key)).toEqual(["a.json"]);
    expect((await driver.list("benchmark/")).map((o) => o.key)).toEqual([
      "benchmark/run-1.json",
    ]);
    expect(await driver.list("datasets/")).toEqual([]);
  });

  it("reports size and modification time for listed objects", async () => {
    const driver = createFsDriver(root);
    await driver.writeJson("a.json", { a: 1 });

    const [object] = await driver.list("");
    expect(object.size).toBeGreaterThan(0);
    expect(object.updatedAtMs).toBeGreaterThan(0);
  });

  it("returns an empty list for a prefix that does not exist", async () => {
    expect(await createFsDriver(root).list("benchmark/")).toEqual([]);
  });

  it("treats removing a missing object as a no-op", async () => {
    await expect(createFsDriver(root).remove("gone.json")).resolves.toBeUndefined();
  });
});
