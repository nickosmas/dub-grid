import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSensitiveActionAuth = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const canManageEmployees = vi.fn();
const isOrgSuperAdminOrGridmaster = vi.fn();
const checkEmployeeEmailConflict = vi.fn();
const endAccessInOrganization = vi.fn();
const scheduleSignInMovedNotice = vi.fn();
const sendPendingInvitationEmail = vi.fn();
const rpc = vi.fn();

const ORG_ID = "2f8a4b6e-0a8d-4a58-9d3a-0f6f1f0a1b11";
const EMP_ID = "d660d308-4e0d-4daf-84fd-6753405e6740";
const ACTOR_ID = "a1111111-1111-4111-8111-111111111111";
const PERSON_ID = "b2222222-2222-4222-8222-222222222222";

let employeeRow: Record<string, unknown> | null;
let membership: Record<string, unknown> | null;
let platformRole: string | null;
let superAdminCount: number;
let movedRow: Record<string, unknown> | null;
const employeeUpdates: Array<Record<string, unknown>> = [];
const auditRows: Array<Record<string, unknown>> = [];

function table(name: string) {
  const chain: Record<string, unknown> = {};
  let updating = false;
  const self = () => chain;
  for (const method of ["select", "eq", "is", "delete"]) chain[method] = vi.fn(self);
  chain.update = vi.fn((values: Record<string, unknown>) => {
    updating = true;
    if (name === "employees") employeeUpdates.push(values);
    return chain;
  });
  chain.insert = vi.fn(async (values: Record<string, unknown>) => {
    if (name === "audit_log") auditRows.push(values);
    return { error: null };
  });
  chain.maybeSingle = vi.fn(async () => {
    if (name === "employees") return { data: updating ? movedRow : employeeRow, error: null };
    if (name === "organization_memberships") return { data: membership, error: null };
    if (name === "profiles") {
      return { data: platformRole ? { platform_role: platformRole } : {}, error: null };
    }
    return { data: null, error: null };
  });
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [], error: null, count: superAdminCount });
  return chain;
}

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (...args: unknown[]) => forbidIfSandboxCookie(...args),
  requireSensitiveActionAuth: (...args: unknown[]) => requireSensitiveActionAuth(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  inviteLimiter: {},
  emailTargetLimiter: {},
  hashEmail: (value: string) => value,
  checkRateLimit: async () => ({ limited: false, reset: 0, misconfigured: false }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: table, rpc }),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: async (_req: unknown, _user: unknown, orgId: string) => orgId,
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
  isOrgSuperAdminOrGridmaster: (...args: unknown[]) => isOrgSuperAdminOrGridmaster(...args),
}));
vi.mock("@/lib/db/mappers", () => ({ rowToEmployee: (row: unknown) => row }));
vi.mock("@/lib/db/shared", () => ({ EMPLOYEE_COLS: "*" }));
vi.mock("@/lib/audit/invitation", () => ({ writeInvitationAuditEntry: vi.fn() }));
vi.mock("@/features/employees/server/contact-conflicts", () => ({
  checkEmployeeEmailConflict: (...args: unknown[]) => checkEmployeeEmailConflict(...args),
}));
vi.mock("@/features/employees/server/offboard-access", () => ({
  endAccessInOrganization: (...args: unknown[]) => endAccessInOrganization(...args),
}));
vi.mock("@/features/employees/server/sign-in-moved-notice", () => ({
  scheduleSignInMovedNotice: (...args: unknown[]) => scheduleSignInMovedNotice(...args),
}));
vi.mock("@/features/mobile/server/invitation-email", () => ({
  getInvitationEmailConfig: () => ({ apiKey: "key", from: "a@b.test" }),
  createInvitationEmailUnavailableResponse: () =>
    NextResponse.json({ error: "email" }, { status: 503 }),
}));
vi.mock("@/features/mobile/server/management-roster", () => ({ getRequestIp: () => null }));
vi.mock("@/features/notifications/server/events", () => ({ dispatchNotificationEvent: vi.fn() }));
vi.mock("@/features/organization/server/invitation-delivery", () => ({
  sendPendingInvitationEmail: (...args: unknown[]) => sendPendingInvitationEmail(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (work: () => unknown) => void work(),
}));

function request(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/employees/move-email", {
    method: "POST",
    body: JSON.stringify({
      orgId: ORG_ID,
      empId: EMP_ID,
      email: "new@dubgrid.test",
      expectedVersion: 3,
      ...body,
    }),
  });
}

describe("POST /api/employees/move-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    employeeUpdates.length = 0;
    auditRows.length = 0;
    employeeRow = {
      id: EMP_ID,
      userId: PERSON_ID,
      email: "old@dubgrid.test",
      status: "active",
      version: 3,
    };
    movedRow = { id: EMP_ID, userId: null, email: "new@dubgrid.test", version: 4 };
    membership = {
      org_role: "user",
      admin_permissions: null,
      department_ids: [],
      dept_admin_ids: [],
    };
    platformRole = null;
    superAdminCount = 2;
    forbidIfSandboxCookie.mockReturnValue(null);
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: ACTOR_ID, email: "m@x.test" } });
    canManageEmployees.mockResolvedValue(true);
    isOrgSuperAdminOrGridmaster.mockResolvedValue(false);
    checkEmployeeEmailConflict.mockResolvedValue({ conflict: false });
    endAccessInOrganization.mockResolvedValue(undefined);
    sendPendingInvitationEmail.mockResolvedValue(undefined);
    rpc.mockResolvedValue({
      data: { invitation_id: "invite-1", token: "token", expires_at: "2026-11-08T00:00:00Z" },
      error: null,
    });
  });

  async function post(body?: Record<string, unknown>) {
    const { POST } = await import("./route");
    return POST(request(body));
  }

  it("moves the record, ends access here, and invites the new address", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ invited: true });
    expect(employeeUpdates[0]).toEqual({
      user_id: null,
      email: "new@dubgrid.test",
      version: 4,
    });
    expect(endAccessInOrganization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: ORG_ID, userId: PERSON_ID, actorId: ACTOR_ID }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "send_invitation",
      expect.objectContaining({
        p_email: "new@dubgrid.test",
        p_role: "user",
        p_employee_id: EMP_ID,
        p_invited_by: ACTOR_ID,
      }),
    );
    expect(sendPendingInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "moved" }),
    );
    expect(scheduleSignInMovedNotice).toHaveBeenCalledWith(expect.anything(), {
      email: "old@dubgrid.test",
      orgId: ORG_ID,
    });
    expect(auditRows[0]).toMatchObject({
      action: "employee.moved_to_new_email",
      resource_id: EMP_ID,
    });
  });

  it("asks for fresh proof before anything else", async () => {
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json({ error: "step up" }, { status: 403 }),
    });

    expect((await post()).status).toBe(403);
    expect(employeeUpdates).toHaveLength(0);
  });

  it("refuses from a sandbox", async () => {
    forbidIfSandboxCookie.mockReturnValue(NextResponse.json({ error: "sandbox" }, { status: 403 }));

    expect((await post()).status).toBe(403);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });

  it("refuses someone who can't manage staff", async () => {
    canManageEmployees.mockResolvedValue(false);

    expect((await post()).status).toBe(403);
    expect(employeeUpdates).toHaveLength(0);
  });

  it.each([
    ["admin", "Only a Super Admin can move an Admin or Super Admin."],
    ["super_admin", "Only a Super Admin can move an Admin or Super Admin."],
  ])("refuses an Admin moving a %s", async (org_role, error) => {
    membership = { ...membership, org_role };

    const response = await post();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error });
    expect(employeeUpdates).toHaveLength(0);
  });

  it("keeps an Admin's permissions on the invite when a Super Admin moves them", async () => {
    isOrgSuperAdminOrGridmaster.mockResolvedValue(true);
    membership = { ...membership, org_role: "admin", admin_permissions: { canEditShifts: true } };

    expect((await post()).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "send_invitation",
      expect.objectContaining({ p_role: "admin" }),
    );
  });

  it("refuses to move an organization's only Super Admin", async () => {
    isOrgSuperAdminOrGridmaster.mockResolvedValue(true);
    membership = { ...membership, org_role: "super_admin" };
    superAdminCount = 1;

    expect((await post()).status).toBe(409);
    expect(employeeUpdates).toHaveLength(0);
  });

  it("refuses the person moving themselves", async () => {
    employeeRow = { ...employeeRow, userId: ACTOR_ID };

    expect((await post()).status).toBe(403);
  });

  it("refuses a Gridmaster account", async () => {
    platformRole = "gridmaster";

    expect((await post()).status).toBe(403);
    expect(employeeUpdates).toHaveLength(0);
  });

  it("refuses someone who hasn't joined", async () => {
    employeeRow = { ...employeeRow, userId: null };

    expect((await post()).status).toBe(409);
  });

  it("refuses someone Offboarded", async () => {
    employeeRow = { ...employeeRow, status: "removed" };

    expect((await post()).status).toBe(409);
  });

  it("refuses a stale version", async () => {
    const response = await post({ expectedVersion: 2 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "EMPLOYEE_CONFLICT" });
    expect(employeeUpdates).toHaveLength(0);
  });

  it("refuses a record that changed during the move", async () => {
    movedRow = null;

    expect((await post()).status).toBe(409);
    expect(endAccessInOrganization).not.toHaveBeenCalled();
  });

  it("refuses the address they already have", async () => {
    expect((await post({ email: "OLD@dubgrid.test" })).status).toBe(400);
    expect(employeeUpdates).toHaveLength(0);
  });

  it("refuses an email someone else uses", async () => {
    checkEmployeeEmailConflict.mockResolvedValue({
      conflict: true,
      reason: "employee_duplicate",
    });

    expect((await post()).status).toBe(409);
    expect(employeeUpdates).toHaveLength(0);
  });

  it("puts the record back when access can't be ended", async () => {
    endAccessInOrganization.mockRejectedValue(new Error("boom"));

    expect((await post()).status).toBe(500);
    expect(employeeUpdates[1]).toMatchObject({ user_id: PERSON_ID, email: "old@dubgrid.test" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the move when the invite can't send, and says so", async () => {
    sendPendingInvitationEmail.mockRejectedValue(new Error("mail down"));

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ invited: false });
    expect(endAccessInOrganization).toHaveBeenCalled();
  });
});
