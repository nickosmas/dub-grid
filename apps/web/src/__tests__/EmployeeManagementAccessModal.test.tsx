import { act, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EmployeeManagementAccessEditor } from "@/components/staff/EmployeeManagementAccessModal";
import type { EmployeeManagementAccessEditorHandle } from "@/components/staff/EmployeeManagementAccessModal";
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
import { useIsInSandbox } from "@/hooks/useIsInSandbox";
import { checkEmployeeEmailConflict, updateEmployeeIdentity } from "@/features/employees/client";

vi.mock("@/hooks/useIsInSandbox", () => ({
  useIsInSandbox: vi.fn(() => false),
  useSandboxSourceOrgId: vi.fn(() => null),
}));

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

vi.mock("@/features/employees/client", () => {
  class MockEmployeeContactConflictError extends Error {
    constructor(
      message: string,
      public readonly field: "email" | "phone",
    ) {
      super(message);
      this.name = "EmployeeContactConflictError";
    }
  }
  return {
    updateEmployeeIdentity: vi.fn(),
    checkEmployeeEmailConflict: vi.fn(),
    EmployeeContactConflictError: MockEmployeeContactConflictError,
  };
});

vi.mock("@/features/permissions/client", () => ({
  usePermissions: () => ({
    isSuperAdmin: true,
    isGridmaster: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const fetchOrganizationUsersMock = vi.mocked(fetchOrganizationUsers);
const updateAppOnlyUserMock = vi.mocked(updateAppOnlyUser);
const createOrganizationInvitationMock = vi.mocked(createOrganizationInvitation);
const updateOrganizationInvitationGuardedMock = vi.mocked(updateOrganizationInvitationGuarded);
const resendOrganizationInvitationGuardedMock = vi.mocked(resendOrganizationInvitationGuarded);
const revokeOrganizationInvitationGuardedMock = vi.mocked(revokeOrganizationInvitationGuarded);
const updateOrganizationMembershipGuardedMock = vi.mocked(updateOrganizationMembershipGuarded);
const useIsInSandboxMock = vi.mocked(useIsInSandbox);
const updateEmployeeIdentityMock = vi.mocked(updateEmployeeIdentity);
const checkEmployeeEmailConflictMock = vi.mocked(checkEmployeeEmailConflict);

const employee: Employee = {
  id: "emp-1",
  employeeNumber: 1001,
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
  createdAt: null,
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
    employeeNumber: 1042,
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

describe("EmployeeManagementAccessEditor", () => {
  beforeEach(() => {
    useIsInSandboxMock.mockReturnValue(false);
    fetchOrganizationUsersMock.mockResolvedValue([]);
    checkEmployeeEmailConflictMock.mockResolvedValue({
      conflict: false,
      conflictingEmployeeId: null,
    });
    updateAppOnlyUserMock.mockResolvedValue(undefined);
    updateOrganizationMembershipGuardedMock.mockResolvedValue(makeOrganizationUser());
    createOrganizationInvitationMock.mockResolvedValue({
      invitationId: "inv-1",
      token: "token-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    updateOrganizationInvitationGuardedMock.mockResolvedValue(
      makePendingInvitation({
        updatedAt: "2026-01-02T00:00:00.000Z",
        departmentIds: [10],
      }),
    );
    resendOrganizationInvitationGuardedMock.mockResolvedValue({
      invitation: makePendingInvitation({
        updatedAt: "2026-01-03T00:00:00.000Z",
        departmentIds: [10],
      }),
      token: "resent-token",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    revokeOrganizationInvitationGuardedMock.mockResolvedValue(
      makePendingInvitation({
        revokedAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
    );
    updateEmployeeIdentityMock.mockResolvedValue({
      success: true,
      employee: { ...employee, email: "new.hire@example.com" },
    });
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

  it("updates management departments on the existing membership when the employee is already linked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();
    fetchOrganizationUsersMock.mockResolvedValue([makeOrganizationUser()]);

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={{ ...employee, userId: "user-1" }}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );

    // Wait for org users to load so linkedUser resolves.
    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Leadership" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      // No link call — the user is already attached to the employee row.
      expect(updateAppOnlyUserMock).toHaveBeenCalledWith("user-1", "org-1", {
        departmentIds: [10],
      });
      expect(updateOrganizationMembershipGuardedMock).not.toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("disables saving and shows a notice in sandbox mode", async () => {
    const user = userEvent.setup();
    useIsInSandboxMock.mockReturnValue(true);

    render(
      <EmployeeManagementAccessEditor
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Leadership" }));

    expect(screen.getByText(/isn't available in sandbox mode/i)).toBeInTheDocument();
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
  });

  it("updates a pending invitation's departments without resending when the email is unchanged", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          managementDepartmentIds: [10],
          invitationStatus: "pending",
        })}
        pendingInvitation={makePendingInvitation()}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );

    expect(
      await screen.findByRole("region", { name: /edit management access/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Leadership" }));
    await user.click(screen.getByRole("button", { name: "Operations" }));
    expect(screen.getByRole("button", { name: "Save Invitation" })).toBeInTheDocument();
    await act(async () => {
      await editorRef.current?.save();
    });

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
        departmentIds: [11],
      });
      expect(resendOrganizationInvitationGuardedMock).not.toHaveBeenCalled();
      expect(updateEmployeeIdentityMock).not.toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("locks the login email while a pending invitation exists, instead of allowing a silent resend", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          managementDepartmentIds: [10],
          invitationStatus: "pending",
        })}
        pendingInvitation={makePendingInvitation()}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );

    expect(
      await screen.findByRole("region", { name: /edit management access/i }),
    ).toBeInTheDocument();

    const emailInput = screen.getByRole("textbox");
    expect(emailInput).toBeDisabled();
    expect(
      screen.getByText(/an invitation is already pending at this address/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend Invitation" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Operations" }));
    await act(async () => {
      await editorRef.current?.save();
    });

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
        departmentIds: [10, 11],
      });
      expect(resendOrganizationInvitationGuardedMock).not.toHaveBeenCalled();
      expect(updateEmployeeIdentityMock).not.toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("revokes (rather than resends) a pending invitation when management departments are cleared", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          managementDepartmentIds: [10],
          invitationStatus: "pending",
        })}
        pendingInvitation={makePendingInvitation()}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );

    await screen.findByRole("region", { name: /edit management access/i });

    await user.click(screen.getByRole("button", { name: /remove from management/i }));
    expect(screen.getByText(/revokes the pending invitation/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Invitation" })).toBeInTheDocument();
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(revokeOrganizationInvitationGuardedMock).toHaveBeenCalledWith({
        orgId: "org-1",
        invitationId: "inv-1",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(updateOrganizationInvitationGuardedMock).not.toHaveBeenCalled();
      expect(resendOrganizationInvitationGuardedMock).not.toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("does not show Remove from Management for someone with no existing management access", async () => {
    render(
      <EmployeeManagementAccessEditor
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({ managementDepartmentIds: [] })}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    expect(await screen.findByText("No management access")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove from management/i }),
    ).not.toBeInTheDocument();
  });

  it("warns upfront that saving will email an invitation when adding a person with no linked account", async () => {
    const user = userEvent.setup();

    render(
      <EmployeeManagementAccessEditor
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    expect(
      screen.queryByText(/saving emails an invitation link to this address/i),
    ).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "new.hire@example.com");

    expect(
      screen.getByText(/saving emails an invitation link to this address/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Invitation" })).toBeInTheDocument();
  });

  it("locks the login email to the existing contact email when inviting someone who already has one on file", async () => {
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    const emailInput = screen.getByRole("textbox");
    expect(emailInput).toHaveValue(employee.email);
    expect(emailInput).toBeDisabled();
    expect(screen.getByText(/this is their contact email from staff details/i)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Leadership" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(createOrganizationInvitationMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: employee.email }),
      );
      expect(onCompleted).toHaveBeenCalled();
    });
  });

  it("labels the save action as a plain update for a pending invitation with no email change", async () => {
    render(
      <EmployeeManagementAccessEditor
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          managementDepartmentIds: [10],
          invitationStatus: "pending",
        })}
        pendingInvitation={makePendingInvitation()}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await screen.findByRole("region", { name: /edit management access/i });

    expect(
      screen.getByText(/an invitation is already pending at this address/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Invitation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend Invitation" })).not.toBeInTheDocument();
  });

  it("backfills a blank employee email before sending a first invitation", async () => {
    const user = userEvent.setup();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    await user.type(screen.getByRole("textbox"), "new.hire@example.com");
    await user.click(screen.getByRole("button", { name: "Leadership" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(updateEmployeeIdentityMock).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "emp-1", email: "new.hire@example.com" }),
      );
      expect(createOrganizationInvitationMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new.hire@example.com" }),
      );
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new.hire@example.com" }),
      );
    });

    // Order matters: the employee record must be backfilled before the
    // invitation is created, not after.
    expect(updateEmployeeIdentityMock.mock.invocationCallOrder[0]).toBeLessThan(
      createOrganizationInvitationMock.mock.invocationCallOrder[0],
    );
  });

  it("backfills a blank employee email after revoking a pending invitation", async () => {
    const user = userEvent.setup();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          managementDepartmentIds: [10],
          invitationStatus: "pending",
        })}
        pendingInvitation={makePendingInvitation()}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    await screen.findByRole("region", { name: /edit management access/i });

    await user.click(screen.getByRole("button", { name: /remove from management/i }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(revokeOrganizationInvitationGuardedMock).toHaveBeenCalled();
      expect(updateEmployeeIdentityMock).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "emp-1", email: "alice@example.com" }),
      );
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new.hire@example.com" }),
      );
    });

    // Order matters: revoke first, so the email-change trigger has no live
    // invitation left to auto-revoke.
    expect(revokeOrganizationInvitationGuardedMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateEmployeeIdentityMock.mock.invocationCallOrder[0],
    );
  });

  it("does not backfill the employee email while a pending invitation is meant to stay alive", async () => {
    const user = userEvent.setup();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          managementDepartmentIds: [10],
          invitationStatus: "pending",
        })}
        pendingInvitation={makePendingInvitation()}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await screen.findByRole("region", { name: /edit management access/i });

    // Departments-only change — the invitation must survive this save, so
    // backfilling employees.email here would self-revoke it via the DB
    // trigger. Regression guard for that landmine.
    await user.click(screen.getByRole("button", { name: "Operations" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(updateOrganizationInvitationGuardedMock).toHaveBeenCalled();
    });
    expect(updateEmployeeIdentityMock).not.toHaveBeenCalled();
  });

  it("swallows a backfill failure without blocking the invite or its success toast", async () => {
    const user = userEvent.setup();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();
    updateEmployeeIdentityMock.mockRejectedValue(new Error("stale version"));

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    await user.type(screen.getByRole("textbox"), "new.hire@example.com");
    await user.click(screen.getByRole("button", { name: "Leadership" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(createOrganizationInvitationMock).toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalledWith(null);
    });
  });

  it("flags an email already used by another employee in realtime and blocks saving", async () => {
    const user = userEvent.setup();
    checkEmployeeEmailConflictMock.mockResolvedValue({
      conflict: true,
      conflictingEmployeeId: "other-emp",
    });

    render(
      <EmployeeManagementAccessEditor
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    await user.type(screen.getByRole("textbox"), "taken@example.com");
    await user.click(screen.getByRole("button", { name: "Leadership" }));

    await screen.findByText(/already used by another person on your team/i);
    expect(screen.getByRole("button", { name: "Send Invitation" })).toBeDisabled();
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
  });

  it("keeps edits in place and discards them from the editor", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          managementDepartmentIds: [10],
          invitationStatus: "pending",
        })}
        pendingInvitation={makePendingInvitation()}
        onClose={onClose}
        onCompleted={vi.fn()}
      />,
    );

    await screen.findByRole("region", { name: /edit management access/i });

    await user.click(screen.getByRole("button", { name: "Operations" }));
    act(() => {
      editorRef.current?.discard();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: /edit management access/i })).toBeInTheDocument();
  });
});
