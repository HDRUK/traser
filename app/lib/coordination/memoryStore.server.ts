import type { CoordinationStore, LeaseState } from "./types";

interface Held {
  lease: LeaseState;
  expiresAtMs: number;
}

export function createMemoryStore(): CoordinationStore {
  const leases = new Map<string, Held>();
  const counters = new Map<string, number>();

  const live = (name: string): Held | null => {
    const held = leases.get(name);
    if (!held) return null;
    if (held.expiresAtMs <= Date.now()) {
      leases.delete(name);
      return null;
    }
    return held;
  };

  return {
    describe: "memory",

    async acquire(name, owner, ttlMs) {
      if (live(name)) return null;
      const previous = counters.get(`${name}:generation`) ?? 0;
      const generation = previous + 1;
      counters.set(`${name}:generation`, generation);
      const lease: LeaseState = { owner, generation, startedAt: new Date().toISOString() };
      leases.set(name, { lease, expiresAtMs: Date.now() + ttlMs });
      return lease;
    },

    async renew(name, lease, ttlMs) {
      const held = live(name);
      if (!held || held.lease.owner !== lease.owner || held.lease.generation !== lease.generation) {
        return false;
      }
      leases.set(name, { lease, expiresAtMs: Date.now() + ttlMs });
      return true;
    },

    async read(name) {
      return live(name)?.lease ?? null;
    },

    async release(name, owner) {
      const held = live(name);
      if (!held) return false;
      if (owner && held.lease.owner !== owner) return false;
      leases.delete(name);
      return true;
    },

    async bumpCounter(name) {
      const next = (counters.get(name) ?? 0) + 1;
      counters.set(name, next);
      return next;
    },

    async readCounter(name) {
      return counters.get(name) ?? 0;
    },
  };
}
