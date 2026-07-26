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
    userId: "user-other",
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
    ...overrides,
  };
}

function makeDeps(
  currentEmployee: Employee,
  overrides: Partial<{
    fetchActiveMembershipOrgRole: ReturnType<typeof vi.fn>;
    countActiveSuperAdmins: ReturnType<typeof vi.fn>;
  }> = {},
) {
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
    fetchActiveMembershipOrgRole:
      overrides.fetchActiveMembershipOrgRole ?? vi.fn().mockResolvedValue("user"),
    countActiveSuperAdmins: overrides.countActiveSuperAdmins ?? vi.fn().mockResolvedValue(0),
    archiveOrganizationMembership: vi.fn(),
    restoreOrganizationMembership: vi.fn(),
  };
}

function makeAuth(isSuperAdmin: boolean) {
  return {
    currentOrg: { id: "org-1" },
    permissions: { canManageEmployees: true, isSuperAdmin },
    serviceClient: {} as never,
    user: { id: "user-actor", email: "actor@example.com" },
  };
}

describe("updateMobilePersonStatus organization membership sync", () => {
  it("archives the organization membership when a super_admin removes a linked employee", async () => {
    const employee = makeEmployee({ status: "active", userId: "user-other" });
    const deps = makeDeps(employee);
    deps.updateEmployeeStatus.mockResolvedValue({
      ...employee,
      status: "removed",
      version: 1,
    });

    const result = await updateMobilePersonStatus(
      makeAuth(true),
      {
        employeeId: "emp-1",
        body: { action: "remove", expectedVersion: 0 },
        requestIp: null,
        userAgent: null,
      },
      deps,
    );

    expect(result.kind).toBe("updated");
    expect(deps.archiveOrganizationMembership).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", userId: "user-other" }),
    );
    expect(deps.restoreOrganizationMembership).not.toHaveBeenCalled();
  });

  it("restores the organization membership when a super_admin reactivates a removed employee", async () => {
    const employee = makeEmployee({ status: "removed", userId: "user-other" });
    const deps = makeDeps(employee);
    deps.updateEmployeeStatus.mockResolvedValue({
      ...employee,
      status: "active",
      version: 1,
    });

    const result = await updateMobilePersonStatus(
      makeAuth(true),
      {
        employeeId: "emp-1",
        body: { action: "activate", expectedVersion: 0 },
        requestIp: null,
        userAgent: null,
      },
      deps,
    );

    expect(result.kind).toBe("updated");
    expect(deps.restoreOrganizationMembership).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", userId: "user-other" }),
    );
    expect(deps.archiveOrganizationMembership).not.toHaveBeenCalled();
  });

  it("does not touch organization membership when a non-super-admin removes a linked employee", async () => {
    const employee = makeEmployee({ status: "active", userId: "user-other" });
    const deps = makeDeps(employee);
    deps.updateEmployeeStatus.mockResolvedValue({
      ...employee,
      status: "removed",
      version: 1,
    });

    const result = await updateMobilePersonStatus(
      makeAuth(false),
      {
        employeeId: "emp-1",
        body: { action: "remove", expectedVersion: 0 },
        requestIp: null,
        userAgent: null,
      },
      deps,
    );

    // Status still changes — only the org-access side effect is gated to
    // super_admin, mirroring DELETE /api/organizations/access on web.
    expect(result.kind).toBe("updated");
    expect(deps.archiveOrganizationMembership).not.toHaveBeenCalled();
  });

  it("refuses to remove the org's only super_admin", async () => {
    const employee = makeEmployee({ status: "active", userId: "user-other" });
    const deps = makeDeps(employee, {
      fetchActiveMembershipOrgRole: vi.fn().mockResolvedValue("super_admin"),
      countActiveSuperAdmins: vi.fn().mockResolvedValue(1),
    });

    const result = await updateMobilePersonStatus(
      makeAuth(false),
      {
        employeeId: "emp-1",
        body: { action: "remove", expectedVersion: 0 },
        requestIp: null,
        userAgent: null,
      },
      deps,
    );

    expect(result.kind).toBe("cannot_remove_last_super_admin");
    // Removing staff already fully blocks login at the JWT hook regardless of
    // org_role, so this must be refused before the employees row is touched.
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
  });
});
