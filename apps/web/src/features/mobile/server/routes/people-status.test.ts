import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
}));

function createEmployeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    employee_number: 1042,
    first_name: "Mina",
    last_name: "Diaz",
    status: "active",
    status_changed_at: "2026-04-20T12:00:00.000Z",
    status_note: "",
    certification_id: null,
    role_ids: [3],
    seniority: 1,
    focus_area_ids: [1, 2],
    phone: "555-0100",
    email: "mina@dubgrid.com",
    contact_notes: "Weekend availability",
    archived_at: null,
    user_id: null,
    department_ids: [4],
    dept_admin_ids: [],
    version: 7,
    ...overrides,
  };
}

describe("mobile people status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects users without employee-management permission", async () => {
    requireMobileAuth.mockResolvedValue({
      permissions: {
        canManageEmployees: false,
      },
    });

    const { PATCH } = await import("./people-status");
    const response = await PATCH(
      {
        json: async () => ({
          action: "deactivate",
          expectedVersion: 7,
        }),
      } as never,
      {
        params: Promise.resolve({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to update staff status.",
    });
  });

  it("does not update a person ID that is outside the authenticated organization", async () => {
    const selectSingle = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    const update = vi.fn();
    const serviceClient = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ single: selectSingle }),
          }),
        }),
        update,
      })),
    };
    requireMobileAuth.mockResolvedValue({
      currentOrg: { id: "org-1" },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: { id: "user-1", email: "manager@dubgrid.com" },
    });

    const { PATCH } = await import("./people-status");
    const response = await PATCH(
      {
        headers: new Headers(),
        json: async () => ({ action: "deactivate", expectedVersion: 7 }),
      } as never,
      {
        params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000099" }),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Employee not found" });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates employee status for authorized mobile managers", async () => {
    const selectSingle = vi.fn().mockResolvedValueOnce({ data: createEmployeeRow(), error: null });
    const updateMaybeSingle = vi.fn().mockResolvedValue({
      data: createEmployeeRow({
        status: "inactive",
        status_note: "Coverage hold",
        status_changed_at: "2026-04-24T12:00:00.000Z",
        version: 8,
      }),
      error: null,
    });
    const auditInsert = vi.fn().mockResolvedValue({ error: null });

    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "employees") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: selectSingle,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: updateMaybeSingle,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "audit_log") {
          return {
            insert: auditInsert,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: {
        canManageEmployees: true,
      },
      serviceClient,
      user: {
        id: "user-1",
        email: "manager@dubgrid.com",
      },
    });

    const { PATCH } = await import("./people-status");
    const response = await PATCH(
      {
        headers: new Headers(),
        json: async () => ({
          action: "deactivate",
          expectedVersion: 7,
          note: "Coverage hold",
        }),
      } as never,
      {
        params: Promise.resolve({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      person: {
        id: "00000000-0000-0000-0000-000000000001",
        employeeNumber: 1042,
        firstName: "Mina",
        lastName: "Diaz",
        employmentType: "full_time",
        phone: "555-0100",
        email: "mina@dubgrid.com",
        status: "inactive",
        orgRole: null,
        certificationId: null,
        roleIds: [3],
        seniority: 1,
        focusAreaIds: [1, 2],
        departmentIds: [4],
        deptAdminIds: [],
        managementDepartmentIds: [],
        managementDeptAdminIds: [],
        contactNotes: "Weekend availability",
        statusChangedAt: "2026-04-24T12:00:00.000Z",
        statusNote: "Coverage hold",
        userId: null,
        version: 8,
        membershipUpdatedAt: null,
        pendingInvitation: null,
      },
    });
    expect(auditInsert).toHaveBeenCalledTimes(1);
  });
});
