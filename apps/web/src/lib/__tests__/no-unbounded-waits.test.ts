// @vitest-environment node
//
// A hung dependency is worse than a failing one: a rejection takes an error
// path someone wrote, while a hang takes no path at all. That is how the
// subdomain form ended up spinning on "Checking" indefinitely — a stalled
// connection meant the fetch never settled, so the code that clears the
// loading state never ran.
//
// These lock in that nothing on a user-facing path can wait forever.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimeoutError, withTimeout, withTimeoutOrThrow } from "@/lib/with-timeout";

/** A promise that never settles — what a stalled network actually looks like. */
function hangs<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

describe("withTimeout", () => {
  it("resolves with the fallback when the work never settles", async () => {
    await expect(withTimeout(hangs<string>(), 20, "fallback")).resolves.toBe("fallback");
  });

  it("returns the real value when the work finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("real"), 1000, "fallback")).resolves.toBe("real");
  });

  it("propagates a rejection rather than masking it as the fallback", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "fb")).rejects.toThrow(
      "boom",
    );
  });
});

describe("withTimeoutOrThrow", () => {
  it("rejects with TimeoutError when the work never settles", async () => {
    await expect(withTimeoutOrThrow(hangs(), 20, "thing")).rejects.toBeInstanceOf(TimeoutError);
  });

  it("names the operation and budget, so the log says what stalled", async () => {
    await expect(withTimeoutOrThrow(hangs(), 20, "org lookup")).rejects.toThrow(
      "org lookup exceeded 20ms",
    );
  });
});

describe("cache reads cannot hold a request open", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  it("cacheGet returns a miss when Redis never answers", async () => {
    vi.doMock("@upstash/redis", () => ({
      Redis: { fromEnv: () => ({ get: () => hangs(), mget: () => hangs() }) },
    }));
    const { cacheGet } = await import("@/lib/cache");

    // Resolves at all — that is the assertion. Before the timeout existed this
    // never settled, and every caller waiting on it hung with it.
    await expect(cacheGet("dg:test:key")).resolves.toBeNull();
  }, 10_000);

  it("cacheThrough still reaches the source of truth when Redis hangs", async () => {
    vi.doMock("@upstash/redis", () => ({
      Redis: { fromEnv: () => ({ get: () => hangs(), set: () => hangs() }) },
    }));
    const { cacheThrough } = await import("@/lib/cache");

    const fetcher = vi.fn(async () => ({ id: "org-1" }));
    // A cache that cannot answer must degrade to a miss, not to an outage.
    await expect(cacheThrough("dg:test:org", 60, fetcher)).resolves.toEqual({ id: "org-1" });
    expect(fetcher).toHaveBeenCalledOnce();
  }, 10_000);
});

describe("rate limiting cannot hold a request open", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("short-circuits outside production without touching Redis at all", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const limit = vi.fn(() => hangs());

    await expect(checkRateLimit({ limit } as never, "1.2.3.4")).resolves.toEqual({
      limited: false,
    });
    expect(limit).not.toHaveBeenCalled();
  }, 10_000);

  it("gives up rather than hanging when Redis never answers in production", async () => {
    // `isProduction` is read at module load, so it has to be set before the
    // import. This is the path that matters: /api/validate-domain calls the
    // limiter before anything else, and unbounded, a stalled Redis left the
    // public subdomain form waiting forever.
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("@/lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
    vi.doMock("@/lib/sentry", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit({ limit: () => hangs() } as never, "1.2.3.4");

    // Fails closed, matching the policy for an unreachable Redis — callers turn
    // `misconfigured` into a 503. A fast, explicit failure, not a stall.
    expect(result).toEqual({ limited: true, misconfigured: true });
  }, 10_000);
});
