import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobileEmployeeRowById = vi.fn();
const fetchMobileManagementMembershipRowsByUserIds = vi.fn();
const fetchMobilePendingInvitationRowByEmployeeId = vi.fn();
const rowToEmployee = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
}));

vi.mock("@dubgrid/data-access", () => ({
  fetchMobileEmployeeRowById,
  fetchMobileManagementMembershipRowsByUserIds,
  fetchMobilePendingInvitationRowByEmployeeId,
  insertMobileAuditLogEntry: vi.fn(),
  updateMobileEmployeeDetailsRow: vi.fn(),
}));

vi.mock("@/lib/db/mappers", () => ({
  rowToEmployee,
}));

const VIEWER_USER_ID = "3f1c5b7e-90ab-4c3d-8e2f-6a5b4c3d2e1f";
const PERSON_USER_ID = "8af6f242-c060-4920-a7db-91b4cb66fd26";

function makeAuth(overrides?: { canManageEmployees?: boolean; canViewStaff?: boolean }) {
  return {
    currentOrg: {
      id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
    },
    user: {
      id: VIEWER_USER_ID,
    },
    permissions: {
      canManageEmployees: overrides?.canManageEmployees ?? true,
      canViewStaff: overrides?.canViewStaff ?? true,
    },
    serviceClient: {},
  };
}

function mockManagementMemberships(rows: Array<{ user_id: string; department_ids: number[] }>) {
  fetchMobileManagementMembershipRowsByUserIds.mockImplementation(
    (_client: unknown, _orgId: string, userIds: string[]) =>
      Promise.resolve(
        rows
          .filter((row) => userIds.includes(row.user_id))
          .map((row) => ({ ...row, dept_admin_ids: row.department_ids })),
      ),
  );
}

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: "d660d308-4e0d-4daf-84fd-6753405e6740",
    employeeNumber: 1042,
    firstName: "Mina",
    lastName: "Diaz",
    employmentType: "full_time",
    phone: "(415) 425-3334",
    email: "mina@dubgrid.com",
    status: "active",
    certificationId: null,
    roleIds: [3],
    seniority: 2,
    focusAreaIds: [2],
    departmentIds: [4],
    deptAdminIds: [5],
    contactNotes: "Weekend availability",
    statusChangedAt: "2026-04-24T12:00:00.000Z",
    statusNote: "Coverage hold",
    userId: PERSON_USER_ID,
    version: 7,
    ...overrides,
  };
}

describe("mobile person route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMobileEmployeeRowById.mockResolvedValue({
      id: "row-1",
      user_id: PERSON_USER_ID,
    });
    rowToEmployee.mockReturnValue(makeEmployee());
    mockManagementMemberships([{ user_id: PERSON_USER_ID, department_ids: [8] }]);
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue(null);
  });

  it("rejects users without staff visibility", async () => {
    requireMobileAuth.mockResolvedValue(
      makeAuth({
        canManageEmployees: false,
        canViewStaff: false,
      }),
    );

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to view that staff profile.",
    });
  });

  it("returns a full person payload for managers", async () => {
    requireMobileAuth.mockResolvedValue(makeAuth());
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "mina@dubgrid.com",
      expires_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-04-28T00:00:00.000Z",
    });

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.person).toMatchObject({
      id: "d660d308-4e0d-4daf-84fd-6753405e6740",
      contactNotes: "Weekend availability",
      managementDepartmentIds: [8],
      managementDeptAdminIds: [8],
      roleIds: [3],
      userId: "8af6f242-c060-4920-a7db-91b4cb66fd26",
      pendingInvitation: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "mina@dubgrid.com",
      },
    });
  });

  it("rejects management profiles for viewers without manage rights", async () => {
    requireMobileAuth.mockResolvedValue(
      makeAuth({ canManageEmployees: false, canViewStaff: true }),
    );

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to view that staff profile.",
    });
  });

  it("sanitizes the person payload for regular users", async () => {
    requireMobileAuth.mockResolvedValue(
      makeAuth({ canManageEmployees: false, canViewStaff: true }),
    );
    mockManagementMemberships([]);
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "mina@dubgrid.com",
      expires_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-04-28T00:00:00.000Z",
    });

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.person).toMatchObject({
      id: "d660d308-4e0d-4daf-84fd-6753405e6740",
      contactNotes: "",
      departmentIds: [],
      deptAdminIds: [],
      managementDepartmentIds: [],
      managementDeptAdminIds: [],
      pendingInvitation: null,
      roleIds: [],
      statusNote: "",
      userId: null,
    });
  });

});
