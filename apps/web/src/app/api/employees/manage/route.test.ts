import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS } from "@dubgrid/client-errors";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const requireAuthenticatedUser = vi.fn();
const fetchMobileManagementMembershipRowsByUserIds = vi.fn();
const fetchMobilePendingInvitationRowByEmployeeId = vi.fn();
const rowToEmployee = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const updateUserById = vi.fn();
const followUpLinkedLoginEmailChange = vi.fn();
const employeeUpdatePayloads: unknown[] = [];

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (...args: unknown[]) => requireAuthenticatedUser(...args),
  forbidIfSandboxCookie: (...args: unknown[]) => forbidIfSandboxCookie(...args),
  requireSensitiveActionAuth: (...args: unknown[]) => requireSensitiveActionAuth(...args),
}));

vi.mock("@/features/employees/server/login-email-follow-up", () => ({
  followUpLinkedLoginEmailChange: (...args: unknown[]) => followUpLinkedLoginEmailChange(...args),
}));

vi.mock("@/app/api/shared/schedule", () => ({
  fetchAssignmentIdByPairMap: vi.fn(),
}));

vi.mock("@dubgrid/data-access", () => ({
  fetchMobileManagementMembershipRowsByUserIds: (...args: unknown[]) =>
    fetchMobileManagementMembershipRowsByUserIds(...args),
  fetchMobilePendingInvitationRowByEmployeeId: (...args: unknown[]) =>
    fetchMobilePendingInvitationRowByEmployeeId(...args),
}));

vi.mock("@/lib/db/mappers", () => ({
  employeeToRow: vi.fn(),
  rowToEmployee: (...args: unknown[]) => rowToEmployee(...args),
  rowToInvitation: vi.fn(),
}));

import { POST } from "./route";

const ORG_ID = "577a93d3-8f6a-4b45-a93d-b9731122ce11";
const EMPLOYEE_ID = "d660d308-4e0d-4daf-84fd-6753405e6740";
const VIEWER_USER_ID = "3f1c5b7e-90ab-4c3d-8e2f-6a5b4c3d2e1f";
const PERSON_USER_ID = "8af6f242-c060-4920-a7db-91b4cb66fd26";

function makeServiceClient() {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "gte", "order", "limit", "insert"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.update = vi.fn((payload: unknown) => {
    employeeUpdatePayloads.push(payload);
    return chain;
  });
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: { id: EMPLOYEE_ID, user_id: PERSON_USER_ID }, error: null }),
  );
  return { from: vi.fn(() => chain), auth: { admin: { updateUserById } } };
}

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    firstName: "Mina",
    lastName: "Diaz",
    email: "mina@dubgrid.com",
    phone: "555-0100",
    status: "active",
    contactNotes: "Weekend availability",
    statusNote: "Hold",
    employmentType: "full_time",
    certificationId: null,
    seniority: 1,
    roleIds: [],
    focusAreaIds: [],
    departmentIds: [],
    deptAdminIds: [5],
    userId: PERSON_USER_ID,
    ...overrides,
  };
}

function mockAuth(permissions: Record<string, boolean>) {
  requireOrgPermissions.mockResolvedValue({
    permissions: {
      isGridmaster: false,
      isSuperAdmin: false,
      canViewStaff: true,
      canViewEmployeeDetails: false,
      canManageEmployees: false,
      ...permissions,
    },
    serviceClient: makeServiceClient(),
    actor: { id: VIEWER_USER_ID },
  });
}

function fetchEmployeeByIdRequest() {
  return new NextRequest("http://localhost/api/employees/manage", {
    method: "POST",
    body: JSON.stringify({
      action: "fetchEmployeeById",
      orgId: ORG_ID,
      employeeId: EMPLOYEE_ID,
    }),
  });
}

function updateEmployeeRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/employees/manage", {
    method: "POST",
    body: JSON.stringify({
      action: "updateEmployee",
      orgId: ORG_ID,
      employee: {
        id: EMPLOYEE_ID,
        firstName: "Mina",
        lastName: "Diaz",
        employmentType: "full_time",
        status: "active",
        statusChangedAt: null,
        statusNote: "",
        certificationId: null,
        roleIds: [],
        seniority: 1,
        focusAreaIds: [],
        phone: "",
        email: "mina@dubgrid.com",
        contactNotes: "",
        userId: PERSON_USER_ID,
        departmentIds: [],
        deptAdminIds: [],
        version: 0,
        ...overrides,
      },
    }),
  });
}

describe("POST /api/employees/manage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    employeeUpdatePayloads.length = 0;
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({ user: { id: VIEWER_USER_ID } });
    resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
    rowToEmployee.mockReturnValue(makeEmployee());
    fetchMobileManagementMembershipRowsByUserIds.mockResolvedValue([]);
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue(null);
    forbidIfSandboxCookie.mockReturnValue(null);
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: VIEWER_USER_ID } });
    updateUserById.mockResolvedValue({ error: null });
  });

  it("rejects CSRF failures before parsing or auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const request = new NextRequest("http://localhost/api/employees/manage", {
      method: "POST",
      body: "{",
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  describe("fetchEmployeeById", () => {
    it("blocks management profiles for viewers without manage rights", async () => {
      // Even canViewEmployeeDetails isn't enough — management profiles are
      // reserved for staff managers / super admins / gridmasters.
      mockAuth({ canViewEmployeeDetails: true });
      fetchMobileManagementMembershipRowsByUserIds.mockResolvedValue([
        { user_id: PERSON_USER_ID, department_ids: [4], dept_admin_ids: [] },
      ]);

      const response = await POST(fetchEmployeeByIdRequest());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: API_ERRORS.CANNOT_VIEW_MANAGEMENT_PROFILE,
      });
    });

    it("blocks profiles with a pending management invitation the same way", async () => {
      mockAuth({ canViewEmployeeDetails: true });
      rowToEmployee.mockReturnValue(makeEmployee({ userId: null }));
      fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue({
        id: "invite-1",
        department_ids: [4],
      });

      const response = await POST(fetchEmployeeByIdRequest());

      expect(response.status).toBe(403);
    });

    it("returns management profiles to staff managers", async () => {
      mockAuth({ canViewEmployeeDetails: true, canManageEmployees: true });
      fetchMobileManagementMembershipRowsByUserIds.mockResolvedValue([
        { user_id: PERSON_USER_ID, department_ids: [4], dept_admin_ids: [] },
      ]);

      const response = await POST(fetchEmployeeByIdRequest());
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.employee).toMatchObject({
        id: EMPLOYEE_ID,
        contactNotes: "Weekend availability",
        userId: PERSON_USER_ID,
      });
    });

    it("masks non-management employees for view-only callers", async () => {
      mockAuth({});

      const response = await POST(fetchEmployeeByIdRequest());
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.employee).toMatchObject({
        id: EMPLOYEE_ID,
        contactNotes: "",
        statusNote: "",
        deptAdminIds: [],
        userId: null,
        // Personal contact details, withheld like the notes above them.
        email: "",
        phone: "",
      });
    });

    it("keeps the caller's own contact details on their own row", async () => {
      mockAuth({});
      rowToEmployee.mockReturnValue(makeEmployee({ userId: VIEWER_USER_ID }));

      const response = await POST(fetchEmployeeByIdRequest());
      const payload = await response.json();

      expect(response.status).toBe(200);
      // Withholding your own address from you would break your own profile
      // without protecting anyone.
      expect(payload.employee).toMatchObject({
        email: "mina@dubgrid.com",
        phone: "555-0100",
        userId: VIEWER_USER_ID,
      });
    });

    it("hands contact details to a viewer granted canViewEmployeeDetails", async () => {
      mockAuth({ canViewEmployeeDetails: true });

      const response = await POST(fetchEmployeeByIdRequest());
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.employee).toMatchObject({
        email: "mina@dubgrid.com",
        phone: "555-0100",
      });
    });
  });

  describe("updateEmployee", () => {
    it("rejects clearing focus areas for an employee with no management access", async () => {
      mockAuth({ canManageEmployees: true });
      fetchMobileManagementMembershipRowsByUserIds.mockResolvedValue([]);

      const response = await POST(updateEmployeeRequest());

      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.fieldErrors.focusAreaIds).toBe("Select at least one focus area");
    });

    it("allows clearing focus areas for an employee who also holds management access", async () => {
      mockAuth({ canManageEmployees: true });
      fetchMobileManagementMembershipRowsByUserIds.mockResolvedValue([
        { user_id: PERSON_USER_ID, department_ids: [4], dept_admin_ids: [] },
      ]);

      const response = await POST(updateEmployeeRequest());

      expect(response.status).toBe(200);
      expect(employeeUpdatePayloads).toContainEqual(expect.objectContaining({ version: 1 }));
    });

    describe("login email", () => {
      function linkedManagementUser() {
        mockAuth({ canManageEmployees: true });
        fetchMobileManagementMembershipRowsByUserIds.mockResolvedValue([
          { user_id: PERSON_USER_ID, department_ids: [4], dept_admin_ids: [] },
        ]);
      }

      it("leaves the account alone when the email is unchanged", async () => {
        linkedManagementUser();

        const response = await POST(updateEmployeeRequest({ email: "MINA@dubgrid.com" }));

        expect(response.status).toBe(200);
        expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
        expect(updateUserById).not.toHaveBeenCalled();
      });

      it("leaves the account alone for a person without one", async () => {
        linkedManagementUser();
        rowToEmployee.mockReturnValue(makeEmployee({ userId: null }));

        const response = await POST(updateEmployeeRequest({ email: "new@dubgrid.com" }));

        expect(response.status).toBe(200);
        expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
        expect(updateUserById).not.toHaveBeenCalled();
      });

      it("changes the login email behind step-up, before the row", async () => {
        linkedManagementUser();
        let rowsWrittenWhenAccountChanged = -1;
        updateUserById.mockImplementation(async () => {
          rowsWrittenWhenAccountChanged = employeeUpdatePayloads.length;
          return { error: null };
        });

        const response = await POST(updateEmployeeRequest({ email: "new@dubgrid.com" }));

        expect(response.status).toBe(200);
        expect(requireSensitiveActionAuth).toHaveBeenCalledTimes(1);
        expect(updateUserById).toHaveBeenCalledWith(PERSON_USER_ID, {
          email: "new@dubgrid.com",
          email_confirm: true,
        });
        expect(rowsWrittenWhenAccountChanged).toBe(0);
        expect(employeeUpdatePayloads).toContainEqual(expect.objectContaining({ version: 1 }));
        // Sessions under the old identity end, and both addresses hear why.
        expect(followUpLinkedLoginEmailChange).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: PERSON_USER_ID,
            newEmail: "new@dubgrid.com",
            actorId: VIEWER_USER_ID,
          }),
        );
        expect(updateUserById.mock.invocationCallOrder[0]).toBeLessThan(
          followUpLinkedLoginEmailChange.mock.invocationCallOrder[0]!,
        );
      });

      it("returns the step-up challenge without touching the account", async () => {
        linkedManagementUser();
        requireSensitiveActionAuth.mockResolvedValue({
          response: NextResponse.json({ error: "step up" }, { status: 403 }),
        });

        const response = await POST(updateEmployeeRequest({ email: "new@dubgrid.com" }));

        expect(response.status).toBe(403);
        expect(updateUserById).not.toHaveBeenCalled();
        expect(employeeUpdatePayloads).toHaveLength(0);
      });

      it("refuses from a sandbox", async () => {
        linkedManagementUser();
        forbidIfSandboxCookie.mockReturnValue(
          NextResponse.json({ error: "sandbox" }, { status: 403 }),
        );

        const response = await POST(updateEmployeeRequest({ email: "new@dubgrid.com" }));

        expect(response.status).toBe(403);
        expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
        expect(updateUserById).not.toHaveBeenCalled();
      });

      it("reports a taken address as an email conflict", async () => {
        linkedManagementUser();
        updateUserById.mockResolvedValue({
          error: { status: 422, code: "email_exists", message: "already registered" },
        });

        const response = await POST(updateEmployeeRequest({ email: "taken@dubgrid.com" }));

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: "EMPLOYEE_CONTACT_CONFLICT",
          field: "email",
        });
        expect(employeeUpdatePayloads).toHaveLength(0);
      });

      it("rejects clearing the email of a linked account", async () => {
        linkedManagementUser();

        const response = await POST(updateEmployeeRequest({ email: "" }));

        expect(response.status).toBe(400);
        expect((await response.json()).fieldErrors.email).toBe(
          "An account needs an email to sign in with.",
        );
        expect(updateUserById).not.toHaveBeenCalled();
      });
    });
  });

  describe("fetchEmployeeActivity", () => {
    const ADMIN_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
    const INVITATION_ID = "1c7b7f3e-2f1a-4b0c-9d6e-5a4b3c2d1e0f";

    function makeTableQuery(rows: unknown[], single: unknown = null) {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "or", "order", "limit"]) {
        query[method] = vi.fn(() => query);
      }
      query.maybeSingle = vi.fn(() => Promise.resolve({ data: single, error: null }));
      query.then = (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
        reject: (reason?: unknown) => unknown,
      ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      return query as Record<string, ReturnType<typeof vi.fn>> & typeof query;
    }

    function makeActivityServiceClient(tables: Record<string, ReturnType<typeof makeTableQuery>>) {
      return { from: vi.fn((table: string) => tables[table] ?? makeTableQuery([])) };
    }

    function activityRequest() {
      return new NextRequest("http://localhost/api/employees/manage", {
        method: "POST",
        body: JSON.stringify({
          action: "fetchEmployeeActivity",
          orgId: ORG_ID,
          employeeId: EMPLOYEE_ID,
        }),
      });
    }

    const SUPER_ADMIN = {
      isGridmaster: false,
      isSuperAdmin: true,
      role: "super_admin",
      canViewEmployeeDetails: true,
    };

    it("opens the timeline to gridmasters, super admins, and admins who can view details", async () => {
      requireOrgPermissions.mockResolvedValue({
        response: NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 }),
      });

      const response = await POST(activityRequest());
      expect(response.status).toBe(403);

      const isAllowed = requireOrgPermissions.mock.calls[0][2] as (
        permissions: Record<string, unknown>,
      ) => boolean;
      const base = {
        isGridmaster: false,
        isSuperAdmin: false,
        role: "user",
        canViewEmployeeDetails: true,
      };
      expect(isAllowed({ ...base, isGridmaster: true })).toBe(true);
      expect(isAllowed({ ...base, isSuperAdmin: true, role: "super_admin" })).toBe(true);
      expect(isAllowed({ ...base, role: "admin" })).toBe(true);
      expect(isAllowed({ ...base, role: "admin", canViewEmployeeDetails: false })).toBe(false);
      expect(isAllowed(base)).toBe(false);
    });

    it("merges audit rows, the role ledger, and the invitation lifecycle for one person", async () => {
      const tables = {
        employees: makeTableQuery(
          [{ id: EMPLOYEE_ID, first_name: "Mina", last_name: "Diaz", email: "mina@dubgrid.com" }],
          {
            id: EMPLOYEE_ID,
            org_id: ORG_ID,
            user_id: PERSON_USER_ID,
            created_at: "2026-01-01T09:00:00.000Z",
            created_by: ADMIN_ID,
          },
        ),
        invitations: makeTableQuery([
          {
            id: INVITATION_ID,
            org_id: ORG_ID,
            invited_by: ADMIN_ID,
            email: "mina@dubgrid.com",
            role_to_assign: "user",
            expires_at: "2099-01-01T00:00:00.000Z",
            accepted_at: "2026-01-02T10:00:00.000Z",
            revoked_at: null,
            created_at: "2026-01-01T10:00:00.000Z",
            first_name: "Mina",
            last_name: "Diaz",
          },
        ]),
        audit_log: makeTableQuery([
          {
            id: 42,
            org_id: ORG_ID,
            actor_id: ADMIN_ID,
            actor_email: "alex@dubgrid.com",
            action: "employee.updated",
            resource_type: "employee",
            resource_id: EMPLOYEE_ID,
            details: { changes: [] },
            created_at: "2026-02-01T10:00:00.000Z",
          },
        ]),
        role_change_log: makeTableQuery([
          {
            id: "rcl-1",
            org_id: ORG_ID,
            target_user_id: PERSON_USER_ID,
            changed_by_id: ADMIN_ID,
            from_role: "user",
            to_role: "admin",
            change_type: "role_change",
            permissions_before: null,
            permissions_after: null,
            created_at: "2026-03-01T10:00:00.000Z",
          },
        ]),
        profiles: makeTableQuery([
          { id: ADMIN_ID, first_name: "Alex", last_name: "Admin" },
          { id: PERSON_USER_ID, first_name: "Mina", last_name: "Diaz" },
        ]),
        organizations: makeTableQuery([{ id: ORG_ID, name: "Calm Haven" }]),
      };
      requireOrgPermissions.mockResolvedValue({
        permissions: SUPER_ADMIN,
        serviceClient: makeActivityServiceClient(tables),
        actor: { id: VIEWER_USER_ID },
        orgId: ORG_ID,
      });

      const response = await POST(activityRequest());
      expect(response.status).toBe(200);
      const body = (await response.json()) as { entries: Array<Record<string, unknown>> };

      expect(body.entries.map((entry) => entry.action)).toEqual([
        "role.changed",
        "employee.updated",
        "invitation.accepted",
        "invitation.sent",
        "employee.created",
      ]);
      expect(body.entries[0]).toMatchObject({
        id: "role-change-rcl-1",
        actorName: "Alex Admin",
        targetLabel: "Mina Diaz",
        details: { fromRole: "user", toRole: "admin" },
      });
      expect(body.entries.find((entry) => entry.action === "invitation.accepted")).toMatchObject({
        actorName: "Mina Diaz",
      });
      expect(tables.audit_log.eq).toHaveBeenCalledWith("org_id", ORG_ID);
      expect(tables.role_change_log.eq).toHaveBeenCalledWith("target_user_id", PERSON_USER_ID);
    });

    it("returns an empty timeline for an employee outside the effective organization", async () => {
      requireOrgPermissions.mockResolvedValue({
        permissions: SUPER_ADMIN,
        serviceClient: makeActivityServiceClient({ employees: makeTableQuery([], null) }),
        actor: { id: VIEWER_USER_ID },
        orgId: ORG_ID,
      });

      const response = await POST(activityRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ entries: [] });
    });
  });
});

describe("POST /api/employees/manage fetchEmployees joined dates", () => {
  const OTHER_USER_ID = "0b6e2a4c-1d3f-4e5a-8b7c-9d0e1f2a3b4c";
  const membershipFilters: Array<[string, unknown]> = [];

  const employeeRows = [
    { id: "emp-joined", user_id: PERSON_USER_ID },
    { id: "emp-self", user_id: VIEWER_USER_ID },
    { id: "emp-unlinked", user_id: null },
  ];
  // What the organization's membership read returns: a member for each linked
  // row, plus one whose employee is not on this list.
  const membershipRows = [
    { user_id: PERSON_USER_ID, joined_at: "2026-03-05T14:00:00.000Z" },
    { user_id: VIEWER_USER_ID, joined_at: "2026-02-01T09:30:00.000Z" },
    { user_id: OTHER_USER_ID, joined_at: "2026-01-01T00:00:00.000Z" },
  ];

  function makeListClient() {
    return {
      from: vi.fn((table: string) => {
        const rows = table === "organization_memberships" ? membershipRows : employeeRows;
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "is", "in", "order"]) {
          chain[method] = vi.fn(() => chain);
        }
        chain.eq = vi.fn((column: string, value: unknown) => {
          if (table === "organization_memberships") membershipFilters.push([column, value]);
          return chain;
        });
        chain.range = vi.fn(() => Promise.resolve({ data: rows, error: null }));
        return chain;
      }),
    };
  }

  function fetchEmployeesRequest() {
    return new NextRequest("http://localhost/api/employees/manage", {
      method: "POST",
      body: JSON.stringify({ action: "fetchEmployees", orgId: ORG_ID }),
    });
  }

  async function listAs(permissions: Record<string, boolean>) {
    requireOrgPermissions.mockResolvedValue({
      permissions: {
        isGridmaster: false,
        isSuperAdmin: false,
        canViewStaff: true,
        canViewEmployeeDetails: false,
        canManageEmployees: false,
        ...permissions,
      },
      serviceClient: makeListClient(),
      actor: { id: VIEWER_USER_ID },
    });
    const response = await POST(fetchEmployeesRequest());
    expect(response.status).toBe(200);
    const { employees } = (await response.json()) as {
      employees: Array<{ id: string; joinedAt: string | null }>;
    };
    return new Map(employees.map((employee) => [employee.id, employee.joinedAt]));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    membershipFilters.length = 0;
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({ user: { id: VIEWER_USER_ID } });
    resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
    rowToEmployee.mockImplementation((row: { id: string; user_id: string | null }) =>
      makeEmployee({ id: row.id, userId: row.user_id }),
    );
  });

  it("dates each linked person by their membership and leaves the rest empty", async () => {
    const joined = await listAs({ canManageEmployees: true });

    expect(joined.get("emp-joined")).toBe("2026-03-05T14:00:00.000Z");
    expect(joined.get("emp-self")).toBe("2026-02-01T09:30:00.000Z");
    // No account, or an invitation not yet accepted: no membership, no date.
    expect(joined.get("emp-unlinked")).toBeNull();
  });

  it("reads memberships from the organization the employees came from", async () => {
    await listAs({ canManageEmployees: true });

    expect(membershipFilters).toEqual([["org_id", ORG_ID]]);
  });

  it("withholds a coworker's joined date from a view-only caller, but not their own", async () => {
    const joined = await listAs({});

    expect(joined.get("emp-joined")).toBeNull();
    expect(joined.get("emp-self")).toBe("2026-02-01T09:30:00.000Z");
  });
});
