import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EmployeeManagementAccessModal } from "@/components/staff/EmployeeManagementAccessModal";
import type { Department, DirectoryPerson, Employee, Invitation, OrganizationUser } from "@/types";
import {
  createOrganizationInvitation,
  fetchOrganizationUsers,
  resendOrganizationInvitationGuarded,
  revokeOrganizationInvitationGuarded,
  updateOrganizationInvitationGuarded,
  updateOrganizationMembershipGuarded,
  updateAppOnlyUser,
} from "@/features/organization/client";
import {
  linkEmployeeToUser,
  reconcileEmployeeNameAndLinkUser,
} from "@/features/employees/client";
import { NameMismatchError } from "@/lib/account-linking";

vi.mock("@/features/organization/client", () => ({
  createOrganizationInvitation: vi.fn(),
  fetchOrganizationUsers: vi.fn(),
  resendOrganizationInvitationGuarded: vi.fn(),
  revokeOrganizationInvitationGuarded: vi.fn(),
  updateOrganizationInvitationGuarded: vi.fn(),
  updateOrganizationMembershipGuarded: vi.fn(),
  updateAppOnlyUser: vi.fn(),
  OrganizationAccessConflictError: class OrganizationAccessConflictError extends Error {
    latestUser: OrganizationUser;

    constructor(latestUser: OrganizationUser) {
      super("Organization access changed elsewhere.");
      this.latestUser = latestUser;
      this.name = "OrganizationAccessConflictError";
    }
  },
  InvitationAccessConflictError: class InvitationAccessConflictError extends Error {
    latestInvitation: Invitation;

    constructor(latestInvitation: Invitation) {
      super("Invitation changed elsewhere.");
      this.latestInvitation = latestInvitation;
      this.name = "InvitationAccessConflictError";
    }
  },
}));

vi.mock("@/features/employees/client", () => ({
  createEmployeeFromOrgUser: vi.fn(),
  reconcileEmployeeFromOrgUser: vi.fn(),
  linkEmployeeToUser: vi.fn(),
  reconcileEmployeeNameAndLinkUser: vi.fn(),
  updateEmployeeIdentity: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const fetchOrganizationUsersMock = vi.mocked(fetchOrganizationUsers);
const linkEmployeeToUserMock = vi.mocked(linkEmployeeToUser);
const reconcileEmployeeNameAndLinkUserMock = vi.mocked(reconcileEmployeeNameAndLinkUser);
const updateAppOnlyUserMock = vi.mocked(updateAppOnlyUser);
const createOrganizationInvitationMock = vi.mocked(createOrganizationInvitation);
const updateOrganizationInvitationGuardedMock = vi.mocked(updateOrganizationInvitationGuarded);
const resendOrganizationInvitationGuardedMock = vi.mocked(resendOrganizationInvitationGuarded);
const revokeOrganizationInvitationGuardedMock = vi.mocked(revokeOrganizationInvitationGuarded);
const updateOrganizationMembershipGuardedMock = vi.mocked(updateOrganizationMembershipGuarded);

const employee: Employee = {
  id: "emp-1",
  firstName: "Alice",
  lastName: "Smith",
  employmentType: "full_time",
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

function makeOrganizationUser(overrides: Partial<OrganizationUser> = {}): OrganizationUser {
  return {
    id: "user-1",
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Smith",
    orgRole: "user",
    platformRole: "none",
    adminPermissions: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSignInAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    departmentIds: [],
    deptAdminIds: [],
    ...overrides,
  };
}

function makePendingInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    orgId: "org-1",
    invitedBy: "user-2",
    email: "alice@example.com",
    roleToAssign: "user",
    expiresAt: "2026-12-31T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    employeeId: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    phone: "555-0100",
    departmentIds: [10],
    deptAdminIds: [],
    ...overrides,
  };
}

describe("EmployeeManagementAccessModal", () => {
  beforeEach(() => {
    fetchOrganizationUsersMock.mockResolvedValue([]);
    linkEmployeeToUserMock.mockResolvedValue({ status: "linked" });
    reconcileEmployeeNameAndLinkUserMock.mockResolvedValue({ status: "linked" });
    updateAppOnlyUserMock.mockResolvedValue(undefined);
    updateOrganizationMembershipGuardedMock.mockResolvedValue(makeOrganizationUser());
    createOrganizationInvitationMock.mockResolvedValue({
      invitationId: "inv-1",
      token: "token-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    updateOrganizationInvitationGuardedMock.mockResolvedValue(makePendingInvitation({
      updatedAt: "2026-01-02T00:00:00.000Z",
      departmentIds: [10],
    }));
    resendOrganizationInvitationGuardedMock.mockResolvedValue({
      invitation: makePendingInvitation({
        updatedAt: "2026-01-03T00:00:00.000Z",
        departmentIds: [10],
      }),
      token: "resent-token",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    revokeOrganizationInvitationGuardedMock.mockResolvedValue(makePendingInvitation({
      revokedAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
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
    fetchOrganizationUsersMock.mockResolvedValue([makeOrganizationUser()]);

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
      expect(updateOrganizationMembershipGuardedMock).not.toHaveBeenCalled();
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
        pendingInvitation={makePendingInvitation()}
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
      expect(updateOrganizationInvitationGuardedMock).toHaveBeenCalledWith({
        orgId: "org-1",
        invitationId: "inv-1",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        firstName: "Alice",
        lastName: "Smith",
        phone: "555-0100",
        email: "alice@example.com",
        roleToAssign: "admin",
        departmentIds: [11],
      });
      expect(resendOrganizationInvitationGuardedMock).toHaveBeenCalledWith({
        orgId: "org-1",
        invitationId: "inv-1",
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
      });
      expect(onCompleted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("allows removing management departments from an employee-backed invite and keeps the invite linked to the employee", async () => {
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
        pendingInvitation={makePendingInvitation()}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );

    await screen.findByRole("dialog", { name: /edit management access/i });

    await user.click(screen.getByRole("button", { name: /remove from management/i }));
    expect(screen.getByText(/stay on the schedule/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save access/i }));

    await waitFor(() => {
      expect(updateOrganizationInvitationGuardedMock).toHaveBeenCalledWith({
        orgId: "org-1",
        invitationId: "inv-1",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        firstName: "Alice",
        lastName: "Smith",
        phone: "555-0100",
        email: "alice@example.com",
        roleToAssign: "user",
        departmentIds: [],
      });
      expect(resendOrganizationInvitationGuardedMock).toHaveBeenCalledWith({
        orgId: "org-1",
        invitationId: "inv-1",
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
      });
      expect(onCompleted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("shows a reconcile step when the matched org member name differs and confirms with account name", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();

    fetchOrganizationUsersMock.mockResolvedValue([
      makeOrganizationUser({
        firstName: "Alicia",
        lastName: "Smith",
      }),
    ]);
    linkEmployeeToUserMock.mockRejectedValue(
      new NameMismatchError({
        employeeId: "emp-1",
        userId: "user-1",
        employeeFirstName: "Alice",
        employeeLastName: "Smith",
        accountFirstName: "Alicia",
        accountLastName: "Smith",
      }),
    );

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

    expect(await screen.findByText("Name mismatch found")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Alicia Smith")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use Account Name and Add to Management" }));

    await waitFor(() => {
      expect(reconcileEmployeeNameAndLinkUserMock).toHaveBeenCalledWith("emp-1", "user-1", "org-1");
      expect(updateAppOnlyUserMock).toHaveBeenCalledWith("user-1", "org-1", {
        departmentIds: [10],
      });
      expect(onCompleted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("prompts before dismissing dirty access edits from the modal chrome", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <EmployeeManagementAccessModal
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({ managementDepartmentIds: [10], invitationStatus: "pending" })}
        pendingInvitation={makePendingInvitation()}
        onClose={onClose}
        onCompleted={vi.fn()}
      />,
    );

    await screen.findByRole("dialog", { name: /edit management access/i });

    await user.click(screen.getByRole("button", { name: "Operations" }));
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close modal" }));

    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
