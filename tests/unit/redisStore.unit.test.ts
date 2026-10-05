import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { createRedisStore } from "../../app/lib/coordination/redisStore.server";
import type { CoordinationStore } from "../../app/lib/coordination/types";

// Opt-in: the memory store cannot catch anything that depends on real Redis
// semantics — the Lua compare-and-set paths, and ioredis's own key handling.
// Point REDIS_TEST_HOST at a throwaway instance to run these, e.g.
//   docker run -d --rm -p 6399:6379 redis:7-alpine
//   REDIS_TEST_HOST=127.0.0.1 REDIS_TEST_PORT=6399 npm run test:unit
const host = process.env.REDIS_TEST_HOST;
const port = Number(process.env.REDIS_TEST_PORT) || 6379;
const password = process.env.REDIS_TEST_PASSWORD || undefined;

let store: CoordinationStore;

describe.skipIf(!host)("redis coordination store", () => {
  beforeAll(() => {
    store = createRedisStore(host!, port, "traser:test:", password);
  });

  beforeEach(async () => {
    await store.release("refresh");
  });

  afterAll(async () => {
    await store.release("refresh");
  });

  it("grants the lease to one holder at a time", async () => {
    expect(await store.acquire("refresh", "a", 60_000)).not.toBeNull();
    expect(await store.acquire("refresh", "b", 60_000)).toBeNull();
  });

  // Regression: ioredis applies keyPrefix to the KEYS passed to eval as well as
  // to ordinary commands, so a pre-prefixed key was prefixed twice and every
  // Lua lookup missed — renew and release became silent no-ops that still
  // reported the "refused" outcome, which looks identical to working locking.
  it("renews for the current holder", async () => {
    const lease = await store.acquire("refresh", "a", 60_000);
    expect(await store.renew("refresh", lease!, 60_000)).toBe(true);
    expect(await store.read("refresh")).not.toBeNull();
  });

  it("releases for the current holder", async () => {
    await store.acquire("refresh", "a", 60_000);
    expect(await store.release("refresh", "a")).toBe(true);
    expect(await store.read("refresh")).toBeNull();
  });

  it("refuses to renew or release for anyone else", async () => {
    const lease = await store.acquire("refresh", "a", 60_000);
    expect(await store.renew("refresh", { ...lease!, owner: "b" }, 60_000)).toBe(false);
    expect(await store.release("refresh", "b")).toBe(false);
    expect(await store.read("refresh")).not.toBeNull();
  });

  it("refuses to renew a superseded generation", async () => {
    const stale = await store.acquire("refresh", "a", 60_000);
    await store.release("refresh");
    await store.acquire("refresh", "a", 60_000);
    expect(await store.renew("refresh", stale!, 60_000)).toBe(false);
  });

  it("releases without an owner, which is how cancellation reaches another instance", async () => {
    await store.acquire("refresh", "a", 60_000);
    expect(await store.release("refresh")).toBe(true);
  });

  it("lets the lease lapse on TTL so a dead holder cannot block", async () => {
    await store.acquire("refresh", "a", 300);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await store.read("refresh")).toBeNull();
  });

  it("counts up across calls", async () => {
    const before = await store.readCounter("dataset-index");
    expect(await store.bumpCounter("dataset-index")).toBe(before + 1);
  });
});
