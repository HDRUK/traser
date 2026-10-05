import path from "path";
import { envEnum } from "../env.server";
import { createFsDriver } from "./fsDriver.server";
import { createGcsDriver } from "./gcsDriver.server";
import type { StorageDriver } from "./types";

export type { StorageDriver, StoredObject } from "./types";

const BACKENDS = ["fs", "gcs"] as const;

export function getDataDir(): string {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), "./data");
}

function normalisePrefix(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function build(): StorageDriver {
  const backend = envEnum("STORAGE_BACKEND", BACKENDS, "fs");
  if (backend === "fs") return createFsDriver(getDataDir());

  const bucket = process.env.STORAGE_BUCKET?.trim();
  if (!bucket) {
    throw new Error("STORAGE_BUCKET must be set when STORAGE_BACKEND=gcs");
  }
  return createGcsDriver(bucket, normalisePrefix(process.env.STORAGE_PREFIX));
}

let _driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!_driver) {
    _driver = build();
    console.log(`[storage] backend ${_driver.describe}`);
  }
  return _driver;
}

export function resetStorageForTests(): void {
  _driver = null;
}
