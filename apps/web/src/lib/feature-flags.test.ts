import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
const from = vi.fn(() => ({ select }));
const getServiceClient = vi.fn(() => ({ from }));
const loggerError = vi.fn();
const captureException = vi.fn();

let cacheStore: Map<string, unknown>;
const cacheDel = vi.fn(async (key: string) => {
  cacheStore.delete(key);
});
const cacheThrough = vi.fn(async (key: string, _ttl: number, fetcher: () => Promise<unknown>) => {
  if (cacheStore.has(key)) return cacheStore.get(key);
  const data = await fetcher();
  cacheStore.set(key, data);
  return data;
});

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => getServiceClient() }));
vi.mock("@/lib/logger", () => ({
  default: { error: (...args: unknown[]) => loggerError(...args) },
}));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/cache", () => ({
  cacheThrough: (...args: Parameters<typeof cacheThrough>) => cacheThrough(...args),
  cacheDel: (...args: Parameters<typeof cacheDel>) => cacheDel(...args),
  CacheKey: { platformFlags: () => "dg:platform:featureFlags" },
  TTL: { MIDDLEWARE: 30 },
}));

// unstable_cache needs Next's incrementalCache, which only exists inside a real
// request/prerender, so the callback passes straight through here. That keeps
// these tests on the Redis layer's semantics, which is what they are about;
// that the wrapper is present at all is asserted in the last test.
//
// The recorder is a plain object rather than a vi.fn because the wrapper is
// applied once at module load: clearAllMocks would wipe a spy's call record
// before any test could read it, and vi.hoisted is needed because that load
// happens above this file's own const initializers.
const { unstableCacheCall } = vi.hoisted(() => ({
  unstableCacheCall: {} as { keys?: string[]; options?: { revalidate?: number; tags?: string[] } },
}));
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keys?: string[],
    options?: { revalidate?: number; tags?: string[] },
  ) => {
    unstableCacheCall.keys = keys;
    unstableCacheCall.options = options;
    return fn;
  },
}));

import {
  isFeatureEnabled,
  invalidatePlatformFlagsCache,
  PLATFORM_FLAGS_TAG,
} from "./feature-flags";

describe("feature-flags", () => {
  beforeEach(() => {
    cacheStore = new Map();
    vi.clearAllMocks();
    select.mockResolvedValue({ data: [{ key: "stripe", enabled: false }], error: null });
  });

  it("returns the row's enabled value when the flag exists", async () => {
    await expect(isFeatureEnabled("stripe")).resolves.toBe(false);
  });

  it("fails open for an unknown key", async () => {
    await expect(isFeatureEnabled("some_unseeded_flag")).resolves.toBe(true);
  });

  it("fails open, logs, and alerts when the DB read errors", async () => {
    const dbError = new Error("connection refused");
    select.mockResolvedValue({ data: null, error: dbError });

    await expect(isFeatureEnabled("stripe")).resolves.toBe(true);
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({ extra: expect.objectContaining({ context: expect.any(String) }) }),
    );
  });

  it("fails open when getServiceClient throws (e.g. missing env during build prerender)", async () => {
    getServiceClient.mockImplementationOnce(() => {
      throw new Error("Supabase env vars not configured");
    });

    await expect(isFeatureEnabled("stripe")).resolves.toBe(true);
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: expect.objectContaining({ context: expect.any(String) }) }),
    );
  });

  it("only fetches once across calls within the cache TTL", async () => {
    await isFeatureEnabled("stripe");
    await isFeatureEnabled("mobile_api");

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("invalidatePlatformFlagsCache forces the next read to refetch", async () => {
    await isFeatureEnabled("stripe");
    expect(from).toHaveBeenCalledTimes(1);

    await invalidatePlatformFlagsCache();
    await isFeatureEnabled("stripe");

    expect(from).toHaveBeenCalledTimes(2);
  });

  // Guards the whole reason this app prerenders. @upstash/redis fetches with
  // `cache: "no-store"`, and the root layout reads a flag, so an unwrapped read
  // opts every route out of the Full Route Cache and Vercel serves the entire
  // app `no-store`. Drop the wrapper and production silently stops caching.
  it("reads the flags through Next's Data Cache, tagged for invalidation", () => {
    expect(unstableCacheCall.keys).toEqual([PLATFORM_FLAGS_TAG]);
    expect(unstableCacheCall.options).toEqual({
      revalidate: 30,
      tags: [PLATFORM_FLAGS_TAG],
    });
  });
});
