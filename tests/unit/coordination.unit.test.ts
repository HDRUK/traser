import { describe, it, expect, beforeEach } from "vitest";

import { createMemoryStore } from "../../app/lib/coordination/memoryStore.server";
import type { CoordinationStore } from "../../app/lib/coordination/types";

let store: CoordinationStore;

beforeEach(() => {
  store = createMemoryStore();
});

describe("memory coordination store", () => {
  it("grants the lease to one holder at a time", async () => {
    expect(await store.acquire("refresh", "a", 1_000)).not.toBeNull();
    expect(await store.acquire("refresh", "b", 1_000)).toBeNull();
  });

  it("issues a fresh generation on every acquisition", async () => {
    const first = await store.acquire("refresh", "a", 1_000);
    await store.release("refresh", "a");
    const second = await store.acquire("refresh", "b", 1_000);

    expect(second!.generation).toBeGreaterThan(first!.generation);
  });

  it("lets the lease lapse once the TTL passes, so a dead holder cannot block", async () => {
    await store.acquire("refresh", "a", -1);

    expect(await store.read("refresh")).toBeNull();
    expect(await store.acquire("refresh", "b", 1_000)).not.toBeNull();
  });

  it("refuses to renew for anyone but the current holder", async () => {
    const lease = await store.acquire("refresh", "a", 1_000);

    expect(await store.renew("refresh", lease!, 1_000)).toBe(true);
    expect(await store.renew("refresh", { ...lease!, owner: "b" }, 1_000)).toBe(false);
  });

  it("refuses to renew a superseded generation", async () => {
    const stale = await store.acquire("refresh", "a", 1_000);
    await store.release("refresh", "a");
    await store.acquire("refresh", "a", 1_000);

    expect(await store.renew("refresh", stale!, 1_000)).toBe(false);
  });

  it("releases without an owner, which is how cancellation reaches another holder", async () => {
    await store.acquire("refresh", "a", 1_000);

    expect(await store.release("refresh")).toBe(true);
    expect(await store.read("refresh")).toBeNull();
  });

  it("refuses to release a lease held by someone else", async () => {
    await store.acquire("refresh", "a", 1_000);

    expect(await store.release("refresh", "b")).toBe(false);
    expect(await store.read("refresh")).not.toBeNull();
  });

  it("keeps leases of different names independent", async () => {
    await store.acquire("refresh", "a", 1_000);

    expect(await store.acquire("benchmark", "a", 1_000)).not.toBeNull();
  });

  it("counts up from zero", async () => {
    expect(await store.readCounter("dataset-index")).toBe(0);
    expect(await store.bumpCounter("dataset-index")).toBe(1);
    expect(await store.readCounter("dataset-index")).toBe(1);
  });
});
