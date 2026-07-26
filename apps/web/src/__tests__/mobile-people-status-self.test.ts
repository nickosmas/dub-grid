import { describe, expect, it, vi } from "vitest";
import type { Employee } from "@dubgrid/domain";
import { updateMobilePersonStatus } from "@dubgrid/mobile-api-core";

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 0,
    focusAreaIds: [],
    phone: "",
    email: "alice@example.com",
    contactNotes: "",
    userId: "user-self",
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
    ...overrides,
  };
}

function makeDeps(currentEmployee: Employee) {
  return {
    fetchEmployeeById: vi.fn().mockResolvedValue(currentEmployee),
    updateEmployeeStatus: vi.fn(),
    insertAuditLog: vi.fn(),
    mapEmployeeToMobilePerson: vi.fn((emp: Employee) => ({
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      status: emp.status,
      userId: emp.userId,
    })) as unknown as Parameters<typeof updateMobilePersonStatus>[2]["mapEmployeeToMobilePerson"],
    // Unused by these self-action-guard cases (the guard returns before the
    // last-super-admin check or the org-membership sync ever run), but the
    // deps shape requires them.
    fetchActiveMembershipOrgRole: vi.fn().mockResolvedValue(null),
    countActiveSuperAdmins: vi.fn().mockResolvedValue(0),
    archiveOrganizationMembership: vi.fn(),
    restoreOrganizationMembership: vi.fn(),
  };
}

function makeAuth(linkedUserId: string) {
  return {
    currentOrg: { id: "org-1" },
    permissions: { canManageEmployees: true, isSuperAdmin: false },
    // SupabaseClient is unused because deps mock all DB access.
    serviceClient: {} as never,
    user: { id: linkedUserId, email: "self@example.com" },
  };
}

describe("updateMobilePersonStatus self-action guard", () => {
  it("rejects deactivate on self with self_action_forbidden", async () => {
    const employee = makeEmployee({ userId: "user-self" });
    const deps = makeDeps(employee);

    const result = await updateMobilePersonStatus(
      makeAuth("user-self"),
      {
        employeeId: "emp-1",
        body: { action: "deactivate", expectedVersion: 0, note: "" },
        requestIp: null,
        userAgent: null,
      },
      deps,
    );

    expect(result.kind).toBe("self_action_forbidden");
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
  });

  it("rejects remove on self with self_action_forbidden", async () => {
    const employee = makeEmployee({ userId: "user-self" });
    const deps = makeDeps(employee);

    const result = await updateMobilePersonStatus(
      makeAuth("user-self"),
      {
        employeeId: "emp-1",
        body: { action: "remove", expectedVersion: 0 },
        requestIp: null,
        userAgent: null,
      },
      deps,
    );

    expect(result.kind).toBe("self_action_forbidden");
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
  });

  it("allows deactivate on another user", async () => {
    const employee = makeEmployee({ userId: "user-other" });
    const deps = makeDeps(employee);
    deps.updateEmployeeStatus.mockResolvedValue({
      ...employee,
      status: "inactive",
      version: 1,
    });

    const result = await updateMobilePersonStatus(
      makeAuth("user-self"),
      {
        employeeId: "emp-1",
        body: { action: "deactivate", expectedVersion: 0, note: "" },
        requestIp: null,
        userAgent: null,
      },
      deps,
    );

    expect(result.kind).toBe("updated");
    expect(deps.updateEmployeeStatus).toHaveBeenCalledTimes(1);
  });

  it("rejects activate on self with self_action_forbidden", async () => {
    const employee = makeEmployee({ userId: "user-self", status: "inactive" });
    const deps = makeDeps(employee);

    const result = await updateMobilePersonStatus(
      makeAuth("user-self"),
      {
        employeeId: "emp-1",
        body: { action: "activate", expectedVersion: 0 },
        requestIp: null,
        userAgent: null,
      },
      deps,
    );

    expect(result.kind).toBe("self_action_forbidden");
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
  });
});
