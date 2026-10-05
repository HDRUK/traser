import { describe, it, expect, beforeEach } from "vitest";

import { getStorage, resetStorageForTests } from "../../app/lib/storage/index.server";
import { getCoordination, resetCoordinationForTests } from "../../app/lib/coordination/index.server";

beforeEach(() => {
  for (const name of [
    "STORAGE_BACKEND",
    "STORAGE_BUCKET",
    "STORAGE_PREFIX",
    "COORDINATION_BACKEND",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_KEY_PREFIX",
  ]) {
    delete process.env[name];
  }
  resetStorageForTests();
  resetCoordinationForTests();
});

describe("storage backend selection", () => {
  it("defaults to the local filesystem, so nothing is needed for local development", () => {
    expect(getStorage().describe).toMatch(/^fs:/);
  });

  it("rejects an unrecognised backend instead of silently falling back", () => {
    process.env.STORAGE_BACKEND = "s3";
    expect(() => getStorage()).toThrow(/STORAGE_BACKEND must be one of fs, gcs/);
  });

  it("refuses to start in gcs mode without a bucket", () => {
    process.env.STORAGE_BACKEND = "gcs";
    expect(() => getStorage()).toThrow(/STORAGE_BUCKET must be set/);
  });

  it("gives the prefix a trailing slash so keys never fuse onto it", () => {
    process.env.STORAGE_BACKEND = "gcs";
    process.env.STORAGE_BUCKET = "a-bucket";
    process.env.STORAGE_PREFIX = "traser";
    expect(getStorage().describe).toBe("gcs:a-bucket/traser/");
  });

  it("treats an unset prefix as the bucket root", () => {
    process.env.STORAGE_BACKEND = "gcs";
    process.env.STORAGE_BUCKET = "a-bucket";
    expect(getStorage().describe).toBe("gcs:a-bucket/");
  });
});

describe("coordination backend selection", () => {
  it("defaults to in-process, so a single instance needs no Redis", () => {
    expect(getCoordination().describe).toBe("memory");
  });

  it("rejects an unrecognised backend instead of silently falling back", () => {
    process.env.COORDINATION_BACKEND = "zookeeper";
    expect(() => getCoordination()).toThrow(/COORDINATION_BACKEND must be one of memory, redis/);
  });

  it("refuses to start in redis mode without a host", () => {
    process.env.COORDINATION_BACKEND = "redis";
    expect(() => getCoordination()).toThrow(/REDIS_HOST must be set/);
  });

  it("namespaces keys so a shared Redis instance stays untangled", () => {
    process.env.COORDINATION_BACKEND = "redis";
    process.env.REDIS_HOST = "10.55.0.4";
    expect(getCoordination().describe).toBe("redis:10.55.0.4:6379/traser:");
  });
});
