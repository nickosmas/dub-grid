import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const loadMobilePersonWithAccess = vi.fn();
const insertMobileAuditLogEntry = vi.fn();
const dispatchNotificationEvent = vi.fn();

vi.mock("@/features/mobile/server", () => ({ requireMobileAuth }));
vi.mock("@/features/mobile/server/person-access", () => ({ loadMobilePersonWithAccess }));
vi.mock("@dubgrid/data-access", () => ({ insertMobileAuditLogEntry }));
vi.mock("@/features/notifications/server", () => ({ dispatchNotificationEvent }));

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";
const MEMBER_USER_ID = "33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-01-01T00:00:00.000Z";

function makePerson(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    employeeNumber: 1042,
    firstName: "Mina",
    lastName: "Diaz",
    employmentType: "full_time",
    phone: "",
    email: "mina@example.com",
    status: "active",
    orgRole: "admin",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [2],
    departmentIds: [],
    deptAdminIds: [],
    managementDepartmentIds: [],
    managementDeptAdminIds: [],
    contactNotes: "",
    statusChangedAt: null,
    statusNote: "",
    userId: MEMBER_USER_ID,
    version: 3,
    membershipUpdatedAt: UPDATED_AT,
    pendingInvitation: null,
    ...overrides,
  };
}

function loadedAdmin(
  role = "admin",
  stored: Record<string, boolean> | null = { canEditShifts: true },
) {
  return {
    person: makePerson({ orgRole: role }),
    userId: MEMBER_USER_ID,
    membership: {
      user_id: MEMBER_USER_ID,
      org_role: role,
      department_ids: [],
      dept_admin_ids: [],
      updated_at: UPDATED_AT,
      admin_permissions: stored,
    },
    pendingInvitation: null,
  };
}

function makeServiceClient(updatedRow: unknown = { id: "m-1" }) {
  const maybeSingle = vi.fn(async () => ({ data: updatedRow, error: null }));
  const chain = {
    update: vi.fn((_row: { admin_permissions: Record<string, boolean> }) => chain),
    eq: vi.fn(() => chain),
    select: vi.fn(() => ({ maybeSingle })),
  };
  return { from: vi.fn(() => chain), chain };
}

function authAs(serviceClient: unknown, permissions: Record<string, unknown> = {}) {
  requireMobileAuth.mockResolvedValue({
    currentOrg: { id: "org-1", name: "Calm Haven" },
    permissions: { canConfigureAdminPermissions: true, isGridmaster: false, ...permissions },
    serviceClient,
    user: { id: ACTOR_ID, email: "boss@example.com" },
  });
}

function request(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/mobile/v1/people/${EMPLOYEE_ID}/permissions`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const context = { params: Promise.resolve({ id: EMPLOYEE_ID }) };

describe("mobile person permissions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the shown permissions and keeps the fixed ones", async () => {
    const serviceClient = makeServiceClient();
    authAs(serviceClient);
    loadMobilePersonWithAccess.mockResolvedValue(loadedAdmin());

    const { PATCH } = await import("./person-permissions");
    const response = await PATCH(
      request({
        adminPermissions: {
          canViewReports: false,
          canManageEmployees: true,
          canManageOrgSettings: true,
        },
        expectedMembershipUpdatedAt: UPDATED_AT,
      }),
      context,
    );

    expect(response.status).toBe(200);
    const written = serviceClient.chain.update.mock.calls[0]?.[0].admin_permissions;
    expect(written).toMatchObject({
      canEditShifts: true,
      canViewReports: false,
      canManageEmployees: true,
      // Super Admin-only and always-on keys are not the request's to set.
      canManageOrgSettings: false,
      canViewSchedule: true,
    });
    expect(insertMobileAuditLogEntry).toHaveBeenCalledWith(
      serviceClient,
      expect.objectContaining({ action: "organization_access.updated" }),
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      ACTOR_ID,
      expect.objectContaining({
        action: "admin_permissions_changed",
        targetUserId: MEMBER_USER_ID,
      }),
    );
  });

  it("refuses anyone who isn't a Super Admin", async () => {
    authAs(makeServiceClient(), { canConfigureAdminPermissions: false });
    const { PATCH } = await import("./person-permissions");
    const response = await PATCH(
      request({ adminPermissions: {}, expectedMembershipUpdatedAt: UPDATED_AT }),
      context,
    );
    expect(response.status).toBe(403);
  });

  it("refuses someone who isn't an Admin, or their own account", async () => {
    authAs(makeServiceClient());
    const { PATCH } = await import("./person-permissions");

    loadMobilePersonWithAccess.mockResolvedValueOnce(loadedAdmin("user", null));
    expect(
      (
        await PATCH(
          request({ adminPermissions: {}, expectedMembershipUpdatedAt: UPDATED_AT }),
          context,
        )
      ).status,
    ).toBe(400);

    loadMobilePersonWithAccess.mockResolvedValueOnce({ ...loadedAdmin(), userId: ACTOR_ID });
    expect(
      (
        await PATCH(
          request({ adminPermissions: {}, expectedMembershipUpdatedAt: UPDATED_AT }),
          context,
        )
      ).status,
    ).toBe(403);
  });

  it("answers a stale screen with a conflict and writes nothing", async () => {
    const serviceClient = makeServiceClient();
    authAs(serviceClient);
    loadMobilePersonWithAccess.mockResolvedValue(loadedAdmin());

    const { PATCH } = await import("./person-permissions");
    const response = await PATCH(
      request({
        adminPermissions: { canViewReports: false },
        expectedMembershipUpdatedAt: "2025-12-31T00:00:00.000Z",
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(serviceClient.chain.update).not.toHaveBeenCalled();
  });
});
