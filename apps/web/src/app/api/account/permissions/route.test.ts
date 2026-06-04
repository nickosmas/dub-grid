import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const getImpersonationFromCookie = vi.fn();
const extractJwtClaims = vi.fn();
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
  getServiceClient: () => ({ from: serviceFrom }),
}));

// Keep the real buildPerms (so the returned permission shape is authentic) but
// control extractJwtClaims, which is what the route trusts to derive the
// caller's effective role + org from the access token.
vi.mock("@/features/permissions/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/permissions/shared")>();
  return {
    ...actual,
    extractJwtClaims: (token: string) => extractJwtClaims(token),
  };
});

import { GET } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_ORG_ID = "33333333-3333-4333-8333-333333333333";

const tableResults = new Map<string, Array<{ data: unknown; error: unknown }>>();

function enqueue(table: string, ...results: Array<{ data: unknown; error?: unknown }>) {
  tableResults.set(
    table,
    results.map((result) => ({ data: result.data, error: result.error ?? null })),
  );
}

function nextResult(table: string) {
  return tableResults.get(table)?.shift() ?? { data: null, error: null };
}

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(nextResult(table))),
    maybeSingle: vi.fn(() => Promise.resolve(nextResult(table))),
  };
  return query;
}

function makeAuth() {
  return {
    user: { id: USER_ID, email: "user@example.com" },
    session: { access_token: "test-token" },
    claims: { sub: USER_ID, platform_role: "none" },
  };
}

describe("GET /api/account/permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    requireAuthenticatedUserWithClaims.mockResolvedValue(makeAuth());
    getImpersonationFromCookie.mockReturnValue(null);
    serviceFrom.mockImplementation((table: string) => makeQuery(table));
    extractJwtClaims.mockReturnValue({ effectiveRole: "user", orgId: null });
  });

  function request() {
    return GET(new NextRequest("http://localhost/api/account/permissions"));
  }

  it("resolves super_admin permissions straight from the JWT claims", async () => {
    extractJwtClaims.mockReturnValue({ effectiveRole: "super_admin", orgId: ORG_ID });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.role).toBe("super_admin");
    expect(body.permissions.orgId).toBe(ORG_ID);
    expect(body.permissions.isSuperAdmin).toBe(true);
    // Privileged roles are trusted from the JWT; no membership lookup.
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("uses the JWT org claim, not the profile default, when they diverge", async () => {
    extractJwtClaims.mockReturnValue({
      effectiveRole: "super_admin",
      orgId: SECOND_ORG_ID,
    });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.orgId).toBe(SECOND_ORG_ID);
  });

  it("falls back to profile.org_id + live membership when the JWT lacks an org claim", async () => {
    extractJwtClaims.mockReturnValue({ effectiveRole: "admin", orgId: null });
    enqueue("profiles", {
      data: { org_id: ORG_ID, platform_role: "none" },
    });
    enqueue("organization_memberships", {
      data: { org_role: "admin", admin_permissions: null },
    });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.orgId).toBe(ORG_ID);
    expect(body.permissions.role).toBe("admin");
  });

  it("fails closed to user permissions when no live membership exists", async () => {
    extractJwtClaims.mockReturnValue({ effectiveRole: "user", orgId: null });
    enqueue("profiles", {
      data: { org_id: ORG_ID, platform_role: "none" },
    });
    enqueue("organization_memberships", { data: null });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.role).toBe("user");
    expect(body.permissions.orgId).toBeNull();
    expect(body.permissions.isSuperAdmin).toBe(false);
    expect(body.permissions.isGridmaster).toBe(false);
  });

  it("drops an inactive admin to read-only permissions", async () => {
    extractJwtClaims.mockReturnValue({ effectiveRole: "admin", orgId: ORG_ID });
    enqueue("employees", { data: { status: "inactive" } });
    enqueue("organization_memberships", {
      data: {
        org_role: "admin",
        admin_permissions: {
          canManageEmployees: true,
          canPublishSchedule: true,
          canEditShifts: true,
        },
      },
    });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.isInactive).toBe(true);
    expect(body.permissions.role).toBe("user");
    expect(body.permissions.level).toBe(0);
    expect(body.permissions.actualLevel).toBe(2);
    expect(body.permissions.canManageEmployees).toBe(false);
    expect(body.permissions.canPublishSchedule).toBe(false);
    expect(body.permissions.canEditShifts).toBe(false);
    expect(body.permissions.canViewSchedule).toBe(true);
    expect(body.permissions.orgId).toBe(ORG_ID);
  });

  it("does not consult employee status for super_admin or gridmaster", async () => {
    extractJwtClaims.mockReturnValue({ effectiveRole: "super_admin", orgId: ORG_ID });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.isInactive).toBe(false);
    expect(body.permissions.canManageEmployees).toBe(true);
    // No employees table read for privileged roles
    expect(serviceFrom).not.toHaveBeenCalledWith("employees");
  });
});
