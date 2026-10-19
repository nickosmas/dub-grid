import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cached: null as unknown,
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...actual,
    cacheThrough: async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
      mocks.cached ?? fetcher(),
  };
});

vi.mock("@/lib/supabase-keys", () => ({
  getSupabaseUrl: () => "http://127.0.0.1:54321",
  getSupabaseSecretKey: () => "service-key",
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  }),
}));

import { lookupOrgBySlug } from "./org-lookup";

const ROW = { id: "org-1", name: "Calm Haven", archived_at: null, suspended_at: null };

describe("lookupOrgBySlug admission", () => {
  beforeEach(() => {
    mocks.cached = null;
    mocks.maybeSingle.mockReset().mockResolvedValue({ data: ROW, error: null });
  });

  it("answers a cached organization without consulting the gate", async () => {
    mocks.cached = { id: "org-1", name: "Calm Haven", archivedAt: null, suspendedAt: null };
    const admitMiss = vi.fn().mockResolvedValue(false);

    const result = await lookupOrgBySlug("calmhaven", { admitMiss });

    expect(result).toEqual({
      status: "found",
      org: { id: "org-1", name: "Calm Haven", suspendedAt: null },
    });
    expect(admitMiss).not.toHaveBeenCalled();
  });

  it("asks the gate on a miss and reads the database when admitted", async () => {
    const admitMiss = vi.fn().mockResolvedValue(true);

    const result = await lookupOrgBySlug("calmhaven", { admitMiss });

    expect(admitMiss).toHaveBeenCalledOnce();
    expect(mocks.maybeSingle).toHaveBeenCalledOnce();
    expect(result.status).toBe("found");
  });

  it("keeps the database untouched when the gate refuses a miss", async () => {
    const result = await lookupOrgBySlug("madeup", {
      admitMiss: vi.fn().mockResolvedValue(false),
    });

    expect(result).toEqual({ status: "error" });
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
});
