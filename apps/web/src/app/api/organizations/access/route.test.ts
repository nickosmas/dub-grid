import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const requireOrgPermissions = vi.fn();
const dispatchNotificationEvent = vi.fn();
const membershipSelectEq2 = vi.fn();
const membershipUpdateEq3 = vi.fn();
const profileMaybeSingle = vi.fn();
const getUserById = vi.fn();
const auditInsert = vi.fn();
const superAdminCountIs = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/access-management", () => ({
  buildMembershipAccessChanges: vi.fn(() => []),
  buildMembershipRemovalChanges: vi.fn(() => []),
}));
vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));
// Identity-ish mapper so tests can control the shape of `currentUser` directly
// via the mocked membership row, instead of dealing with the real mapping.
vi.mock("@/lib/db/mappers", () => ({
  membershipRowToOrganizationUser: (row: Record<string, unknown>) => ({
    userId: row.user_id,
    orgRole: row.org_role,
    adminPermissions: row.admin_permissions ?? null,
    updatedAt: row.updated_at,
  }),
}));

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_USER_ID = "33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-01-01T00:00:00.000Z";

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "organization_memberships") {
        return {
          select: vi.fn((_cols: string, opts?: { count?: string }) => {
            if (opts?.count) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: superAdminCountIs,
                  })),
                })),
              };
            }
            return {
              eq: vi.fn((_userIdCol: string, userId: string) => ({
                eq: vi.fn((_orgIdCol: string, orgId: string) => ({
                  maybeSingle: () => membershipSelectEq2(userId, orgId),
                })),
              })),
            };
          }),
          update: vi.fn(() => ({
            eq: vi.fn((_userIdCol: string, userId: string) => ({
              eq: vi.fn((_orgIdCol: string, orgId: string) => ({
                eq: vi.fn((_updatedAtCol: string, updatedAt: string) => ({
                  select: vi.fn(() => ({
                    maybeSingle: () => membershipUpdateEq3(userId, orgId, updatedAt),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: profileMaybeSingle,
            })),
          })),
        };
      }
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    auth: { admin: { getUserById } },
  }),
}));

function makeDeleteRequest() {
  return new NextRequest("http://localhost/api/organizations/access", {
    method: "DELETE",
    body: JSON.stringify({
      orgId: REQUESTED_ORG_ID,
      userId: TARGET_USER_ID,
      expectedUpdatedAt: UPDATED_AT,
    }),
  });
}

describe("DELETE /api/organizations/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({ user: { id: ACTOR_ID } });
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    profileMaybeSingle.mockResolvedValue({
      data: { first_name: "Target", last_name: "User", platform_role: "none", created_at: null },
      error: null,
    });
    getUserById.mockResolvedValue({ data: { user: { email: "target@test.com" } } });
    auditInsert.mockResolvedValue({ error: null });
  });

  it("mutates the effective (sandbox-redirected) org, not the raw requested org id (H-1)", async () => {
    // requireOrgPermissions redirects: caller's request carries the REAL org,
    // but a sandbox cookie is active, so the effective org is the sandbox.
    requireOrgPermissions.mockResolvedValue({ orgId: SANDBOX_ORG_ID });

    const membershipRow = {
      user_id: TARGET_USER_ID,
      org_id: SANDBOX_ORG_ID,
      org_role: "admin",
      admin_permissions: null,
      updated_at: UPDATED_AT,
    };
    membershipSelectEq2.mockResolvedValue({ data: membershipRow, error: null });
    membershipUpdateEq3.mockResolvedValue({ data: { id: "m-1" }, error: null });

    const { DELETE } = await import("./route");
    const res = await DELETE(makeDeleteRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.anything(),
      REQUESTED_ORG_ID,
      expect.any(Function),
    );
    // Every downstream call must use the SANDBOX org, never the raw requested org.
    expect(membershipSelectEq2).toHaveBeenCalledWith(TARGET_USER_ID, SANDBOX_ORG_ID);
    expect(membershipUpdateEq3).toHaveBeenCalledWith(TARGET_USER_ID, SANDBOX_ORG_ID, UPDATED_AT);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ org_id: SANDBOX_ORG_ID }));
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      ACTOR_ID,
      expect.objectContaining({ orgId: SANDBOX_ORG_ID }),
    );
    expect(body.success).toBe(true);
  });
});
