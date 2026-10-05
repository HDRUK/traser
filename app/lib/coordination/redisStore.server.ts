import Redis from "ioredis";
import type { CoordinationStore, LeaseState } from "./types";

const RENEW_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then return 0 end
local held = cjson.decode(current)
if held['owner'] ~= ARGV[1] or tostring(held['generation']) ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[1], ARGV[3], 'PX', ARGV[4])
return 1
`;

const RELEASE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then return 0 end
if ARGV[1] ~= '' and cjson.decode(current)['owner'] ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
`;

export function createRedisStore(
  host: string,
  port: number,
  keyPrefix: string,
  password?: string
): CoordinationStore {
  // Keys are prefixed here rather than through ioredis's own keyPrefix option,
  // which is applied to ordinary commands but also to the KEYS passed to eval —
  // so a pre-prefixed key would be prefixed twice and every Lua lookup would
  // miss, silently turning renew and release into no-ops.
  const redis = new Redis({
    host,
    port,
    password,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  redis.on("error", (err) => console.error("[coordination] redis error:", err.message));

  const leaseKey = (name: string) => `${keyPrefix}lease:${name}`;
  const counterKey = (name: string) => `${keyPrefix}counter:${name}`;

  return {
    describe: `redis:${host}:${port}/${keyPrefix}`,

    async acquire(name, owner, ttlMs) {
      const generation = await redis.incr(counterKey(`${name}:generation`));
      const lease: LeaseState = { owner, generation, startedAt: new Date().toISOString() };
      const result = await redis.set(
        leaseKey(name),
        JSON.stringify(lease),
        "PX",
        ttlMs,
        "NX"
      );
      return result === "OK" ? lease : null;
    },

    async renew(name, lease, ttlMs) {
      const held = await redis.eval(
        RENEW_SCRIPT,
        1,
        leaseKey(name),
        lease.owner,
        String(lease.generation),
        JSON.stringify(lease),
        String(ttlMs)
      );
      return held === 1;
    },

    async read(name) {
      const raw = await redis.get(leaseKey(name));
      return raw ? (JSON.parse(raw) as LeaseState) : null;
    },

    async release(name, owner) {
      const released = await redis.eval(
        RELEASE_SCRIPT,
        1,
        leaseKey(name),
        owner ?? ""
      );
      return released === 1;
    },

    async bumpCounter(name) {
      return redis.incr(counterKey(name));
    },

    async readCounter(name) {
      return Number(await redis.get(counterKey(name))) || 0;
    },
  };
}
