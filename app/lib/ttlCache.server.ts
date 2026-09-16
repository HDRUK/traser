import { LRUCache } from "lru-cache";

/**
 * Wraps an async loader in a TTL cache keyed by string, with single-flight
 * de-duplication: concurrent calls for the same key that miss share one
 * in-flight loader call instead of each triggering their own fetch/read.
 */
export function createFetchCache<V>(
  loader: (key: string) => Promise<V>,
  { ttlMs, max = 500 }: { ttlMs: number; max?: number }
): (key: string) => Promise<V> {
  const cache = new LRUCache<string, object>({
    max,
    // lru-cache treats ttl: 0 as "never expire", so ttlMs <= 0 (caching off)
    // maps to 1ms — the loader effectively re-runs on every call.
    ttl: ttlMs > 0 ? ttlMs : 1,
    fetchMethod: (key) => loader(key) as unknown as Promise<object>,
  });
  return (key: string) => cache.fetch(key) as Promise<V>;
}
