import { vi } from "vitest";

/**
 * In-memory mock for src/lib/cache.ts.
 * Usage: vi.mock("@/lib/cache", () => mockCacheModule());
 */
export function mockCacheModule() {
  const store = new Map<string, { value: unknown; expiresAt: number }>();

  const cacheGet = vi.fn(async <T>(key: string): Promise<T | null> => {
    const entry = store.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value as T;
  });

  const cacheSet = vi.fn(
    async <T>(key: string, value: T, ttlSeconds: number): Promise<void> => {
      store.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
  );

  const cacheDel = vi.fn(async (...keys: string[]): Promise<void> => {
    keys.forEach((k) => store.delete(k));
  });

  const cacheThrough = vi.fn(
    async <T>(
      key: string,
      ttl: number,
      fetcher: () => Promise<T>,
    ): Promise<T> => {
      const entry = store.get(key);
      if (entry && entry.expiresAt > Date.now()) return entry.value as T;
      const data = await fetcher();
      store.set(key, { value: data, expiresAt: Date.now() + ttl * 1000 });
      return data;
    },
  );

  return {
    TTL: { STABLE: 300, MODERATE: 120, MIDDLEWARE: 30 },
    CacheKey: {
      focusAreas: (orgId: string) => `dg:org:${orgId}:focusAreas`,
      shiftCodes: (orgId: string, all = false) =>
        `dg:org:${orgId}:shiftCodes${all ? ":all" : ""}`,
      absenceTypes: (orgId: string, all = false) =>
        `dg:org:${orgId}:absenceTypes${all ? ":all" : ""}`,
      shiftCategories: (orgId: string) => `dg:org:${orgId}:shiftCategories`,
      indicatorTypes: (orgId: string) => `dg:org:${orgId}:indicatorTypes`,
      certifications: (orgId: string) => `dg:org:${orgId}:certifications`,
      orgRoles: (orgId: string) => `dg:org:${orgId}:orgRoles`,
      coverageReqs: (orgId: string) => `dg:org:${orgId}:coverageRequirements`,
      organization: (orgId: string) => `dg:org:${orgId}:organization`,
      allOrganizations: () => `dg:gm:allOrganizations`,
      employees: (orgId: string) => `dg:org:${orgId}:employees`,
      orgUsers: (orgId: string) => `dg:org:${orgId}:orgUsers`,
      invitations: (orgId: string) => `dg:org:${orgId}:invitations`,
      employeeDetail: (empId: string) => `dg:emp:${empId}:detail`,
      allUsers: () => `dg:gm:allUsers`,
      tenantStats: () => `dg:gm:tenantStats`,
      mwProfile: (userId: string) => `dg:mw:profile:${userId}`,
      mwMembership: (userId: string, slug: string) =>
        `dg:mw:membership:${userId}:${slug}`,
    },
    cacheGet,
    cacheSet,
    cacheDel,
    cacheThrough,
    /** Direct access to the in-memory store for assertions. */
    _store: store,
    /** Clear all cached entries (call in beforeEach). */
    _reset: () => store.clear(),
  };
}
