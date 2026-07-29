import { LRUCache } from "lru-cache";

/**
 * Wraps an async loader in a TTL cache keyed by string, with single-flight
 * de-duplication: concurrent calls for the same key that miss share one
 * in-flight loader call instead of each triggering their own fetch/read.
 *
 * ttlMs <= 0 disables caching (every call re-runs the loader) — matches the
 * old CACHE_REFRESH_STDTLL<=0 "always refetch" behaviour used in tests/dev.
 * (lru-cache treats ttl: 0 as "never expire", so that value is special-cased.)
 */
export function createFetchCache<V>(
  loader: (key: string) => Promise<V>,
  { ttlMs, max = 500 }: { ttlMs: number; max?: number }
): (key: string) => Promise<V> {
  const cache = new LRUCache<string, {}>({
    max,
    ttl: ttlMs > 0 ? ttlMs : 1,
    fetchMethod: (key) => loader(key) as unknown as Promise<{}>,
  });
  return (key: string) => cache.fetch(key) as Promise<V>;
}
