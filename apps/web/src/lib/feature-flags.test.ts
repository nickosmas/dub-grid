import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
const from = vi.fn(() => ({ select }));
const getServiceClient = vi.fn(() => ({ from }));
const loggerError = vi.fn();

let cacheStore: Map<string, unknown>;
const cacheDel = vi.fn(async (key: string) => {
  cacheStore.delete(key);
});
const cacheThrough = vi.fn(
  async (key: string, _ttl: number, fetcher: () => Promise<unknown>) => {
    if (cacheStore.has(key)) return cacheStore.get(key);
    const data = await fetcher();
    cacheStore.set(key, data);
    return data;
  },
);

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => getServiceClient() }));
vi.mock("@/lib/logger", () => ({ default: { error: (...args: unknown[]) => loggerError(...args) } }));
vi.mock("@/lib/cache", () => ({
  cacheThrough: (...args: Parameters<typeof cacheThrough>) => cacheThrough(...args),
  cacheDel: (...args: Parameters<typeof cacheDel>) => cacheDel(...args),
  CacheKey: { platformFlags: () => "dg:platform:featureFlags" },
  TTL: { MIDDLEWARE: 30 },
}));

import { isFeatureEnabled, invalidatePlatformFlagsCache } from "./feature-flags";

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

  it("fails open and logs when the DB read errors", async () => {
    select.mockResolvedValue({ data: null, error: new Error("connection refused") });

    await expect(isFeatureEnabled("stripe")).resolves.toBe(true);
    expect(loggerError).toHaveBeenCalledTimes(1);
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
});
