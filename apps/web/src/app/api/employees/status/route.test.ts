import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS } from "@dubgrid/client-errors";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const canManageEmployees = vi.fn();
const membershipMaybeSingle = vi.fn();
const profileSingle = vi.fn();
const employeeCurrentSingle = vi.fn();
const employeeUpdateMaybeSingle = vi.fn();
const membershipRestoreUpdate = vi.fn();
const membershipArchiveUpdate = vi.fn();
const targetMembershipMaybeSingle = vi.fn();
const superAdminCountIs = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));

vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
}));

const cacheDel = vi.fn();
vi.mock("@/lib/cache", () => ({
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  CacheKey: {
    orgUsers: (orgId: string) => `dg:org:${orgId}:orgUsers`,
    orgDirectory: (orgId: string) => `dg:org:${orgId}:orgDirectory`,
    employees: (orgId: string) => `dg:org:${orgId}:employees`,
    allUsers: () => "dg:gm:allUsers",
  },
  cacheThrough: (_key: string, _ttl: number, fetcher: () => unknown) => fetcher(),
  TTL: { MODERATE: 60 },
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "organization_memberships") {
        return {
          // Dispatches on the select() columns, since a single request can
          // issue up to three distinct organization_memberships selects: the
          // permission-check ("org_role, admin_permissions"), the
          // last-super-admin target lookup ("org_role"), and its count
          // query ("*", { count }).
          select: vi.fn((cols: string, opts?: { count?: string }) => {
            if (opts?.count) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: superAdminCountIs,
                  })),
                })),
              };
            }
            if (cols === "org_role") {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      maybeSingle: targetMembershipMaybeSingle,
                    })),
                  })),
                })),
              };
            }
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({ maybeSingle: membershipMaybeSingle })),
                })),
              })),
            };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: membershipRestoreUpdate,
                is: membershipArchiveUpdate,
              })),
            })),
          })),
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: profileSingle,
            })),
          })),
        };
      }

      if (table === "employees") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: employeeCurrentSingle,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: employeeUpdateMaybeSingle,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "audit_log") {
        return { insert: auditInsert };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const EMP_ID = "33333333-3333-4333-8333-333333333333";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function makeRequest() {
  return new NextRequest("http://localhost/api/employees/status", {
    method: "POST",
    body: JSON.stringify({
      empId: EMP_ID,
      orgId: ORG_ID,
      action: "deactivate",
      expectedVersion: 1,
    }),
  });
}

describe("POST /api/employees/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({ user: { id: USER_ID } });
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    validateCsrfOrigin.mockReturnValue(null);
    resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
    canManageEmployees.mockResolvedValue(true);
  });

  it("denies an inactive admin from changing another employee's status even with canManageEmployees", async () => {
    canManageEmployees.mockResolvedValue(false);
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES });
  });

  it("does not deny an inactive super_admin (bypass, matches account/permissions/route.ts)", async () => {
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });

    const response = await POST(makeRequest());

    // The permission gate lets a super_admin through regardless of `inactive`;
    // the employees row-fetch mock isn't configured with a resolved value in
    // this test, so getting past the 403 surfaces as a 500 rather than a
    // successful update. That's enough to prove the gate itself did not block them.
    expect(response.status).not.toBe(403);
  });

  it("does not deny an inactive gridmaster (bypass, matches account/permissions/route.ts)", async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });

    const response = await POST(makeRequest());

    expect(response.status).not.toBe(403);
  });

  it("restores an archived organization membership when reactivating a removed employee", async () => {
    const EMPLOYEE_USER_ID = "44444444-4444-4444-8444-444444444444";

    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "removed",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    employeeUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 2,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    membershipRestoreUpdate.mockResolvedValue({ error: null });
    auditInsert.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "activate",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    // The Remove-from-staff flow archives organization_memberships alongside
    // the employees.status flip — reactivating must undo both, or the user
    // passes employees.status but still can't log in.
    expect(membershipRestoreUpdate).toHaveBeenCalled();
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:org:${ORG_ID}:orgUsers`,
      `dg:org:${ORG_ID}:orgDirectory`,
      `dg:org:${ORG_ID}:employees`,
      "dg:gm:allUsers",
    );
  });

  it("archives the organization membership when a super_admin removes a linked employee", async () => {
    const EMPLOYEE_USER_ID = "55555555-5555-4555-8555-555555555555";

    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    employeeUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "removed",
        version: 2,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    // Target isn't a super_admin, so the last-super-admin guard passes through
    // without needing the count query.
    targetMembershipMaybeSingle.mockResolvedValue({ data: { org_role: "user" }, error: null });
    membershipArchiveUpdate.mockResolvedValue({ error: null });
    auditInsert.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "remove",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    // Access revocation happens in the same request as the status change —
    // not a second, separately-triggered client call — so a failed status
    // update can never leave access revoked for a still-active employee.
    expect(membershipArchiveUpdate).toHaveBeenCalled();
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:org:${ORG_ID}:orgUsers`,
      `dg:org:${ORG_ID}:orgDirectory`,
      `dg:org:${ORG_ID}:employees`,
      "dg:gm:allUsers",
    );
  });

  it("uses the effective (sandbox-redirected) org id for the mutation, not the raw requested org id (H-1)", async () => {
    const EMPLOYEE_USER_ID = "88888888-8888-4888-8888-888888888888";

    // The caller's request body carries the REAL org id, but a sandbox
    // cookie is active — resolveEffectiveOrgId redirects to the sandbox.
    // Every downstream write/cache-key/audit-log call must use the
    // resolved (sandbox) org, never the raw requested one.
    resolveEffectiveOrgId.mockResolvedValue(SANDBOX_ORG_ID);
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: SANDBOX_ORG_ID,
        status: "active",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    employeeUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: SANDBOX_ORG_ID,
        status: "removed",
        version: 2,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    targetMembershipMaybeSingle.mockResolvedValue({ data: { org_role: "user" }, error: null });
    membershipArchiveUpdate.mockResolvedValue({ error: null });
    auditInsert.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "remove",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), USER_ID, ORG_ID);
    // Cache keys and the audit log must be built from the effective (sandbox)
    // org, not the raw request body org — this is the guarantee that was
    // previously untested (the mock echoed its input, so divergence was
    // never actually exercised).
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:org:${SANDBOX_ORG_ID}:orgUsers`,
      `dg:org:${SANDBOX_ORG_ID}:orgDirectory`,
      `dg:org:${SANDBOX_ORG_ID}:employees`,
      "dg:gm:allUsers",
    );
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ org_id: SANDBOX_ORG_ID }));
  });

  it("refuses to remove the org's only super_admin", async () => {
    const EMPLOYEE_USER_ID = "77777777-7777-4777-8777-777777777777";

    // The actor is a gridmaster here specifically because a super_admin actor
    // removing another super_admin can never hit count <= 1 (removing them
    // still leaves the actor); a gridmaster has no org_role of their own, so
    // this is the scenario that actually reaches the count == 1 case.
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    targetMembershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin" },
      error: null,
    });
    superAdminCountIs.mockResolvedValue({ count: 1, error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "remove",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    // Removing staff already fully blocks login at the JWT hook regardless of
    // org_role, so this must be refused before the employees row is ever
    // touched — the same protection DELETE /api/organizations/access applies.
    expect(employeeUpdateMaybeSingle).not.toHaveBeenCalled();
  });

  it("does not touch organization membership when a non-super-admin reactivates a linked employee", async () => {
    const EMPLOYEE_USER_ID = "66666666-6666-4666-8666-666666666666";

    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "removed",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    employeeUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 2,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    auditInsert.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "activate",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    // Only gridmaster/super_admin may change org membership access — the same
    // tier required by DELETE /api/organizations/access — so a plain admin
    // with canManageEmployees can't use Activate as a side door to restore it.
    expect(membershipRestoreUpdate).not.toHaveBeenCalled();
    expect(membershipArchiveUpdate).not.toHaveBeenCalled();
  });
});
