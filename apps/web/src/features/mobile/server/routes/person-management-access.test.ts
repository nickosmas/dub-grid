import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const loadMobilePersonWithAccess = vi.fn();
const fetchMobileDepartmentRows = vi.fn();
const createMobileEmployeeInvitationRow = vi.fn();
const refreshMobileEmployeeInvitationRow = vi.fn();
const revokeMobileEmployeeInvitationRow = vi.fn();
const updateMobileInvitationAssignmentsRow = vi.fn();
const updateMobileMembershipAccessRow = vi.fn();
const insertMobileAuditLogEntry = vi.fn();
const sendInvitationEmail = vi.fn();
const getInvitationEmailConfig = vi.fn();
const loggerError = vi.fn();

vi.mock("@/features/mobile/server", () => ({ requireMobileAuth }));

vi.mock("@/features/mobile/server/person-access", () => ({ loadMobilePersonWithAccess }));

vi.mock("@dubgrid/data-access", () => ({
  createMobileEmployeeInvitationRow,
  fetchMobileDepartmentRows,
  insertMobileAuditLogEntry,
  refreshMobileEmployeeInvitationRow,
  revokeMobileEmployeeInvitationRow,
  updateMobileInvitationAssignmentsRow,
  updateMobileMembershipAccessRow,
}));

vi.mock("@/features/mobile/server/invitation-email", async () => {
  const { NextResponse } = await import("next/server");
  return {
    getInvitationEmailConfig,
    sendInvitationEmail,
    createInvitationEmailUnavailableResponse: () =>
      NextResponse.json({ error: "Email service not configured" }, { status: 503 }),
  };
});

vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn(), error: loggerError } }));

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";
const MEMBER_USER_ID = "33333333-3333-4333-8333-333333333333";
const INVITATION_ID = "22222222-2222-4222-8222-222222222222";

function makePerson(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    employeeNumber: 1042,
    firstName: "Mina",
    lastName: "Diaz",
    employmentType: "full_time",
    phone: "555-0100",
    email: "mina@example.com",
    status: "active",
    orgRole: null,
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
    userId: null,
    version: 3,
    membershipUpdatedAt: null,
    pendingInvitation: null,
    ...overrides,
  };
}

function mockAuth(overrides: Record<string, unknown> = {}) {
  requireMobileAuth.mockResolvedValue({
    currentOrg: { id: "44444444-4444-4444-8444-444444444444", name: "Calm Haven" },
    permissions: { canManageUsers: true, canManageEmployees: true },
    serviceClient: {},
    user: { id: ACTOR_ID, email: "admin@example.com" },
    ...overrides,
  });
}

function makeRequest(body: Record<string, unknown>, method = "PUT") {
  return new Request(`http://localhost/api/mobile/v1/people/${EMPLOYEE_ID}/management-access`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function makeContext() {
  return { params: Promise.resolve({ id: EMPLOYEE_ID }) };
}

describe("mobile person management-access route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <a@b.c>" });
    sendInvitationEmail.mockResolvedValue(undefined);
    fetchMobileDepartmentRows.mockResolvedValue([
      { id: 9, name: "Operations", abbr: "OPS", type: "management" },
      { id: 4, name: "North Wing", abbr: "NW", type: "scheduled" },
    ]);
    createMobileEmployeeInvitationRow.mockResolvedValue({
      id: INVITATION_ID,
      token: "invite-token",
      email: "mina@example.com",
      updated_at: null,
    });
    revokeMobileEmployeeInvitationRow.mockResolvedValue(null);
    loadMobilePersonWithAccess.mockResolvedValue({
      person: makePerson(),
      userId: null,
      membership: null,
      pendingInvitation: null,
    });
  });

  it("refuses anyone who isn't a super admin or gridmaster", async () => {
    mockAuth({ permissions: { canManageUsers: false, canManageEmployees: true } });

    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({ orgRole: "admin", managementDepartmentIds: [9] }),
      makeContext(),
    );

    expect(response.status).toBe(403);
    expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
  });

  it("refuses to let an actor grant themselves management access", async () => {
    loadMobilePersonWithAccess.mockResolvedValue({
      person: makePerson({ userId: ACTOR_ID }),
      userId: ACTOR_ID,
      membership: {
        user_id: ACTOR_ID,
        org_role: "admin",
        department_ids: [],
        dept_admin_ids: [],
        updated_at: null,
      },
      pendingInvitation: null,
    });

    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({ orgRole: "super_admin", managementDepartmentIds: [9] }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("SELF_ACTION_FORBIDDEN");
    expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
  });

  // A scheduled department id would otherwise be written straight onto the
  // membership, granting access keyed to a department the roster can't show.
  it("rejects department ids that aren't management departments", async () => {
    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({ orgRole: "admin", managementDepartmentIds: [4] }),
      makeContext(),
    );

    expect(response.status).toBe(400);
    expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
  });

  it("updates the membership when the person already has an account", async () => {
    loadMobilePersonWithAccess.mockResolvedValue({
      person: makePerson({ userId: MEMBER_USER_ID, membershipUpdatedAt: "2026-05-01T00:00:00Z" }),
      userId: MEMBER_USER_ID,
      membership: {
        user_id: MEMBER_USER_ID,
        org_role: "user",
        department_ids: [],
        // Held in a department that is about to be dropped from the selection.
        dept_admin_ids: [12],
        updated_at: "2026-05-01T00:00:00Z",
      },
      pendingInvitation: null,
    });
    updateMobileMembershipAccessRow.mockResolvedValue({ user_id: MEMBER_USER_ID });

    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({
        orgRole: "admin",
        managementDepartmentIds: [9],
        expectedMembershipUpdatedAt: "2026-05-01T00:00:00Z",
      }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result).toBe("membership_updated");
    expect(updateMobileMembershipAccessRow).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: MEMBER_USER_ID,
        orgRole: "admin",
        departmentIds: [9],
        // Dropped along with its department, rather than left dangling.
        deptAdminIds: [],
      }),
    );
    expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
  });

  it("409s rather than overwriting a membership that changed elsewhere", async () => {
    loadMobilePersonWithAccess.mockResolvedValue({
      person: makePerson({ userId: MEMBER_USER_ID, membershipUpdatedAt: "2026-05-02T00:00:00Z" }),
      userId: MEMBER_USER_ID,
      membership: {
        user_id: MEMBER_USER_ID,
        org_role: "user",
        department_ids: [],
        dept_admin_ids: [],
        updated_at: "2026-05-02T00:00:00Z",
      },
      pendingInvitation: null,
    });

    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({
        orgRole: "admin",
        managementDepartmentIds: [9],
        expectedMembershipUpdatedAt: "2026-05-01T00:00:00Z",
      }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("ORG_ACCESS_CONFLICT");
    expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
  });

  it("invites someone who has no account yet, carrying the role and departments", async () => {
    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({ orgRole: "admin", managementDepartmentIds: [9] }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result).toBe("invitation_sent");
    expect(createMobileEmployeeInvitationRow).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        employeeId: EMPLOYEE_ID,
        email: "mina@example.com",
        roleToAssign: "admin",
        departmentIds: [9],
      }),
    );
    expect(sendInvitationEmail).toHaveBeenCalled();
  });

  // Otherwise a failed send leaves a row that puts someone on the roster who
  // was never actually invited.
  it("rolls back an invitation it created when the email fails", async () => {
    sendInvitationEmail.mockRejectedValue(new Error("resend down"));

    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({ orgRole: "user", managementDepartmentIds: [9] }),
      makeContext(),
    );

    expect(response.status).toBe(502);
    expect(revokeMobileEmployeeInvitationRow).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ invitationId: INVITATION_ID }),
    );
  });

  // The pre-existing row wasn't this request's to destroy: revoking it would
  // take away access that has nothing to do with the failed email.
  it("leaves a pre-existing invitation alone when the resend email fails", async () => {
    loadMobilePersonWithAccess.mockResolvedValue({
      person: makePerson({
        pendingInvitation: {
          id: INVITATION_ID,
          email: "mina@example.com",
          expiresAt: "2026-06-01T00:00:00Z",
          updatedAt: "2026-05-01T00:00:00Z",
          roleToAssign: "user",
        },
      }),
      userId: null,
      membership: null,
      pendingInvitation: {
        id: INVITATION_ID,
        email: "mina@example.com",
        dept_admin_ids: [],
        updated_at: "2026-05-01T00:00:00Z",
      },
    });
    updateMobileInvitationAssignmentsRow.mockResolvedValue({
      id: INVITATION_ID,
      updated_at: "2026-05-01T00:00:01Z",
    });
    refreshMobileEmployeeInvitationRow.mockResolvedValue({
      id: INVITATION_ID,
      token: "fresh-token",
      email: "mina@example.com",
      updated_at: "2026-05-01T00:00:02Z",
    });
    sendInvitationEmail.mockRejectedValue(new Error("resend down"));

    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({
        orgRole: "admin",
        managementDepartmentIds: [9],
        expectedInvitationUpdatedAt: "2026-05-01T00:00:00Z",
      }),
      makeContext(),
    );

    expect(response.status).toBe(502);
    expect(revokeMobileEmployeeInvitationRow).not.toHaveBeenCalled();
  });

  it("clears the management departments on DELETE without touching the staff profile", async () => {
    loadMobilePersonWithAccess.mockResolvedValue({
      person: makePerson({
        userId: MEMBER_USER_ID,
        managementDepartmentIds: [9],
        membershipUpdatedAt: "2026-05-01T00:00:00Z",
      }),
      userId: MEMBER_USER_ID,
      membership: {
        user_id: MEMBER_USER_ID,
        org_role: "admin",
        department_ids: [9],
        dept_admin_ids: [9],
        updated_at: "2026-05-01T00:00:00Z",
      },
      pendingInvitation: null,
    });
    updateMobileMembershipAccessRow.mockResolvedValue({ user_id: MEMBER_USER_ID });

    const { DELETE } = await import("./person-management-access");
    const response = await DELETE(
      makeRequest({ expectedMembershipUpdatedAt: "2026-05-01T00:00:00Z" }, "DELETE"),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result).toBe("access_removed");
    expect(updateMobileMembershipAccessRow).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ departmentIds: [], deptAdminIds: [] }),
    );
    // The org role is deliberately left as it was — role changes go through PUT.
    expect(updateMobileMembershipAccessRow.mock.calls[0][1]).not.toHaveProperty("orgRole");
  });

  it("refuses to grant management access to removed staff", async () => {
    loadMobilePersonWithAccess.mockResolvedValue({
      person: makePerson({ status: "removed" }),
      userId: null,
      membership: null,
      pendingInvitation: null,
    });

    const { PUT } = await import("./person-management-access");
    const response = await PUT(
      makeRequest({ orgRole: "admin", managementDepartmentIds: [9] }),
      makeContext(),
    );

    expect(response.status).toBe(400);
    expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
  });
});
