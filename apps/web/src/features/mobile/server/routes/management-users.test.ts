import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobileManagementRosterRows = vi.fn();
const fetchMobileDepartmentRows = vi.fn();
const createMobileEmployeeInvitationRow = vi.fn();
const refreshMobileEmployeeInvitationRow = vi.fn();
const revokeMobileEmployeeInvitationRow = vi.fn();
const replaceMobilePendingInvitationAccessRow = vi.fn();
const rollbackMobilePendingInvitationAccessReplacement = vi.fn();
const updateMobileInvitationAssignmentsRow = vi.fn();
const updateMobileMembershipAccessRow = vi.fn();
const insertMobileAuditLogEntry = vi.fn();
const sendInvitationEmail = vi.fn();
const getInvitationEmailConfig = vi.fn();

vi.mock("@/features/mobile/server", () => ({ requireMobileAuth }));

vi.mock("@dubgrid/data-access", () => ({
  createMobileEmployeeInvitationRow,
  fetchMobileDepartmentRows,
  fetchMobileManagementRosterRows,
  insertMobileAuditLogEntry,
  refreshMobileEmployeeInvitationRow,
  replaceMobilePendingInvitationAccessRow,
  revokeMobileEmployeeInvitationRow,
  rollbackMobilePendingInvitationAccessReplacement,
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

vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

const ACTOR_ID = "55555555-5555-4555-8555-555555555555";
const MEMBER_USER_ID = "33333333-3333-4333-8333-333333333333";
const INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

function makeMembershipRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: MEMBER_USER_ID,
    org_role: "admin",
    department_ids: [9],
    dept_admin_ids: [],
    updated_at: "2026-05-01T00:00:00Z",
    first_name: "Rae",
    last_name: "Okafor",
    email: "rae@example.com",
    employee_id: null,
    employee_status: null,
    phone: "555-0111",
    ...overrides,
  };
}

function makeInvitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITATION_ID,
    org_id: "org-1",
    email: "new@example.com",
    role_to_assign: "admin",
    token: "invite-token",
    expires_at: "2026-06-01T00:00:00Z",
    accepted_at: null,
    revoked_at: null,
    updated_at: "2026-05-01T00:00:00Z",
    employee_id: null,
    first_name: "Sam",
    last_name: "Bell",
    phone: "",
    department_ids: [9],
    dept_admin_ids: [],
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

function makeRequest(body: Record<string, unknown> | null, method: string, path = "") {
  return new Request(`http://localhost/api/mobile/v1/management-users${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as never;
}

describe("mobile management-users routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <a@b.c>" });
    sendInvitationEmail.mockResolvedValue(undefined);
    revokeMobileEmployeeInvitationRow.mockResolvedValue(null);
    rollbackMobilePendingInvitationAccessReplacement.mockResolvedValue(true);
    fetchMobileDepartmentRows.mockResolvedValue([
      { id: 9, name: "Operations", abbr: "OPS", type: "management" },
      { id: 4, name: "North Wing", abbr: "NW", type: "scheduled" },
    ]);
    fetchMobileManagementRosterRows.mockResolvedValue({ memberships: [], invitations: [] });
  });

  describe("GET", () => {
    // Management-only people have no employees row, which is exactly why the
    // staff directory endpoint can't be reused for this list.
    it("returns members and pending invitations under one composite key each", async () => {
      fetchMobileManagementRosterRows.mockResolvedValue({
        memberships: [makeMembershipRow({ employee_id: EMPLOYEE_ID, employee_status: "active" })],
        invitations: [makeInvitationRow()],
      });

      const { GET } = await import("./management-users");
      const response = await GET(makeRequest(null, "GET"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.managementUsers).toEqual([
        expect.objectContaining({
          id: `u:${MEMBER_USER_ID}`,
          source: "member",
          userId: MEMBER_USER_ID,
          employeeId: EMPLOYEE_ID,
          employeeStatus: "active",
          orgRole: "admin",
          managementDepartmentIds: [9],
          updatedAt: "2026-05-01T00:00:00Z",
        }),
        expect.objectContaining({
          id: `inv:${INVITATION_ID}`,
          source: "pending_invite",
          userId: null,
          employeeId: null,
          invitationId: INVITATION_ID,
          orgRole: "admin",
        }),
      ]);
    });

    it("lets a staff manager read the roster without being able to change it", async () => {
      mockAuth({ permissions: { canManageUsers: false, canManageEmployees: true } });

      const { GET } = await import("./management-users");
      const response = await GET(makeRequest(null, "GET"));

      expect(response.status).toBe(200);
    });

    it("refuses someone with neither permission", async () => {
      mockAuth({ permissions: { canManageUsers: false, canManageEmployees: false } });

      const { GET } = await import("./management-users");
      const response = await GET(makeRequest(null, "GET"));

      expect(response.status).toBe(403);
    });
  });

  describe("POST", () => {
    const validInvite = {
      email: "new@example.com",
      firstName: "Sam",
      lastName: "Bell",
      orgRole: "admin",
      managementDepartmentIds: [9],
    };

    it("creates an invitation with no employee behind it", async () => {
      createMobileEmployeeInvitationRow.mockResolvedValue(makeInvitationRow());

      const { POST } = await import("./management-users");
      const response = await POST(makeRequest(validInvite, "POST"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.result).toBe("invitation_sent");
      expect(createMobileEmployeeInvitationRow).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          employeeId: null,
          email: "new@example.com",
          roleToAssign: "admin",
          departmentIds: [9],
        }),
      );
      expect(sendInvitationEmail).toHaveBeenCalled();
    });

    it("refuses a second invitation for someone already on the roster", async () => {
      fetchMobileManagementRosterRows.mockResolvedValue({
        memberships: [makeMembershipRow({ email: "New@Example.com" })],
        invitations: [],
      });

      const { POST } = await import("./management-users");
      const response = await POST(makeRequest(validInvite, "POST"));

      expect(response.status).toBe(409);
      expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    });

    it("rejects a scheduled department id", async () => {
      const { POST } = await import("./management-users");
      const response = await POST(
        makeRequest({ ...validInvite, managementDepartmentIds: [4] }, "POST"),
      );

      expect(response.status).toBe(400);
      expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    });

    it("revokes the row it just created when the email fails", async () => {
      createMobileEmployeeInvitationRow.mockResolvedValue(makeInvitationRow());
      sendInvitationEmail.mockRejectedValue(new Error("resend down"));

      const { POST } = await import("./management-users");
      const response = await POST(makeRequest(validInvite, "POST"));

      expect(response.status).toBe(502);
      expect(revokeMobileEmployeeInvitationRow).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ invitationId: INVITATION_ID }),
      );
    });

    it("refuses a viewer who can only read the roster", async () => {
      mockAuth({ permissions: { canManageUsers: false, canManageEmployees: true } });

      const { POST } = await import("./management-users");
      const response = await POST(makeRequest(validInvite, "POST"));

      expect(response.status).toBe(403);
      expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    });
  });

  describe("PUT / DELETE on one roster member", () => {
    function makeContext(personId: string) {
      return { params: Promise.resolve({ personId }) };
    }

    beforeEach(() => {
      fetchMobileManagementRosterRows.mockResolvedValue({
        memberships: [makeMembershipRow()],
        invitations: [makeInvitationRow()],
      });
    });

    it("updates a member's role and departments", async () => {
      updateMobileMembershipAccessRow.mockResolvedValue({ user_id: MEMBER_USER_ID });

      const { PUT } = await import("./management-user");
      const response = await PUT(
        makeRequest(
          {
            orgRole: "user",
            managementDepartmentIds: [9],
            expectedUpdatedAt: "2026-05-01T00:00:00Z",
          },
          "PUT",
        ),
        makeContext(`u:${MEMBER_USER_ID}`),
      );

      expect(response.status).toBe(200);
      expect(updateMobileMembershipAccessRow).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ userId: MEMBER_USER_ID, orgRole: "user", departmentIds: [9] }),
      );
    });

    it("revokes and replaces a pending invitation when its role changes", async () => {
      replaceMobilePendingInvitationAccessRow.mockResolvedValue({
        previousInvitationId: INVITATION_ID,
        invitation: makeInvitationRow({
          id: "99999999-9999-4999-8999-999999999999",
          role_to_assign: "super_admin",
          token: "replacement-token",
        }),
      });

      const { PUT } = await import("./management-user");
      const response = await PUT(
        makeRequest(
          {
            orgRole: "super_admin",
            managementDepartmentIds: [9],
            expectedUpdatedAt: "2026-05-01T00:00:00Z",
          },
          "PUT",
        ),
        makeContext(`inv:${INVITATION_ID}`),
      );

      expect(response.status).toBe(200);
      expect(replaceMobilePendingInvitationAccessRow).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ invitationId: INVITATION_ID, roleToAssign: "super_admin" }),
      );
      expect(updateMobileInvitationAssignmentsRow).not.toHaveBeenCalled();
      expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
      expect(sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ token: "replacement-token" }),
      );
    });

    it("restores the old management invitation when replacement delivery fails", async () => {
      replaceMobilePendingInvitationAccessRow.mockResolvedValue({
        previousInvitationId: INVITATION_ID,
        invitation: makeInvitationRow({
          id: "99999999-9999-4999-8999-999999999999",
          role_to_assign: "super_admin",
          token: "replacement-token",
        }),
      });
      sendInvitationEmail.mockRejectedValue(new Error("resend down"));

      const { PUT } = await import("./management-user");
      const response = await PUT(
        makeRequest(
          {
            orgRole: "super_admin",
            managementDepartmentIds: [9],
            expectedUpdatedAt: "2026-05-01T00:00:00Z",
          },
          "PUT",
        ),
        makeContext(`inv:${INVITATION_ID}`),
      );

      expect(response.status).toBe(502);
      expect(rollbackMobilePendingInvitationAccessReplacement).toHaveBeenCalledWith(
        {},
        {
          orgId: "44444444-4444-4444-8444-444444444444",
          previousInvitationId: INVITATION_ID,
          replacementInvitationId: "99999999-9999-4999-8999-999999999999",
        },
      );
    });

    it("409s on a stale expectedUpdatedAt", async () => {
      const { PUT } = await import("./management-user");
      const response = await PUT(
        makeRequest(
          {
            orgRole: "user",
            managementDepartmentIds: [9],
            expectedUpdatedAt: "2026-04-01T00:00:00Z",
          },
          "PUT",
        ),
        makeContext(`u:${MEMBER_USER_ID}`),
      );

      expect(response.status).toBe(409);
      expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
    });

    it("refuses to let an actor edit their own roster entry", async () => {
      fetchMobileManagementRosterRows.mockResolvedValue({
        memberships: [makeMembershipRow({ user_id: ACTOR_ID })],
        invitations: [],
      });

      const { PUT } = await import("./management-user");
      const response = await PUT(
        makeRequest(
          {
            orgRole: "user",
            managementDepartmentIds: [9],
            expectedUpdatedAt: "2026-05-01T00:00:00Z",
          },
          "PUT",
        ),
        makeContext(`u:${ACTOR_ID}`),
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.code).toBe("SELF_ACTION_FORBIDDEN");
    });

    it("404s on a person id it doesn't recognise", async () => {
      const { PUT } = await import("./management-user");
      const response = await PUT(
        makeRequest(
          { orgRole: "user", managementDepartmentIds: [9], expectedUpdatedAt: null },
          "PUT",
        ),
        makeContext("nonsense"),
      );

      expect(response.status).toBe(404);
    });

    // A member keeps their account; only the departments go.
    it("clears departments for a member on DELETE", async () => {
      updateMobileMembershipAccessRow.mockResolvedValue({ user_id: MEMBER_USER_ID });

      const { DELETE } = await import("./management-user");
      const response = await DELETE(
        makeRequest({ expectedUpdatedAt: "2026-05-01T00:00:00Z" }, "DELETE"),
        makeContext(`u:${MEMBER_USER_ID}`),
      );

      expect(response.status).toBe(200);
      expect(updateMobileMembershipAccessRow).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ departmentIds: [], deptAdminIds: [] }),
      );
      expect(revokeMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    });

    // A management-only invitation has nothing left behind it, so it goes.
    it("revokes the invitation for a pending entry on DELETE", async () => {
      revokeMobileEmployeeInvitationRow.mockResolvedValue(makeInvitationRow());

      const { DELETE } = await import("./management-user");
      const response = await DELETE(
        makeRequest({ expectedUpdatedAt: "2026-05-01T00:00:00Z" }, "DELETE"),
        makeContext(`inv:${INVITATION_ID}`),
      );

      expect(response.status).toBe(200);
      expect(revokeMobileEmployeeInvitationRow).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ invitationId: INVITATION_ID }),
      );
      expect(updateMobileMembershipAccessRow).not.toHaveBeenCalled();
    });
  });

  describe("invitation resend / revoke", () => {
    function makeContext(personId: string) {
      return { params: Promise.resolve({ personId }) };
    }

    beforeEach(() => {
      fetchMobileManagementRosterRows.mockResolvedValue({
        memberships: [makeMembershipRow()],
        invitations: [makeInvitationRow()],
      });
    });

    it("refreshes the token and emails it on resend", async () => {
      refreshMobileEmployeeInvitationRow.mockResolvedValue(
        makeInvitationRow({ token: "fresh-token" }),
      );

      const { POST } = await import("./management-user-invitation");
      const response = await POST(
        makeRequest({ action: "resend", expectedUpdatedAt: "2026-05-01T00:00:00Z" }, "POST"),
        makeContext(`inv:${INVITATION_ID}`),
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.result).toBe("invitation_resent");
      expect(sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ token: "fresh-token" }),
      );
      expect(insertMobileAuditLogEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "invitation.resent", resource_type: "invitation" }),
      );
    });

    it("revokes without sending anything", async () => {
      revokeMobileEmployeeInvitationRow.mockResolvedValue(makeInvitationRow());

      const { POST } = await import("./management-user-invitation");
      const response = await POST(
        makeRequest({ action: "revoke", expectedUpdatedAt: "2026-05-01T00:00:00Z" }, "POST"),
        makeContext(`inv:${INVITATION_ID}`),
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.result).toBe("invitation_revoked");
      expect(sendInvitationEmail).not.toHaveBeenCalled();
    });

    it("404s when the target has no pending invitation", async () => {
      const { POST } = await import("./management-user-invitation");
      const response = await POST(
        makeRequest({ action: "resend", expectedUpdatedAt: "2026-05-01T00:00:00Z" }, "POST"),
        makeContext(`u:${MEMBER_USER_ID}`),
      );

      expect(response.status).toBe(404);
      expect(refreshMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    });
  });
});
