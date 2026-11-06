import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const isOrgSuperAdminOrGridmaster = vi.fn();
const deleteUserAccountWithCleanup = vi.fn();

const ORG_ID = "2f8a4b6e-0a8d-4a58-9d3a-0f6f1f0a1b11";
const EMP_ID = "d660d308-4e0d-4daf-84fd-6753405e6740";
const ACTOR_ID = "a1111111-1111-4111-8111-111111111111";
const PERSON_ID = "b2222222-2222-4222-8222-222222222222";

let employeeRow: Record<string, unknown> | null;
let otherMemberships: number;
let platformRole: string | null;
const auditRows: Array<Record<string, unknown>> = [];
const requestUpdates: Array<Record<string, unknown>> = [];

function table(name: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ["select", "eq", "neq", "is"]) chain[method] = vi.fn(self);
  chain.update = vi.fn((values: Record<string, unknown>) => {
    if (name === "profile_change_requests") requestUpdates.push(values);
    return chain;
  });
  chain.insert = vi.fn(async (values: Record<string, unknown>) => {
    if (name === "audit_log") auditRows.push(values);
    return { error: null };
  });
  chain.maybeSingle = vi.fn(async () => {
    if (name === "employees") return { data: employeeRow, error: null };
    if (name === "profiles") {
      return { data: platformRole ? { platform_role: platformRole } : {}, error: null };
    }
    return { data: null, error: null };
  });
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [], error: null, count: otherMemberships });
  return chain;
}

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (...args: unknown[]) => forbidIfSandboxCookie(...args),
  requireAuthenticatedUser: (...args: unknown[]) => requireAuthenticatedUser(...args),
  requireSensitiveActionAuth: (...args: unknown[]) => requireSensitiveActionAuth(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: async () => ({ limited: false, reset: 0, misconfigured: false }),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: table }) }));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: async (_req: unknown, _user: unknown, orgId: string) => orgId,
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: async () => true,
  isOrgSuperAdminOrGridmaster: (...args: unknown[]) => isOrgSuperAdminOrGridmaster(...args),
}));
vi.mock("@/lib/db/mappers", () => ({ rowToEmployee: (row: unknown) => row }));
vi.mock("@/lib/db/shared", () => ({ EMPLOYEE_COLS: "*" }));
vi.mock("@/features/account/server/account-deletion", () => ({
  deleteUserAccountWithCleanup: (...args: unknown[]) => deleteUserAccountWithCleanup(...args),
}));
vi.mock("@/features/mobile/server/management-roster", () => ({ getRequestIp: () => null }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

function request(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/employees/delete-account", {
    method: "POST",
    body: JSON.stringify({
      orgId: ORG_ID,
      empId: EMP_ID,
      confirmation: "DELETE ACCOUNT",
      ...body,
    }),
  });
}

async function post(body?: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(request(body));
}

describe("/api/employees/delete-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditRows.length = 0;
    requestUpdates.length = 0;
    employeeRow = { id: EMP_ID, userId: PERSON_ID, email: "a@b.test", status: "removed" };
    otherMemberships = 0;
    platformRole = null;
    forbidIfSandboxCookie.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({ user: { id: ACTOR_ID } });
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: ACTOR_ID, email: "s@x.test" } });
    isOrgSuperAdminOrGridmaster.mockResolvedValue(true);
    deleteUserAccountWithCleanup.mockResolvedValue({ success: true });
  });

  it("deletes an offboarded person's account and records it", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(deleteUserAccountWithCleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PERSON_ID,
        actorId: ACTOR_ID,
        reason: "super_admin_deleted",
      }),
    );
    expect(auditRows[0]).toMatchObject({
      org_id: ORG_ID,
      action: "employee.account_deleted",
      resource_id: EMP_ID,
    });
    expect(requestUpdates[0]).toMatchObject({ status: "approved", resolver_user_id: ACTOR_ID });
  });

  it("asks for fresh proof", async () => {
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json({ error: "step up" }, { status: 403 }),
    });

    expect((await post()).status).toBe(403);
    expect(deleteUserAccountWithCleanup).not.toHaveBeenCalled();
  });

  it("refuses from a sandbox", async () => {
    forbidIfSandboxCookie.mockReturnValue(NextResponse.json({ error: "sandbox" }, { status: 403 }));

    expect((await post()).status).toBe(403);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });

  it("refuses anyone but a Super Admin", async () => {
    isOrgSuperAdminOrGridmaster.mockResolvedValue(false);

    expect((await post()).status).toBe(403);
    expect(deleteUserAccountWithCleanup).not.toHaveBeenCalled();
  });

  it("needs the exact confirmation", async () => {
    expect((await post({ confirmation: "delete account" })).status).toBe(400);
    expect(deleteUserAccountWithCleanup).not.toHaveBeenCalled();
  });

  it("refuses someone who hasn't been offboarded", async () => {
    employeeRow = { ...employeeRow, status: "active" };

    const response = await post();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Offboard them before deleting their account.",
    });
    expect(deleteUserAccountWithCleanup).not.toHaveBeenCalled();
  });

  it("refuses an account also used in another organization", async () => {
    otherMemberships = 1;

    const response = await post();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("also used outside your organization");
    expect(deleteUserAccountWithCleanup).not.toHaveBeenCalled();
  });

  it("refuses the person's own account", async () => {
    employeeRow = { ...employeeRow, userId: ACTOR_ID };

    expect((await post()).status).toBe(403);
    expect(deleteUserAccountWithCleanup).not.toHaveBeenCalled();
  });

  it("refuses someone with no account, and a Gridmaster", async () => {
    employeeRow = { ...employeeRow, userId: null };
    expect((await post()).status).toBe(409);

    employeeRow = { ...employeeRow, userId: PERSON_ID };
    platformRole = "gridmaster";
    expect((await post()).status).toBe(403);
    expect(deleteUserAccountWithCleanup).not.toHaveBeenCalled();
  });

  it("passes on the only-Super-Admin refusal", async () => {
    deleteUserAccountWithCleanup.mockRejectedValue(
      new Error("They're the only Super Admin of an organization. Make someone else one first."),
    );

    expect((await post()).status).toBe(409);
  });

  it("says whether the account is used elsewhere, to a Super Admin only", async () => {
    const { GET } = await import("./route");
    const url = `http://localhost/api/employees/delete-account?orgId=${ORG_ID}&empId=${EMP_ID}`;
    otherMemberships = 2;

    const response = await GET(new NextRequest(url));
    expect(await response.json()).toEqual({ usedElsewhere: true });

    isOrgSuperAdminOrGridmaster.mockResolvedValue(false);
    expect((await GET(new NextRequest(url))).status).toBe(403);
  });
});
