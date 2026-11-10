/**
 * Rate limiter keyed by an arbitrary string (e.g. `orders:<ip>`). SERVER-ONLY.
 *
 * Backend:
 *  - Redis (Upstash) when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 *    are set. Counters are shared by every serverless instance, so a limit of
 *    20/min means 20/min in total, not 20/min per instance.
 *  - In-memory otherwise (local dev, tests). Per instance, reset on cold start.
 *
 * Algorithm: fixed window. The first request in a window creates the counter
 * and sets its expiry; later requests increment it. In Redis both steps run in
 * one Lua script, so two instances can't both see "first request" and both
 * reset the window.
 *
 * Failure mode: if Redis errors or times out, this falls back to the
 * in-memory limiter for that request (fail open to a weaker limit, not to no
 * limit). Failing closed would mean a Redis outage stops customers ordering
 * and staff logging in — worse than briefly approximate limits. Every
 * fallback is logged.
 */
import { Redis } from "@upstash/redis";

const KEY_PREFIX = "qbite:rl:";

/** A rate check must never hold a customer's order hostage to a slow Redis. */
const REDIS_TIMEOUT_MS = 1_000;

// ---------------------------------------------------------------- in-memory

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function checkInMemory(key: string, limit: number, windowMs: number, now: number): boolean {
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

// ---------------------------------------------------------------- redis

/** INCR, and set the window's expiry only on the first hit. Returns the new count. */
const INCR_WITH_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/** The one Redis operation the limiter needs; an interface so tests can fake it. */
export type RateLimitStore = {
  incrWithWindow(key: string, windowMs: number): Promise<number>;
};

function createUpstashStore(url: string, token: string): RateLimitStore {
  const redis = new Redis({
    url,
    token,
    // One attempt: a retry loop here would add latency to every API call.
    retry: false,
  });
  return {
    async incrWithWindow(key, windowMs) {
      const count = await redis.eval<[string], number>(INCR_WITH_WINDOW, [key], [String(windowMs)]);
      return Number(count);
    },
  };
}

let store: RateLimitStore | null | undefined;

function getStore(): RateLimitStore | null {
  if (store === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    store = url && token ? createUpstashStore(url, token) : null;
  }
  return store;
}

/** Test hook: swap the backend. `null` forces in-memory; `undefined` re-reads env. */
export function setRateLimitStoreForTests(next: RateLimitStore | null | undefined): void {
  store = next;
  buckets.clear();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ---------------------------------------------------------------- public API

/**
 * Resolves true if the request is allowed; false if the limit is exceeded.
 *
 * @param key       Unique identifier (e.g. `pin:<ip>`)
 * @param limit     Max requests allowed per window
 * @param windowMs  Window duration in milliseconds
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const redisStore = getStore();
  if (!redisStore) return checkInMemory(key, limit, windowMs, Date.now());

  try {
    const count = await withTimeout(
      redisStore.incrWithWindow(KEY_PREFIX + key, windowMs),
      REDIS_TIMEOUT_MS
    );
    return count <= limit;
  } catch (err) {
    console.error("[rate-limit] Redis unavailable; using in-memory limit for this request", err);
    return checkInMemory(key, limit, windowMs, Date.now());
  }
}
