import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const serviceFrom = vi.fn();
const cacheSet = vi.fn();
const cacheDel = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

// CacheKey and TTL stay real: refreshing the exact entry the proxy reads is the
// property this recovery route depends on.
vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...actual,
    cacheSet: (key: string, value: unknown, ttl: number) => cacheSet(key, value, ttl),
    cacheDel: (...keys: string[]) => cacheDel(...keys),
  };
});

vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { CacheKey, TTL } from "@/lib/cache";
import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
let currentOrgRow: OrgRow | null = null;
let currentOrgError: unknown = null;
let currentMembership: { org_role: string } | null = { org_role: "user" };
let currentProfile: {
  platform_role: string;
  deactivated_at: string | null;
  scheduled_deletion_at: string | null;
} | null = {
  platform_role: "none",
  deactivated_at: null,
  scheduled_deletion_at: null,
};

type OrgRow = {
  suspended_at: string | null;
  archived_at: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
};

function auth(orgRole = "user", platformRole = "user") {
  return {
    user: { id: "user-1" },
    session: { access_token: "token" },
    claims: {
      sub: "user-1",
      org_id: ORG_ID,
      org_role: orgRole,
      platform_role: platformRole,
    },
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
  currentOrgRow = row;
}

function request() {
  return new NextRequest("http://acme.localhost/api/organization/access-status");
}

describe("GET /api/organization/access-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserWithClaims.mockResolvedValue(auth());
    cacheSet.mockResolvedValue(undefined);
    cacheDel.mockResolvedValue(undefined);
    currentOrgRow = null;
    currentOrgError = null;
    currentMembership = { org_role: "user" };
    currentProfile = {
      platform_role: "none",
      deactivated_at: null,
      scheduled_deletion_at: null,
    };
    serviceFrom.mockImplementation((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        maybeSingle: vi.fn(() =>
          Promise.resolve({
            data:
              table === "organization_memberships"
                ? currentMembership
                : table === "profiles"
                  ? currentProfile
                  : currentOrgRow,
            error: table === "organizations" ? currentOrgError : null,
          }),
        ),
      };
      return query;
    });
  });

  it("returns the caller's auth failure untouched", async () => {
    const unauthorized = NextResponse.json({ error: "expired" }, { status: 401 });
    requireAuthenticatedUserWithClaims.mockResolvedValue({ response: unauthorized });

    expect(await GET(request())).toBe(unauthorized);
  });

  it("reads current organization state and refreshes the proxy's cache entry", async () => {
    const row = orgRow({ subscription_status: "active" });
    respondWith(row);

    await GET(request());

    expect(serviceFrom).toHaveBeenCalledWith("organizations");
    expect(cacheSet).toHaveBeenCalledWith(CacheKey.mwOrgAccess(ORG_ID), row, TTL.MIDDLEWARE);
  });

  it("drops the cached organization row the bootstrap derives its billing lock from", async () => {
    respondWith(orgRow({ subscription_status: "active" }));

    await GET(request());

    expect(cacheDel).toHaveBeenCalledWith(CacheKey.organization(ORG_ID));
  });

  it("holds a regular user while the trial clock has not started", async () => {
    respondWith(orgRow());

    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "unavailable",
    });
  });

  it("also holds an admin while the trial clock has not started", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(auth("admin"));
    respondWith(orgRow());

    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "unavailable",
    });
  });

  it("lets a super admin through the same unstarted trial", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(auth("super_admin"));
    currentMembership = { org_role: "super_admin" };
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

  it("keeps payment-attention and trial-grace organizations open without exposing why", async () => {
    respondWith(orgRow({ subscription_status: "past_due" }));

    expect(await (await GET(request())).json()).toEqual({
      available: true,
      state: "active",
    });

    respondWith(
      orgRow({
        subscription_status: "trialing",
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      }),
    );

    expect(await (await GET(request())).json()).toEqual({ available: true, state: "active" });
  });

  it("redacts a lapsed subscription for a regular user", async () => {
    respondWith(orgRow({ subscription_status: "canceled" }));

    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "unavailable",
    });
  });

  it("holds suspended organizations without identifying suspension to a regular user", async () => {
    respondWith(
      orgRow({
        suspended_at: "2026-01-01T00:00:00.000Z",
        subscription_status: "active",
      }),
    );

    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "unavailable",
    });
  });

  it("redacts archival from a regular user", async () => {
    respondWith(orgRow({ archived_at: "2026-01-01T00:00:00.000Z", subscription_status: "active" }));

    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "unavailable",
    });
  });

  it("preserves recovery detail for Super Admins and Gridmasters", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(auth("super_admin"));
    currentMembership = { org_role: "super_admin" };
    respondWith(orgRow({ subscription_status: "canceled" }));
    expect(await (await GET(request())).json()).toEqual({ available: false, state: "locked" });

    requireAuthenticatedUserWithClaims.mockResolvedValue(auth("user", "gridmaster"));
    currentMembership = null;
    currentProfile = {
      platform_role: "gridmaster",
      deactivated_at: null,
      scheduled_deletion_at: null,
    };
    respondWith(orgRow({ archived_at: "2026-01-01T00:00:00.000Z" }));
    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "archived",
    });
  });

  it("never claims the organization is open when the lookup fails", async () => {
    currentOrgError = new Error("database unavailable");

    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "unavailable",
    });
  });

  it("returns no organization state after the caller's membership is removed", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(auth("super_admin"));
    currentMembership = null;
    respondWith(orgRow({ subscription_status: "active" }));

    expect(await (await GET(request())).json()).toEqual({
      available: false,
      state: "unavailable",
    });
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it("skips the gate for a caller with no organization claim", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "gm" },
      session: { access_token: "token" },
      claims: { sub: "gm", platform_role: "gridmaster" },
    });

    expect(await (await GET(request())).json()).toEqual({ available: true, state: "active" });
    expect(cacheSet).not.toHaveBeenCalled();
  });
});
