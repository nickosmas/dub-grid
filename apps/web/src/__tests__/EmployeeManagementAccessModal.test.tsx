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
import { toast } from "sonner";

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

const permissions = vi.hoisted(() => ({ isSuperAdmin: true, isGridmaster: false }));
vi.mock("@/features/permissions/client", () => ({
  usePermissions: () => permissions,
}));

const stepUpRun = vi.hoisted(() =>
  vi.fn(async (action: (token: string) => Promise<unknown>) => {
    await action("step-up-token");
    return true;
  }),
);
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
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
    permissions.isSuperAdmin = true;
    permissions.isGridmaster = false;
    useIsInSandboxMock.mockReturnValue(false);
    fetchOrganizationUsersMock.mockResolvedValue([]);
    updateAppOnlyUserMock.mockResolvedValue(undefined);
    updateOrganizationMembershipGuardedMock.mockResolvedValue(makeOrganizationUser());
    createOrganizationInvitationMock.mockResolvedValue({
      invitationId: "inv-1",
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
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    revokeOrganizationInvitationGuardedMock.mockResolvedValue(
      makePendingInvitation({
        revokedAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
    );
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
      expect(updateAppOnlyUserMock).toHaveBeenCalledWith(
        "user-1",
        "org-1",
        { departmentIds: [10] },
        "step-up-token",
      );
      expect(updateOrganizationMembershipGuardedMock).not.toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe("a linked user with a pending invitation (F-69)", () => {
    async function saveLinkedAccessWithPendingInvitation() {
      const onClose = vi.fn();
      const onCompleted = vi.fn();
      const editorRef = createRef<EmployeeManagementAccessEditorHandle>();
      fetchOrganizationUsersMock.mockResolvedValue([makeOrganizationUser()]);

      render(
        <EmployeeManagementAccessEditor
          ref={editorRef}
          employee={{ ...employee, userId: "user-1" }}
          orgId="org-1"
          managementDepartments={managementDepartments}
          pendingInvitation={makePendingInvitation()}
          onClose={onClose}
          onCompleted={onCompleted}
        />,
      );

      await waitFor(() => {
        expect(fetchOrganizationUsersMock).toHaveBeenCalled();
      });
      await userEvent.setup().click(screen.getByRole("button", { name: "Operations" }));
      await act(async () => {
        await editorRef.current?.save();
      });
      return { onClose, onCompleted };
    }

    it("revokes the pending invitation only after the membership's departments are saved", async () => {
      const { onCompleted } = await saveLinkedAccessWithPendingInvitation();

      await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
      expect(updateAppOnlyUserMock).toHaveBeenCalledWith(
        "user-1",
        "org-1",
        { departmentIds: [10, 11] },
        "step-up-token",
      );
      expect(revokeOrganizationInvitationGuardedMock).toHaveBeenCalledWith({
        orgId: "org-1",
        invitationId: "inv-1",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(revokeOrganizationInvitationGuardedMock.mock.invocationCallOrder[0]).toBeGreaterThan(
        updateAppOnlyUserMock.mock.invocationCallOrder[0]!,
      );
      // The linked user's role is shown elsewhere and never changed from here.
      expect(updateOrganizationMembershipGuardedMock).not.toHaveBeenCalled();
    });

    it("leaves the invitation pending when the departments' step-up is cancelled", async () => {
      stepUpRun.mockResolvedValueOnce(false);

      const { onClose, onCompleted } = await saveLinkedAccessWithPendingInvitation();

      expect(stepUpRun).toHaveBeenCalledOnce();
      expect(updateAppOnlyUserMock).not.toHaveBeenCalled();
      expect(revokeOrganizationInvitationGuardedMock).not.toHaveBeenCalled();
      expect(onCompleted).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    });
  });

  it("disables saving and shows a notice in sandbox mode", async () => {
    const user = userEvent.setup();
    useIsInSandboxMock.mockReturnValue(true);

    render(
      <EmployeeManagementAccessEditor
        employee={employee}
        orgId="org-1"
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
      expect(updateOrganizationInvitationGuardedMock).toHaveBeenCalledWith(
        {
          orgId: "org-1",
          invitationId: "inv-1",
          expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
          firstName: "Alice",
          lastName: "Smith",
          phone: "555-0100",
          email: "alice@example.com",
          roleToAssign: "user",
          departmentIds: [11],
        },
        "step-up-token",
      );
      expect(resendOrganizationInvitationGuardedMock).not.toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("uses Profile details as the only email-entry point for a pending invitation", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
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

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(employee.email)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend Invitation" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Operations" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(updateOrganizationInvitationGuardedMock).toHaveBeenCalledWith(
        {
          orgId: "org-1",
          invitationId: "inv-1",
          expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
          firstName: "Alice",
          lastName: "Smith",
          phone: "555-0100",
          email: "alice@example.com",
          roleToAssign: "user",
          departmentIds: [10, 11],
        },
        "step-up-token",
      );
      expect(resendOrganizationInvitationGuardedMock).not.toHaveBeenCalled();
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

    // Deselecting the last department is the removal path; there is no separate
    // Remove button, and the note below is what says so before saving.
    await user.click(screen.getByRole("button", { name: "Leadership" }));
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

  it("skips the redundant access-status summary for someone with no existing management access", async () => {
    render(
      <EmployeeManagementAccessEditor
        employee={employee}
        orgId="org-1"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({ managementDepartmentIds: [] })}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    // The "Management departments *" field below is already the empty-state
    // answer, so a second "No management access" summary above it is noise.
    expect(screen.queryByText("No management access")).not.toBeInTheDocument();
  });

  it("does not flash missing-email guidance while linked account data is loading", async () => {
    let resolveUsers: (users: OrganizationUser[]) => void = () => undefined;
    fetchOrganizationUsersMock.mockImplementationOnce(
      () =>
        new Promise<OrganizationUser[]>((resolve) => {
          resolveUsers = resolve;
        }),
    );

    render(
      <EmployeeManagementAccessEditor
        employee={{ ...employee, email: "", userId: "user-1" }}
        orgId="org-1"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });
    expect(screen.queryByText(/add an email address in profile details/i)).not.toBeInTheDocument();

    await act(async () => {
      resolveUsers([makeOrganizationUser()]);
    });

    expect(await screen.findByRole("button", { name: "Save Access" })).toBeInTheDocument();
    expect(screen.queryByText(/add an email address in profile details/i)).not.toBeInTheDocument();
  });

  it("requires an email in Profile details before inviting an unlinked person", async () => {
    const user = userEvent.setup();

    render(
      <EmployeeManagementAccessEditor
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(await screen.findByText(/add an email address in profile details/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Leadership" }));
    expect(screen.getByRole("button", { name: "Send Invitation" })).toBeDisabled();
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
  });

  // Previously the role picker lived only in MemberAccessControls, which
  // only renders once there's a real org_role to show — so a brand-new hire
  // being added to management before they had ever been invited had no way
  // to set what role the invitation would grant.
  // Regression: the invite-only role picker used to gate on `matchedUser`,
  // which only resolves once fetchOrganizationUsers finishes. For someone who
  // already has a role, that meant it flashed in on open and then vanished as
  // soon as the fetch settled - two Role fields visible at once in between.
  it("never shows the invite-only role picker for someone who already has an org role", async () => {
    let resolveUsers: (users: OrganizationUser[]) => void = () => undefined;
    fetchOrganizationUsersMock.mockImplementationOnce(
      () =>
        new Promise<OrganizationUser[]>((resolve) => {
          resolveUsers = resolve;
        }),
    );

    render(
      <EmployeeManagementAccessEditor
        employee={{ ...employee, userId: "user-1" }}
        orgId="org-1"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          userId: "user-1",
          orgRole: "super_admin",
          managementDepartmentIds: [10],
        })}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    // Before the async lookup resolves...
    expect(screen.queryAllByText("Role")).toHaveLength(0);

    await act(async () => {
      resolveUsers([makeOrganizationUser({ id: "user-1", orgRole: "super_admin" })]);
      await Promise.resolve();
    });

    // ...and after.
    expect(screen.queryAllByText("Role")).toHaveLength(0);
  });

  // Regression: submitLabel used to key off matchedUser too, so a linked
  // employee's button read "Send Invitation" until the same async lookup
  // resolved, then relabeled itself to "Save Access" - a visible flash.
  it("never shows Send Invitation for a linked employee, even before the user lookup resolves", async () => {
    let resolveUsers: (users: OrganizationUser[]) => void = () => undefined;
    fetchOrganizationUsersMock.mockImplementationOnce(
      () =>
        new Promise<OrganizationUser[]>((resolve) => {
          resolveUsers = resolve;
        }),
    );

    render(
      <EmployeeManagementAccessEditor
        employee={{ ...employee, userId: "user-1" }}
        orgId="org-1"
        managementDepartments={managementDepartments}
        directoryPerson={makeDirectoryPerson({
          userId: "user-1",
          orgRole: "admin",
          managementDepartmentIds: [10],
        })}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Save Access" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send invitation/i })).not.toBeInTheDocument();

    await act(async () => {
      resolveUsers([makeOrganizationUser({ id: "user-1", orgRole: "admin" })]);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Save Access" })).toBeInTheDocument();
  });

  it("lets the invite role be chosen before a brand-new hire has ever been invited", async () => {
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Leadership" }));
    await user.click(screen.getByRole("button", { name: "User" }));
    await user.click(screen.getByRole("option", { name: "Admin" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(createOrganizationInvitationMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: "admin" }),
        "step-up-token",
      );
    });
  });

  it.each([
    { caller: "a Super Admin", isSuperAdmin: true, isGridmaster: false, offered: true },
    { caller: "a Gridmaster", isSuperAdmin: false, isGridmaster: true, offered: true },
    { caller: "an Admin", isSuperAdmin: false, isGridmaster: false, offered: false },
  ])(
    "offers Super Admin as an invite role only to $caller when it can be granted",
    async ({ isSuperAdmin, isGridmaster, offered }) => {
      permissions.isSuperAdmin = isSuperAdmin;
      permissions.isGridmaster = isGridmaster;

      render(
        <EmployeeManagementAccessEditor
          employee={employee}
          orgId="org-1"
          managementDepartments={managementDepartments}
          onClose={vi.fn()}
          onCompleted={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(fetchOrganizationUsersMock).toHaveBeenCalled();
      });
      await userEvent.setup().click(screen.getByRole("button", { name: "User" }));

      expect(screen.getByRole("option", { name: "Admin" })).toBeInTheDocument();
      if (offered) {
        expect(screen.getByRole("option", { name: "Super Admin" })).toBeInTheDocument();
      } else {
        expect(screen.queryByRole("option", { name: "Super Admin" })).not.toBeInTheDocument();
      }
    },
  );

  it("sends nothing further when the invitation's step-up is cancelled", async () => {
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();
    stepUpRun.mockResolvedValueOnce(false);

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
        managementDepartments={managementDepartments}
        onClose={onClose}
        onCompleted={onCompleted}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Leadership" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    expect(stepUpRun).toHaveBeenCalledOnce();
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it("uses the Profile details email when inviting someone", async () => {
    const onCompleted = vi.fn();
    const editorRef = createRef<EmployeeManagementAccessEditorHandle>();

    render(
      <EmployeeManagementAccessEditor
        ref={editorRef}
        employee={employee}
        orgId="org-1"
        managementDepartments={managementDepartments}
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    await waitFor(() => {
      expect(fetchOrganizationUsersMock).toHaveBeenCalled();
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(employee.email)).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Leadership" }));
    await act(async () => {
      await editorRef.current?.save();
    });

    await waitFor(() => {
      expect(createOrganizationInvitationMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: employee.email }),
        "step-up-token",
      );
      expect(onCompleted).toHaveBeenCalled();
    });
  });

  it("labels the save action as a plain update for a pending invitation with no email change", async () => {
    render(
      <EmployeeManagementAccessEditor
        employee={employee}
        orgId="org-1"
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

    expect(screen.queryByText(employee.email)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Invitation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend Invitation" })).not.toBeInTheDocument();
  });

  it("uses the outlined secondary treatment for both Close and Discard", async () => {
    const user = userEvent.setup();

    render(
      <EmployeeManagementAccessEditor
        employee={employee}
        orgId="org-1"
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

    const closeButton = await screen.findByRole("button", { name: "Close" });
    expect(closeButton).toHaveClass("dg-btn-secondary");
    expect(closeButton).not.toHaveClass("dg-btn-ghost");

    await user.click(screen.getByRole("button", { name: "Operations" }));

    const discardButton = screen.getByRole("button", { name: "Discard" });
    expect(discardButton).toHaveClass("dg-btn-secondary");
    expect(discardButton).not.toHaveClass("dg-btn-ghost");
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
