import { LRUCache } from "lru-cache";

export function createFetchCache<V>(
  loader: (key: string) => Promise<V>,
  { ttlMs, max = 500 }: { ttlMs: number; max?: number }
): (key: string) => Promise<V> {
  const cache = new LRUCache<string, object>({
    max,

    ttl: ttlMs > 0 ? ttlMs : 1,
    fetchMethod: (key) => loader(key) as unknown as Promise<object>,
  });
  return (key: string) => cache.fetch(key) as Promise<V>;
}
