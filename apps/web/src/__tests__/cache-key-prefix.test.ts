import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockMget = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({ get: mockGet, mget: mockMget, set: mockSet, del: mockDel }),
  },
}));

vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");
vi.stubEnv("CACHE_KEY_PREFIX", "e2e-7-1-3:");

import { cacheDel, cacheGet, cacheGetMany, cacheSet, CacheKey } from "@/lib/cache";

describe("cache key prefix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("namespaces reads and writes", async () => {
    mockGet.mockResolvedValue(null);
    mockMget.mockResolvedValue([null, null]);
    const key = CacheKey.mwOrgAccess("org-1");

    await cacheGet(key);
    await cacheGetMany([key, CacheKey.mwProfile("user-1")]);
    await cacheSet(key, { subscription_status: "canceled" }, 30);

    expect(mockGet).toHaveBeenCalledWith("e2e-7-1-3:dg:mw:orgAccess:org-1");
    expect(mockMget).toHaveBeenCalledWith(
      "e2e-7-1-3:dg:mw:orgAccess:org-1",
      "e2e-7-1-3:dg:mw:profile:user-1",
    );
    expect(mockSet).toHaveBeenCalledWith(
      "e2e-7-1-3:dg:mw:orgAccess:org-1",
      { subscription_status: "canceled" },
      { ex: 30 },
    );
  });

  it("namespaces deletes, including the derived bootstrap key", async () => {
    mockDel.mockResolvedValue(2);

    await cacheDel(CacheKey.jobs("org-1"));

    expect(mockDel).toHaveBeenCalledWith(
      "e2e-7-1-3:dg:org:org-1:jobs",
      "e2e-7-1-3:dg:org:org-1:bootstrapConfig",
    );
  });
});
