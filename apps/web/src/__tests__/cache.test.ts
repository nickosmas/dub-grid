import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @upstash/redis before importing cache module
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: mockGet,
      set: mockSet,
      del: mockDel,
    }),
  },
}));

// Set env vars so the cache module initializes Redis
vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");

// Import after mocks are in place
import { cacheGet, cacheSet, cacheDel, cacheThrough, CacheKey, TTL } from "@/lib/cache";

describe("cache module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TTL constants", () => {
    it("has correct TTL values", () => {
      expect(TTL.STABLE).toBe(300);
      expect(TTL.MODERATE).toBe(120);
      expect(TTL.MIDDLEWARE).toBe(30);
    });
  });

  describe("CacheKey builders", () => {
    it("builds org-scoped keys correctly", () => {
      expect(CacheKey.focusAreas("org-1")).toBe("dg:org:org-1:focusAreas");
      expect(CacheKey.assignments("org-1")).toBe("dg:org:org-1:assignments");
      expect(CacheKey.assignments("org-1", true)).toBe("dg:org:org-1:assignments:all");
      expect(CacheKey.absenceTypes("org-1", true)).toBe("dg:org:org-1:absenceTypes:all");
      expect(CacheKey.shiftCategories("org-1")).toBe("dg:org:org-1:shiftCategories");
      expect(CacheKey.indicatorTypes("org-1")).toBe("dg:org:org-1:indicatorTypes");
      expect(CacheKey.certifications("org-1")).toBe("dg:org:org-1:certifications");
      expect(CacheKey.orgRoles("org-1")).toBe("dg:org:org-1:orgRoles");
      expect(CacheKey.coverageReqs("org-1")).toBe("dg:org:org-1:coverageRequirements");
      expect(CacheKey.organization("org-1")).toBe("dg:org:org-1:organization");
    });

    it("builds employee-scoped keys correctly", () => {
      expect(CacheKey.employeeDetail("emp-1")).toBe("dg:emp:emp-1:detail");
      expect(CacheKey.employees("org-1")).toBe("dg:org:org-1:employees");
    });

    it("builds gridmaster keys correctly", () => {
      expect(CacheKey.allOrganizations()).toBe("dg:gm:allOrganizations");
      expect(CacheKey.allUsers()).toBe("dg:gm:allUsers");
      expect(CacheKey.tenantStats()).toBe("dg:gm:tenantStats");
    });

    it("builds middleware keys correctly", () => {
      expect(CacheKey.mwProfile("user-1")).toBe("dg:mw:profile:user-1");
      expect(CacheKey.mwMembership("user-1", "acme")).toBe("dg:mw:membership:user-1:acme");
    });
  });

  describe("cacheGet", () => {
    it("returns cached value on hit", async () => {
      mockGet.mockResolvedValueOnce({ id: 1, name: "Test" });
      const result = await cacheGet<{ id: number; name: string }>("test-key");
      expect(result).toEqual({ id: 1, name: "Test" });
      expect(mockGet).toHaveBeenCalledWith("test-key");
    });

    it("returns null on miss", async () => {
      mockGet.mockResolvedValueOnce(null);
      const result = await cacheGet("missing-key");
      expect(result).toBeNull();
    });

    it("returns null on Redis error (graceful degradation)", async () => {
      mockGet.mockRejectedValueOnce(new Error("Connection refused"));
      const result = await cacheGet("error-key");
      expect(result).toBeNull();
    });
  });

  describe("cacheSet", () => {
    it("sets value with TTL", async () => {
      mockSet.mockResolvedValueOnce("OK");
      await cacheSet("key", { data: true }, 300);
      expect(mockSet).toHaveBeenCalledWith("key", { data: true }, { ex: 300 });
    });

    it("does not throw on Redis error", async () => {
      mockSet.mockRejectedValueOnce(new Error("Write error"));
      await expect(cacheSet("key", "value", 60)).resolves.toBeUndefined();
    });
  });

  describe("cacheDel", () => {
    it("deletes one key", async () => {
      mockDel.mockResolvedValueOnce(1);
      await cacheDel("key-1");
      expect(mockDel).toHaveBeenCalledWith("key-1");
    });

    it("deletes multiple keys in one call", async () => {
      mockDel.mockResolvedValueOnce(3);
      await cacheDel("key-1", "key-2", "key-3");
      expect(mockDel).toHaveBeenCalledWith("key-1", "key-2", "key-3");
    });

    it("does nothing when called with no keys", async () => {
      await cacheDel();
      expect(mockDel).not.toHaveBeenCalled();
    });

    it("does not throw on Redis error", async () => {
      mockDel.mockRejectedValueOnce(new Error("Delete error"));
      await expect(cacheDel("key")).resolves.toBeUndefined();
    });
  });

  describe("cacheThrough", () => {
    it("returns cached value on hit (does not call fetcher)", async () => {
      mockGet.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      const fetcher = vi.fn();

      const result = await cacheThrough("key", 300, fetcher);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("calls fetcher on miss and caches the result", async () => {
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce("OK");
      const fetcher = vi.fn().mockResolvedValue([{ id: 3 }]);

      const result = await cacheThrough("key", 300, fetcher);

      expect(result).toEqual([{ id: 3 }]);
      expect(fetcher).toHaveBeenCalledOnce();
      // cacheSet is fire-and-forget, wait for it
      await vi.waitFor(() => {
        expect(mockSet).toHaveBeenCalledWith("key", [{ id: 3 }], { ex: 300 });
      });
    });

    it("falls through to fetcher on Redis error", async () => {
      mockGet.mockRejectedValueOnce(new Error("Redis down"));
      const fetcher = vi.fn().mockResolvedValue("fresh-data");

      const result = await cacheThrough("key", 60, fetcher);

      expect(result).toBe("fresh-data");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("propagates fetcher errors (does not swallow)", async () => {
      mockGet.mockResolvedValueOnce(null);
      const fetcher = vi.fn().mockRejectedValue(new Error("DB error"));

      await expect(cacheThrough("key", 60, fetcher)).rejects.toThrow("DB error");
    });
  });
});
