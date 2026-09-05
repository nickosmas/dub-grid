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
  return { from: vi.fn(() => chain) };
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
  });
});
