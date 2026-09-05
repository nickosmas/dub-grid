import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const serviceFrom = vi.fn();
const cacheThrough = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

// CacheKey and TTL stay real: reading through the same key the proxy writes is
// the property this route depends on, so a test that stubbed them would prove
// nothing.
vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...actual,
    cacheThrough: (key: string, ttl: number, fetcher: () => Promise<unknown>) =>
      cacheThrough(key, ttl, fetcher),
  };
});

vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { CacheKey, TTL } from "@/lib/cache";
import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

type OrgRow = {
  suspended_at: string | null;
  archived_at: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
};

function auth(orgRole = "user") {
  return {
    user: { id: "user-1" },
    session: { access_token: "token" },
    claims: { sub: "user-1", org_id: ORG_ID, org_role: orgRole },
  };
}

function orgRow(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    suspended_at: null,
    archived_at: null,
    subscription_status: null,
    trial_ends_at: null,
    ...overrides,
  };
}

function respondWith(row: OrgRow | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
  };
  serviceFrom.mockReturnValue(query);
  return query;
}

function request() {
  return new NextRequest("http://acme.localhost/api/organization/access-status");
}

describe("GET /api/organization/access-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserWithClaims.mockResolvedValue(auth());
    cacheThrough.mockImplementation((_key, _ttl, fetcher: () => Promise<unknown>) => fetcher());
  });

  it("returns the caller's auth failure untouched", async () => {
    const unauthorized = NextResponse.json({ error: "expired" }, { status: 401 });
    requireAuthenticatedUserWithClaims.mockResolvedValue({ response: unauthorized });

    expect(await GET(request())).toBe(unauthorized);
  });

  it("reads through the same cache entry the proxy's gate reads", async () => {
    respondWith(orgRow({ subscription_status: "active" }));

    await GET(request());

    expect(cacheThrough).toHaveBeenCalledWith(
      CacheKey.mwOrgAccess(ORG_ID),
      TTL.MIDDLEWARE,
      expect.any(Function),
    );
  });

  it("holds a regular user while the trial clock has not started", async () => {
    respondWith(orgRow());

    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "trial_pending",
    });
  });

  it("lets a super admin through the same unstarted trial", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(auth("super_admin"));
    respondWith(orgRow());

    expect(await (await GET(request())).json()).toEqual({
      available: true,
      state: "trial_pending",
    });
  });

  it("reports an active subscription as open", async () => {
    respondWith(orgRow({ subscription_status: "active" }));

    expect(await (await GET(request())).json()).toEqual({ available: true, state: "active" });
  });

  it("reports a lapsed subscription as locked", async () => {
    respondWith(orgRow({ subscription_status: "canceled" }));

    expect(await (await GET(request())).json()).toEqual({ available: false, state: "locked" });
  });

  it("reports an archived organization without evaluating billing", async () => {
    respondWith(orgRow({ archived_at: "2026-01-01T00:00:00.000Z", subscription_status: "active" }));

    expect(await (await GET(request())).json()).toEqual({ available: false, state: "archived" });
  });

  it("never claims the organization is open when the lookup fails", async () => {
    cacheThrough.mockRejectedValue(new Error("redis down"));

    expect(await (await GET(request())).json()).toEqual({ available: false, state: "unknown" });
  });

  it("skips the gate for a caller with no organization claim", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "gm" },
      session: { access_token: "token" },
      claims: { sub: "gm", platform_role: "gridmaster" },
    });

    expect(await (await GET(request())).json()).toEqual({ available: true, state: "active" });
    expect(cacheThrough).not.toHaveBeenCalled();
  });
});
