import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagementStaffPanel } from "@/components/staff/ManagementStaffPanel";
import type { DirectoryPerson, NamedItem } from "@/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const departments: NamedItem[] = [];

function makePerson(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    personId: "u:user-1",
    source: "user_only",
    employeeId: null,
    employeeNumber: null,
    userId: "user-1",
    firstName: "Jordan",
    lastName: "Lee",
    email: "jordan@example.com",
    phone: "",
    employeeStatus: null,
    orgRole: "admin",
    hasAppAccess: true,
    focusAreaIds: [],
    certificationId: null,
    roleIds: [],
    seniority: null,
    lastSignInAt: null,
    invitationStatus: null,
    scheduledDepartmentIds: [],
    scheduledDeptAdminIds: [],
    managementDepartmentIds: [10],
    managementDeptAdminIds: [],
    departmentIds: [10],
    deptAdminIds: [],
    isManagementUser: true,
    membershipUpdatedAt: "2026-01-01T00:00:00Z",
    adminPermissions: null,
    ...overrides,
  };
}

const baseProps = {
  contactEmail: null,
  departments,
  departmentLabel: "Departments",
  canManageScheduleEmployees: false,
  onClose: vi.fn(),
  onSave: vi.fn(async () => true),
};

describe("ManagementStaffPanel access gating", () => {
  it("hides the permission matrix when the viewer cannot manage access", () => {
    // No onRoleChange/onPermissionsChange => simulates a non-super_admin viewer.
    render(
      <ManagementStaffPanel
        {...baseProps}
        person={makePerson()}
        canManageManagementAccess={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit admin access" })).toBeNull();
  });

  it("offers the permission matrix for an admin when access management is granted", () => {
    render(
      <ManagementStaffPanel
        {...baseProps}
        person={makePerson({ orgRole: "admin" })}
        canManageManagementAccess
        onRoleChange={vi.fn(async () => {})}
        onPermissionsChange={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByRole("button", { name: "Edit admin access" })).toBeTruthy();
  });

  it("shows the header access control for a super_admin without a role label or permission matrix", () => {
    render(
      <ManagementStaffPanel
        {...baseProps}
        person={makePerson({ orgRole: "super_admin" })}
        canManageManagementAccess
        onRoleChange={vi.fn(async () => {})}
        onPermissionsChange={vi.fn(async () => {})}
      />,
    );
    expect(document.querySelector('[data-slot="management-header-access"]')).toHaveTextContent(
      "Super Admin",
    );
    expect(screen.queryByText("Role")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit admin access" })).toBeNull();
  });

  it("offers access controls for an employee-linked admin too", () => {
    render(
      <ManagementStaffPanel
        {...baseProps}
        person={makePerson({
          source: "employee",
          employeeId: "emp-1",
          orgRole: "admin",
        })}
        canManageManagementAccess
        onRoleChange={vi.fn(async () => {})}
        onPermissionsChange={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByRole("button", { name: "Edit admin access" })).toBeTruthy();
  });
});
