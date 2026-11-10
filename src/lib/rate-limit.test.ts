import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, setRateLimitStoreForTests, type RateLimitStore } from "./rate-limit";

/** In-process stand-in for Redis with the same fixed-window semantics. */
function fakeRedis(): RateLimitStore & { keys: string[] } {
  const counts = new Map<string, number>();
  return {
    keys: [],
    async incrWithWindow(key) {
      this.keys.push(key);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
  };
}

afterEach(() => {
  setRateLimitStoreForTests(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("checkRateLimit — in-memory (no Redis configured)", () => {
  it("allows up to the limit, then blocks", async () => {
    setRateLimitStoreForTests(null);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit("k", 3, 60_000));
    expect(results).toEqual([true, true, true, false]);
  });

  it("opens again once the window has passed", async () => {
    setRateLimitStoreForTests(null);
    vi.useFakeTimers();
    vi.setSystemTime(0);
    await checkRateLimit("k", 1, 1_000);
    expect(await checkRateLimit("k", 1, 1_000)).toBe(false);
    vi.setSystemTime(1_001);
    expect(await checkRateLimit("k", 1, 1_000)).toBe(true);
  });

  it("counts each key separately", async () => {
    setRateLimitStoreForTests(null);
    expect(await checkRateLimit("ip-a", 1, 60_000)).toBe(true);
    expect(await checkRateLimit("ip-b", 1, 60_000)).toBe(true);
    expect(await checkRateLimit("ip-a", 1, 60_000)).toBe(false);
  });
});

describe("checkRateLimit — Redis", () => {
  it("uses the shared counter and a namespaced key", async () => {
    const redis = fakeRedis();
    setRateLimitStoreForTests(redis);
    expect(await checkRateLimit("orders:1.2.3.4", 2, 60_000)).toBe(true);
    expect(await checkRateLimit("orders:1.2.3.4", 2, 60_000)).toBe(true);
    expect(await checkRateLimit("orders:1.2.3.4", 2, 60_000)).toBe(false);
    expect(redis.keys[0]).toBe("qbite:rl:orders:1.2.3.4");
  });

  it("falls back to the in-memory limit when Redis errors, and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setRateLimitStoreForTests({
      incrWithWindow: () => Promise.reject(new Error("connection refused")),
    });
    // Still limited (not fail-open to unlimited): 1 allowed, then blocked.
    expect(await checkRateLimit("pin:5.6.7.8", 1, 60_000)).toBe(true);
    expect(await checkRateLimit("pin:5.6.7.8", 1, 60_000)).toBe(false);
    expect(log).toHaveBeenCalled();
  });

  it("falls back instead of hanging when Redis is slow", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    setRateLimitStoreForTests({ incrWithWindow: () => new Promise<number>(() => {}) });
    const pending = checkRateLimit("slow", 5, 60_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toBe(true);
  });
});
