import { envEnum } from "../env.server";
import { createMemoryStore } from "./memoryStore.server";
import { createRedisStore } from "./redisStore.server";
import type { CoordinationStore } from "./types";

export type { CoordinationStore, LeaseState } from "./types";

const BACKENDS = ["memory", "redis"] as const;

export const REFRESH_LEASE = "refresh";
export const BENCHMARK_LEASE = "benchmark";
export const RETENTION_LEASE = "retention";
export const DATASET_INDEX_COUNTER = "dataset-index";

function build(): CoordinationStore {
  const backend = envEnum("COORDINATION_BACKEND", BACKENDS, "memory");
  if (backend === "memory") return createMemoryStore();

  const host = process.env.REDIS_HOST?.trim();
  if (!host) {
    throw new Error("REDIS_HOST must be set when COORDINATION_BACKEND=redis");
  }
  const port = Number(process.env.REDIS_PORT) || 6379;
  const prefix = process.env.REDIS_KEY_PREFIX?.trim() || "traser:";
  return createRedisStore(host, port, prefix);
}

let _store: CoordinationStore | null = null;

export function getCoordination(): CoordinationStore {
  if (!_store) {
    _store = build();
    console.log(`[coordination] backend ${_store.describe}`);
  }
  return _store;
}

export function resetCoordinationForTests(): void {
  _store = null;
}
