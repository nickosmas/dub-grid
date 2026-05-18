import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const getImpersonationFromCookie = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) =>
    requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/impersonation", () => ({
  getImpersonationFromCookie: (cookie: string) =>
    getImpersonationFromCookie(cookie),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
  }),
}));

import { GET } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

const tableResults = new Map<string, Array<{ data: unknown; error: unknown }>>();

function enqueue(table: string, ...results: Array<{ data: unknown; error?: unknown }>) {
  tableResults.set(
    table,
    results.map((result) => ({ data: result.data, error: result.error ?? null })),
  );
}

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve(tableResults.get(table)?.shift() ?? { data: null, error: null }),
    ),
  };
  return query;
}

const SECOND_ORG_ID = "33333333-3333-4333-8333-333333333333";

function mockAuthWithOrg(orgId: string | null) {
  requireAuthenticatedUserWithClaims.mockResolvedValue({
    user: { id: USER_ID, email: "user@example.com" },
    session: { access_token: "test-token" },
    claims: { sub: USER_ID, org_id: orgId ?? undefined },
  });
}

describe("GET /api/account/permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    mockAuthWithOrg(ORG_ID);
    getImpersonationFromCookie.mockReturnValue(null);
    serviceFrom.mockImplementation((table: string) => makeQuery(table));
  });

  it("resolves super admin permissions from live membership instead of JWT claims", async () => {
    enqueue("profiles", {
      data: {
        org_id: ORG_ID,
        platform_role: "none",
        deactivated_at: null,
      },
    });
    enqueue("organization_memberships", {
      data: {
        org_role: "super_admin",
        admin_permissions: null,
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/account/permissions"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.role).toBe("super_admin");
    expect(body.permissions.orgId).toBe(ORG_ID);
    expect(body.permissions.isSuperAdmin).toBe(true);
  });

  it("uses the JWT org claim, not the profile default, when they diverge", async () => {
    mockAuthWithOrg(SECOND_ORG_ID);
    enqueue("profiles", {
      data: {
        org_id: ORG_ID,
        platform_role: "none",
        deactivated_at: null,
      },
    });
    enqueue("organization_memberships", {
      data: {
        org_role: "super_admin",
        admin_permissions: null,
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/account/permissions"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.orgId).toBe(SECOND_ORG_ID);
  });

  it("falls back to profile.org_id when the JWT lacks an org claim", async () => {
    mockAuthWithOrg(null);
    enqueue("profiles", {
      data: {
        org_id: ORG_ID,
        platform_role: "none",
        deactivated_at: null,
      },
    });
    enqueue("organization_memberships", {
      data: {
        org_role: "admin",
        admin_permissions: null,
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/account/permissions"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.orgId).toBe(ORG_ID);
    expect(body.permissions.role).toBe("admin");
  });

  it("returns expired-session response when the live profile is deactivated", async () => {
    enqueue("profiles", {
      data: {
        org_id: ORG_ID,
        platform_role: "none",
        deactivated_at: "2026-05-10T12:00:00.000Z",
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/account/permissions"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Your session expired. Please sign in again.",
    });
    expect(serviceFrom).not.toHaveBeenCalledWith("organization_memberships");
  });

  it("fails closed to user permissions when no live membership exists", async () => {
    enqueue("profiles", {
      data: {
        org_id: ORG_ID,
        platform_role: "none",
        deactivated_at: null,
      },
    });
    enqueue("organization_memberships", { data: null });

    const response = await GET(
      new NextRequest("http://localhost/api/account/permissions"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.role).toBe("user");
    expect(body.permissions.orgId).toBeNull();
    expect(body.permissions.isSuperAdmin).toBe(false);
    expect(body.permissions.isGridmaster).toBe(false);
  });
});
