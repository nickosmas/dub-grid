import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobilePeople = vi.fn();
const validateStaffOrgReferences = vi.fn();
const insertMobileAuditLogEntry = vi.fn();
const dispatchNotificationEvent = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchMobilePeople,
}));

vi.mock("@/lib/staff-validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff-validation")>();
  return {
    ...actual,
    validateStaffOrgReferences: (...args: unknown[]) => validateStaffOrgReferences(...args),
  };
});

vi.mock("@dubgrid/data-access", () => ({
  insertMobileAuditLogEntry: (...args: unknown[]) => insertMobileAuditLogEntry(...args),
}));

vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function makeCreateAuth(overrides?: { canManageEmployees?: boolean }) {
  const eq = vi.fn();
  const order = vi.fn();
  const limit = vi.fn();
  const maybeSingle = vi.fn().mockResolvedValue({ data: { seniority: 4 }, error: null });
  const select = vi.fn(() => ({ eq }));
  eq.mockReturnValue({ order });
  order.mockReturnValue({ limit });
  limit.mockReturnValue({ maybeSingle });

  const insertSelect = vi.fn();
  const insert = vi.fn(() => ({ select: insertSelect }));
  const single = vi.fn().mockResolvedValue({
    data: {
      id: "33333333-3333-4333-8333-333333333333",
      org_id: ORG_ID,
      employee_number: 1050,
      first_name: "Nia",
      last_name: "Torres",
      employment_type: "full_time",
      status: "active",
      status_changed_at: null,
      status_note: "",
      certification_id: null,
      role_ids: [],
      seniority: 5,
      focus_area_ids: [1],
      phone: "",
      email: "nia@dubgrid.com",
      contact_notes: "",
      archived_at: null,
      user_id: null,
      department_ids: [],
      dept_admin_ids: [],
      version: 0,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  });
  insertSelect.mockReturnValue({ single });

  const from = vi.fn((table: string) => {
    if (table !== "employees") throw new Error(`Unexpected table: ${table}`);
    return { select, insert };
  });

  return {
    user: { id: ACTOR_ID, email: "admin@dubgrid.com" },
    currentOrg: { id: ORG_ID },
    permissions: { canManageEmployees: overrides?.canManageEmployees ?? true },
    serviceClient: { from },
  };
}

function makeRequest(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as never;
}

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

describe("POST mobile people route (create)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateStaffOrgReferences.mockResolvedValue({});
    insertMobileAuditLogEntry.mockResolvedValue(undefined);
  });

  it("rejects users without canManageEmployees", async () => {
    requireMobileAuth.mockResolvedValue(makeCreateAuth({ canManageEmployees: false }));

    const { POST } = await import("./people");
    const response = await POST(
      makeRequest({
        firstName: "Nia",
        lastName: "Torres",
        focusAreaIds: [1],
        certificationId: null,
        email: "",
      }),
    );

    expect(response.status).toBe(403);
    expect(validateStaffOrgReferences).not.toHaveBeenCalled();
  });

  it("rejects a body with no focus areas", async () => {
    requireMobileAuth.mockResolvedValue(makeCreateAuth());

    const { POST } = await import("./people");
    const response = await POST(
      makeRequest({
        firstName: "Nia",
        lastName: "Torres",
        focusAreaIds: [],
        certificationId: null,
        email: "",
      }),
    );

    expect(response.status).toBe(400);
    expect(validateStaffOrgReferences).not.toHaveBeenCalled();
  });

  it("rejects focus areas that don't belong to the org", async () => {
    requireMobileAuth.mockResolvedValue(makeCreateAuth());
    validateStaffOrgReferences.mockResolvedValue({
      focusAreaIds: "Select valid focus areas from this organization",
    });

    const { POST } = await import("./people");
    const response = await POST(
      makeRequest({
        firstName: "Nia",
        lastName: "Torres",
        focusAreaIds: [999],
        certificationId: null,
        email: "",
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Select valid focus areas from this organization");
  });

  it("creates the employee at the next seniority slot and returns it", async () => {
    const auth = makeCreateAuth();
    requireMobileAuth.mockResolvedValue(auth);

    const { POST } = await import("./people");
    const response = await POST(
      makeRequest({
        firstName: "Nia",
        lastName: "Torres",
        focusAreaIds: [1],
        certificationId: null,
        email: "nia@dubgrid.com",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.person).toMatchObject({
      firstName: "Nia",
      lastName: "Torres",
      seniority: 5,
    });
    expect(insertMobileAuditLogEntry).toHaveBeenCalledWith(
      auth.serviceClient,
      expect.objectContaining({ action: "employee.created", org_id: ORG_ID }),
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      ACTOR_ID,
      expect.objectContaining({ action: "employee_created", orgId: ORG_ID }),
    );
  });

  it("returns a 409 when the email is already used in the org", async () => {
    const auth = makeCreateAuth();
    const conflictError = {
      code: "23505",
      constraint: "unique_active_employee_email_per_org",
      message: "duplicate key value",
    };
    (auth.serviceClient.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table !== "employees") throw new Error(`Unexpected table: ${table}`);
      const eq = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { seniority: 4 }, error: null }),
          }),
        }),
      });
      return {
        select: vi.fn(() => ({ eq })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: conflictError }),
          })),
        })),
      };
    });
    requireMobileAuth.mockResolvedValue(auth);

    const { POST } = await import("./people");
    const response = await POST(
      makeRequest({
        firstName: "Nia",
        lastName: "Torres",
        focusAreaIds: [1],
        certificationId: null,
        email: "nia@dubgrid.com",
      }),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("That email is already used by another person.");
  });
});
