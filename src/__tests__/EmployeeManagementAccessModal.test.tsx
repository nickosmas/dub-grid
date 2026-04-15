import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EmployeeManagementAccessModal } from "@/components/staff/EmployeeManagementAccessModal";
import type { Department, DirectoryPerson, Employee, OrganizationUser } from "@/types";
import {
  changeOrganizationUserRole,
  fetchOrganizationUsers,
  linkEmployeeToUser,
  resendInvitation,
  revokeInvitation,
  sendInvitation,
  updateAppOnlyUser,
  updatePendingInvitation,
} from "@/lib/db";

vi.mock("@/lib/db", () => ({
  changeOrganizationUserRole: vi.fn(),
  fetchOrganizationUsers: vi.fn(),
  linkEmployeeToUser: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  sendInvitation: vi.fn(),
  updateAppOnlyUser: vi.fn(),
  updatePendingInvitation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const fetchOrganizationUsersMock = vi.mocked(fetchOrganizationUsers);
const linkEmployeeToUserMock = vi.mocked(linkEmployeeToUser);
const updateAppOnlyUserMock = vi.mocked(updateAppOnlyUser);
const changeOrganizationUserRoleMock = vi.mocked(changeOrganizationUserRole);
const sendInvitationMock = vi.mocked(sendInvitation);
const updatePendingInvitationMock = vi.mocked(updatePendingInvitation);
const resendInvitationMock = vi.mocked(resendInvitation);
const revokeInvitationMock = vi.mocked(revokeInvitation);

const employee: Employee = {
  id: "emp-1",
  firstName: "Alice",
  lastName: "Smith",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  certificationId: null,
  roleIds: [],
  seniority: 1,
  focusAreaIds: [1],
  phone: "555-0100",
  email: "alice@example.com",
  contactNotes: "",
  userId: null,
  departmentIds: [],
  deptAdminIds: [],
  version: 0,
};

const managementDepartments: Department[] = [
  {
    id: 10,
    orgId: "org-1",
    name: "Leadership",
    abbr: "LD",
    type: "management",
    sortOrder: 0,
  },
  {
    id: 11,
    orgId: "org-1",
    name: "Operations",
    abbr: "OPS",
    type: "management",
    sortOrder: 1,
  },
];

function makeDirectoryPerson(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    personId: "emp-1",
    source: "employee",
    employeeId: "emp-1",
    userId: null,
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@example.com",
    phone: "555-0100",
    employeeStatus: "active",
    orgRole: null,
    hasAppAccess: false,
    focusAreaIds: [1],
    certificationId: null,
    roleIds: [],
    seniority: 1,
    lastSignInAt: null,
    invitationStatus: null,
    scheduledDepartmentIds: [],
    scheduledDeptAdminIds: [],
    managementDepartmentIds: [],
    managementDeptAdminIds: [],
    departmentIds: [],
    deptAdminIds: [],
    isManagementUser: false,
    ...overrides,
  };
}

describe("EmployeeManagementAccessModal", () => {
  beforeEach(() => {
    fetchOrganizationUsersMock.mockResolvedValue([]);
    linkEmployeeToUserMock.mockResolvedValue({ status: "linked" });
    updateAppOnlyUserMock.mockResolvedValue(undefined);
    changeOrganizationUserRoleMock.mockResolvedValue(undefined);
    sendInvitationMock.mockResolvedValue({
      invitationId: "inv-1",
      token: "token-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    updatePendingInvitationMock.mockResolvedValue(undefined);
    resendInvitationMock.mockResolvedValue({
      token: "resent-token",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    revokeInvitationMock.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("links an employee to an existing org member with an exact email match and updates management departments", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    const orgUsers: OrganizationUser[] = [
      {
        id: "user-1",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
        orgRole: "user",
        platformRole: "none",
        adminPermissions: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastSignInAt: null,
        departmentIds: [],
        deptAdminIds: [],
      },
    ];
    fetchOrganizationUsersMock.mockResolvedValue(orgUsers);

    render(
      <EmployeeManagementAccessModal
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );

    const emailInput = await screen.findByRole("textbox");
    await user.type(emailInput, "alice@example.com");
    await screen.findByText(/existing org member found for this email/i);

    await user.click(screen.getByRole("button", { name: "Leadership" }));
    await user.click(screen.getByRole("button", { name: /save access/i }));

    await waitFor(() => {
      expect(linkEmployeeToUserMock).toHaveBeenCalledWith("emp-1", "user-1", "org-1");
      expect(updateAppOnlyUserMock).toHaveBeenCalledWith("user-1", "org-1", {
        departmentIds: [10],
      });
      expect(changeOrganizationUserRoleMock).not.toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("resends an employee-backed management invitation with updated departments and role", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();

    render(
      <EmployeeManagementAccessModal
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({ managementDepartmentIds: [10], invitationStatus: "pending" })}
        pendingInvitation={{
          id: "inv-1",
          orgId: "org-1",
          invitedBy: "user-2",
          email: "alice@example.com",
          roleToAssign: "user",
          expiresAt: "2026-12-31T00:00:00.000Z",
          acceptedAt: null,
          revokedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Smith",
          phone: "555-0100",
          departmentIds: [10],
          deptAdminIds: [],
        }}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );

    expect(await screen.findByRole("dialog", { name: /edit management access/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Leadership" }));
    await user.click(screen.getByRole("button", { name: "Operations" }));
    await user.click(screen.getByRole("button", { name: /user/i }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    await user.click(screen.getByRole("button", { name: /save access/i }));

    await waitFor(() => {
      expect(updatePendingInvitationMock).toHaveBeenCalledWith("inv-1", "org-1", {
        firstName: "Alice",
        lastName: "Smith",
        phone: "555-0100",
        email: "alice@example.com",
        roleToAssign: "admin",
        departmentIds: [11],
      });
      expect(resendInvitationMock).toHaveBeenCalledWith("inv-1", "org-1");
      expect(onCompleted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
