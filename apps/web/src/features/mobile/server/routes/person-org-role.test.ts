import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const loadMobilePersonWithAccess = vi.fn();
const replaceMobilePendingInvitationAccessRow = vi.fn();
const rollbackMobilePendingInvitationAccessReplacement = vi.fn();
const updateMobileMembershipAccessRow = vi.fn();
const changeMobileMembershipOrgRole = vi.fn();
const insertMobileAuditLogEntry = vi.fn();
const dispatchNotificationEvent = vi.fn();
const sendInvitationEmail = vi.fn();
const getInvitationEmailConfig = vi.fn();
const loggerError = vi.fn();

vi.mock("@/features/mobile/server", () => ({ requireMobileAuth }));

vi.mock("@/features/mobile/server/person-access", () => ({ loadMobilePersonWithAccess }));

vi.mock("@dubgrid/data-access", () => ({
  changeMobileMembershipOrgRole,
  insertMobileAuditLogEntry,
  replaceMobilePendingInvitationAccessRow,
  rollbackMobilePendingInvitationAccessReplacement,
  updateMobileMembershipAccessRow,
}));

vi.mock("@/features/notifications/server", () => ({ dispatchNotificationEvent }));

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
const REPLACEMENT_ID = "66666666-6666-4666-8666-666666666666";

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

/** A linked member who also manages two departments. */
function loadedMember(overrides: Record<string, unknown> = {}) {
  return {
    person: makePerson({
      userId: MEMBER_USER_ID,
      orgRole: "user",
      managementDepartmentIds: [9, 12],
      membershipUpdatedAt: "2026-01-01T00:00:00.000Z",
    }),
    userId: MEMBER_USER_ID,
    membership: {
      user_id: MEMBER_USER_ID,
      org_role: "user",
      department_ids: [9, 12],
      dept_admin_ids: [9],
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    pendingInvitation: null,
    ...overrides,
  };
}

function loadedInvitee(overrides: Record<string, unknown> = {}) {
  return {
    person: makePerson({
      pendingInvitation: {
        id: INVITATION_ID,
        email: "mina@example.com",
        expiresAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        roleToAssign: "user",
      },
    }),
    userId: null,
    membership: null,
    pendingInvitation: {
      id: INVITATION_ID,
      email: "mina@example.com",
      role_to_assign: "user",
      department_ids: [9],
      dept_admin_ids: [9],
      updated_at: "2026-01-01T00:00:00.000Z",
    },
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

function makeRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/mobile/v1/people/${EMPLOYEE_ID}/access`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function makeContext() {
  return { params: Promise.resolve({ id: EMPLOYEE_ID }) };
}

describe("mobile person org-role route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <a@b.c>" });
    sendInvitationEmail.mockResolvedValue(undefined);
    rollbackMobilePendingInvitationAccessReplacement.mockResolvedValue(true);
    changeMobileMembershipOrgRole.mockResolvedValue({ status: "changed" });
    replaceMobilePendingInvitationAccessRow.mockResolvedValue({
      previousInvitationId: INVITATION_ID,
      invitation: {
        id: REPLACEMENT_ID,
        token: "invite-token",
        email: "mina@example.com",
        updated_at: null,
      },
    });
    loadMobilePersonWithAccess.mockResolvedValue(loadedMember());
  });

  it("refuses anyone who isn't a super admin or gridmaster", async () => {
    mockAuth({ permissions: { canManageUsers: false, canManageEmployees: true } });

    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(makeRequest({ orgRole: "admin" }), makeContext());

    expect(response.status).toBe(403);
    expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
  });

  it("refuses to let an actor change their own role", async () => {
    loadMobilePersonWithAccess.mockResolvedValue(
      loadedMember({
        person: makePerson({ userId: ACTOR_ID, orgRole: "admin" }),
        userId: ACTOR_ID,
        membership: {
          user_id: ACTOR_ID,
          org_role: "admin",
          department_ids: [],
          dept_admin_ids: [],
          updated_at: null,
        },
      }),
    );

    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(makeRequest({ orgRole: "super_admin" }), makeContext());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("SELF_ACTION_FORBIDDEN");
    expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
  });

  it("refuses to change the role of removed staff", async () => {
    loadMobilePersonWithAccess.mockResolvedValue(
      loadedMember({ person: makePerson({ userId: MEMBER_USER_ID, status: "removed" }) }),
    );

    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(makeRequest({ orgRole: "admin" }), makeContext());

    expect(response.status).toBe(400);
    expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
  });

  // A direct `UPDATE ... SET org_role` is rejected by the guard_org_role_change
  // trigger ("Direct org_role changes are not allowed. Use change_user_role()
  // RPC."), which is a 500 the app reports as "DubGrid isn't responding
  // correctly". Pinning the RPC here because the first version of this route
  // used the row update and every one of these tests still passed.
  it("changes the role through the RPC, never a direct column write", async () => {
    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(
      makeRequest({ orgRole: "admin", expectedMembershipUpdatedAt: "2026-01-01T00:00:00.000Z" }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result).toBe("membership_updated");
    expect(changeMobileMembershipOrgRole).toHaveBeenCalledWith(
      {},
      {
        orgId: "44444444-4444-4444-8444-444444444444",
        targetUserId: MEMBER_USER_ID,
        actorUserId: ACTOR_ID,
        orgRole: "admin",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    // The RPC touches only org_role, so management departments survive by
    // construction rather than by being handed back in.
    expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      ACTOR_ID,
      expect.objectContaining({ action: "role_changed", fromRole: "user", toRole: "admin" }),
    );
  });

  it("answers 409 when the RPC reports the membership moved on", async () => {
    changeMobileMembershipOrgRole.mockResolvedValue({ status: "conflict" });

    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(
      makeRequest({ orgRole: "admin", expectedMembershipUpdatedAt: "2026-01-01T00:00:00.000Z" }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("ORG_ACCESS_CONFLICT");
    expect(insertMobileAuditLogEntry).not.toHaveBeenCalled();
  });

  // Demoting the last super admin would lock the org out of its own settings.
  it("surfaces a refusal from the RPC rather than logging it as done", async () => {
    loadMobilePersonWithAccess.mockResolvedValue(
      loadedMember({
        membership: {
          user_id: MEMBER_USER_ID,
          org_role: "super_admin",
          department_ids: [9, 12],
          dept_admin_ids: [9],
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    changeMobileMembershipOrgRole.mockResolvedValue({
      status: "blocked",
      message: "Cannot demote the only super admin. Transfer ownership first.",
    });

    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(
      makeRequest({ orgRole: "user", expectedMembershipUpdatedAt: "2026-01-01T00:00:00.000Z" }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("only super admin");
    expect(insertMobileAuditLogEntry).not.toHaveBeenCalled();
  });

  it("rejects a stale membership guard without writing", async () => {
    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(
      makeRequest({ orgRole: "admin", expectedMembershipUpdatedAt: "2020-01-01T00:00:00.000Z" }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("ORG_ACCESS_CONFLICT");
    expect(changeMobileMembershipOrgRole).not.toHaveBeenCalled();
  });

  it("does not write when the role already matches", async () => {
    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(
      makeRequest({ orgRole: "user", expectedMembershipUpdatedAt: "2026-01-01T00:00:00.000Z" }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result).toBe("unchanged");
    expect(changeMobileMembershipOrgRole).not.toHaveBeenCalled();
  });

  it("replaces the invitation when the invitee has no account yet", async () => {
    loadMobilePersonWithAccess.mockResolvedValue(loadedInvitee());

    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(
      makeRequest({ orgRole: "admin", expectedInvitationUpdatedAt: "2026-01-01T00:00:00.000Z" }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result).toBe("invitation_replaced");
    expect(replaceMobilePendingInvitationAccessRow).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        roleToAssign: "admin",
        departmentIds: [9],
        deptAdminIds: [9],
      }),
    );
    expect(sendInvitationEmail).toHaveBeenCalled();
  });

  it("rolls the replacement back when the invitation email fails", async () => {
    loadMobilePersonWithAccess.mockResolvedValue(loadedInvitee());
    sendInvitationEmail.mockRejectedValue(new Error("smtp down"));

    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(
      makeRequest({ orgRole: "admin", expectedInvitationUpdatedAt: "2026-01-01T00:00:00.000Z" }),
      makeContext(),
    );

    expect(response.status).toBe(502);
    expect(rollbackMobilePendingInvitationAccessReplacement).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        previousInvitationId: INVITATION_ID,
        replacementInvitationId: REPLACEMENT_ID,
      }),
    );
    expect(insertMobileAuditLogEntry).not.toHaveBeenCalled();
  });

  // Nothing carries a role for someone with neither an account nor an invite,
  // so the app keeps the badge read-only and the route says why.
  it("refuses when there is no membership and no invitation", async () => {
    loadMobilePersonWithAccess.mockResolvedValue({
      person: makePerson(),
      userId: null,
      membership: null,
      pendingInvitation: null,
    });

    const { PATCH } = await import("./person-org-role");
    const response = await PATCH(makeRequest({ orgRole: "admin" }), makeContext());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Send an invitation");
    expect(replaceMobilePendingInvitationAccessRow).not.toHaveBeenCalled();
  });
});
