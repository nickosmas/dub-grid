import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobilePeople = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchMobilePeople,
}));

describe("mobile people route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects users without staff visibility", async () => {
    requireMobileAuth.mockResolvedValue({
      permissions: {
        canManageEmployees: false,
        canViewStaff: false,
      },
    });

    const { GET } = await import("./people");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/people"),
    } as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to view the staff directory.",
    });
  });

  it("returns the mobile people directory for authorized users", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: {
        canManageEmployees: true,
        canViewStaff: true,
      },
      serviceClient: {},
    });
    fetchMobilePeople.mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000001",
        employeeNumber: 1042,
        firstName: "Mina",
        lastName: "Diaz",
        employmentType: "full_time",
        phone: "555-0100",
        email: "mina@dubgrid.com",
        status: "active",
        orgRole: "admin",
        certificationId: null,
        roleIds: [],
        seniority: 0,
        focusAreaIds: [1, 2],
        departmentIds: [],
        deptAdminIds: [],
        managementDepartmentIds: [4],
        managementDeptAdminIds: [],
        contactNotes: "Weekend availability",
        statusChangedAt: "2026-04-20T12:00:00.000Z",
        statusNote: "",
        userId: null,
        version: 7,
        pendingInvitation: null,
      },
    ]);

    const { GET } = await import("./people");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/people"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobilePeople).toHaveBeenCalledWith({}, "org-1");
    expect(payload.people).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000001",
        employeeNumber: 1042,
        firstName: "Mina",
        lastName: "Diaz",
        employmentType: "full_time",
        phone: "555-0100",
        email: "mina@dubgrid.com",
        status: "active",
        orgRole: "admin",
        certificationId: null,
        roleIds: [],
        seniority: 0,
        focusAreaIds: [1, 2],
        departmentIds: [],
        deptAdminIds: [],
        managementDepartmentIds: [4],
        managementDeptAdminIds: [],
        contactNotes: "Weekend availability",
        statusChangedAt: "2026-04-20T12:00:00.000Z",
        statusNote: "",
        userId: null,
        version: 7,
        pendingInvitation: null,
      },
    ]);
  });

  it("returns only active non-admin directory data for regular users", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      user: {
        id: "00000000-0000-0000-0000-00000000009a",
      },
      permissions: {
        canManageEmployees: false,
        canViewStaff: true,
      },
      serviceClient: {},
    });
    fetchMobilePeople.mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000001",
        employeeNumber: 1042,
        firstName: "Mina",
        lastName: "Diaz",
        phone: "555-0100",
        email: "mina@dubgrid.com",
        status: "active",
        certificationId: null,
        roleIds: [3],
        seniority: 0,
        focusAreaIds: [1, 2],
        departmentIds: [4],
        deptAdminIds: [5],
        managementDepartmentIds: [],
        managementDeptAdminIds: [],
        contactNotes: "Weekend availability",
        statusChangedAt: "2026-04-20T12:00:00.000Z",
        statusNote: "Hold",
        userId: "user-1",
        version: 7,
        pendingInvitation: {
          id: "invite-1",
          email: "mina@dubgrid.com",
          expiresAt: "2026-04-30T12:00:00.000Z",
          updatedAt: "2026-04-20T12:00:00.000Z",
        },
      },
      {
        id: "00000000-0000-0000-0000-000000000002",
        employeeNumber: 1043,
        firstName: "Owen",
        lastName: "Lee",
        phone: "555-0101",
        email: "owen@dubgrid.com",
        status: "inactive",
        certificationId: null,
        roleIds: [],
        seniority: 0,
        focusAreaIds: [1],
        departmentIds: [],
        deptAdminIds: [],
        contactNotes: "",
        statusChangedAt: "2026-04-20T12:00:00.000Z",
        statusNote: "",
        userId: null,
        version: 3,
        pendingInvitation: null,
      },
      {
        id: "00000000-0000-0000-0000-000000000003",
        employeeNumber: 1044,
        firstName: "Ava",
        lastName: "Cole",
        phone: "555-0102",
        email: "ava@dubgrid.com",
        status: "active",
        orgRole: "admin",
        certificationId: null,
        roleIds: [],
        seniority: 0,
        focusAreaIds: [],
        departmentIds: [],
        deptAdminIds: [],
        managementDepartmentIds: [6],
        managementDeptAdminIds: [6],
        contactNotes: "",
        statusChangedAt: "2026-04-20T12:00:00.000Z",
        statusNote: "",
        userId: "00000000-0000-0000-0000-0000000000bb",
        version: 2,
        pendingInvitation: null,
      },
    ]);

    const { GET } = await import("./people");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/people"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.people).toHaveLength(2);
    expect(payload.people[0]).toMatchObject({
      id: "00000000-0000-0000-0000-000000000001",
      contactNotes: "",
      departmentIds: [],
      deptAdminIds: [],
      managementDepartmentIds: [],
      managementDeptAdminIds: [],
      pendingInvitation: null,
      roleIds: [],
      status: "active",
      statusNote: "",
      userId: null,
    });
    // Management users stay listed for everyone, sanitized like any other
    // row but with managementDepartmentIds intact so the app can gate their
    // profile view.
    expect(payload.people[1]).toMatchObject({
      id: "00000000-0000-0000-0000-000000000003",
      contactNotes: "",
      departmentIds: [],
      deptAdminIds: [],
      managementDepartmentIds: [6],
      managementDeptAdminIds: [],
      pendingInvitation: null,
      roleIds: [],
      status: "active",
      statusNote: "",
      userId: null,
    });
  });
});
