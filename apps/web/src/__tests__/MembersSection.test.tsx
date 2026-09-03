import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MembersSection, type MembersSectionProps } from "@/components/staff/MembersSection";
import type {
  AdminPermissions,
  DirectoryPerson,
  Employee,
  Invitation,
  OrganizationRole,
} from "@/types";
import {
  fetchOrganizationInvitations,
  replaceOrganizationInvitationAccessGuarded,
  updatePendingInvitation,
} from "@/features/organization/client";
import { updateEmployeeIdentity } from "@/features/employees/client";
import { toast } from "sonner";

let mockCurrentUser: { id: string } | null = { id: "viewer-1" };

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: mockCurrentUser, signOut: vi.fn(), isLoading: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/features/organization/client", () => ({
  fetchOrganizationInvitations: vi.fn().mockResolvedValue([]),
  replaceOrganizationInvitationAccessGuarded: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  updateAppOnlyUser: vi.fn(),
  updatePendingInvitation: vi.fn(),
}));

vi.mock("@/features/employees/client", () => ({
  updateEmployeeIdentity: vi.fn(),
}));

vi.mock("@/features/organization/client/access", () => ({
  updateOrganizationMembershipGuarded: vi.fn(),
}));

let mockDirectory: DirectoryPerson[] = [];

vi.mock("@/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks")>();
  return {
    ...actual,
    useDirectory: () => ({
      directory: mockDirectory,
      loading: false,
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
    }),
    useClientFeatureFlags: () => ({
      stripe: true,
      csvImport: true,
      csvExport: true,
      reports: true,
      printing: true,
    }),
  };
});

vi.mock("@base-ui/react/popover", () => {
  const passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    Popover: {
      Root: passthrough,
      Trigger: ({ children, ...props }: { children: React.ReactNode }) => (
        <button {...props}>{children}</button>
      ),
      Portal: passthrough,
      Positioner: passthrough,
      Popup: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?:
          string | ((state: { open: boolean; side: string; align: string }) => string | undefined);
      }) => (
        <div
          className={
            typeof className === "function"
              ? className({ open: true, side: "bottom", align: "start" })
              : className
          }
        >
          {children}
        </div>
      ),
      Arrow: () => null,
    },
  };
});

let lastManagementStaffPanelSave:
  | ((data: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      managementDepartmentIds: number[];
    }) => Promise<void>)
  | null = null;
let lastStaffDetailPanelProps: {
  employee: Employee;
  onManageManagementAccess?: (employee: Employee) => void;
  orgRole?: OrganizationRole | null;
  onRoleChange?: (newRole: OrganizationRole) => Promise<void>;
  onPermissionsChange?: (perms: AdminPermissions) => Promise<void>;
} | null = null;

vi.mock("@/components/staff/ManagementStaffPanel", () => ({
  ManagementStaffPanel: (props: {
    person: DirectoryPerson;
    contactEmail: string | null;
    canManageManagementAccess: boolean;
    canManageScheduleEmployees: boolean;
    onSave: (data: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      managementDepartmentIds: number[];
    }) => Promise<void>;
  }) => {
    lastManagementStaffPanelSave = props.onSave;
    return (
      <div data-testid="management-staff-panel">
        <span>{`${props.person.firstName} ${props.person.lastName}`}</span>
        <span data-testid="can-manage-management-access">
          {String(props.canManageManagementAccess)}
        </span>
        <span data-testid="can-manage-schedule-employees">
          {String(props.canManageScheduleEmployees)}
        </span>
        <span data-testid="contact-email">{props.contactEmail ?? ""}</span>
      </div>
    );
  },
}));

vi.mock("@/components/staff/StaffDetailPanel", () => ({
  StaffDetailPanel: (props: {
    employee: Employee;
    onManageManagementAccess?: (employee: Employee) => void;
    orgRole?: OrganizationRole | null;
    onRoleChange?: (newRole: OrganizationRole) => Promise<void>;
    onPermissionsChange?: (perms: AdminPermissions) => Promise<void>;
  }) => {
    lastStaffDetailPanelProps = props;
    return <div data-testid="staff-detail-panel" />;
  },
}));

vi.mock("@/components/staff/StaffReadOnlyDetailPanel", () => ({
  StaffReadOnlyDetailPanel: () => <div data-testid="staff-readonly-detail-panel" />,
}));

vi.mock("@/components/staff/EmployeeManagementAccessModal", () => ({
  EmployeeManagementAccessEditor: () => <div data-testid="employee-management-access-editor" />,
}));

vi.mock("@/components/staff/AddManagementUserToScheduleModal", () => ({
  AddManagementUserToScheduleModal: () => <div data-testid="add-management-user-modal" />,
}));

vi.mock("@/components/staff/BulkImportModal", () => ({
  BulkImportModal: () => <div data-testid="bulk-import-modal" />,
}));

vi.mock("@/components/InviteEmployeeModal", () => ({
  default: () => <div data-testid="invite-employee-modal" />,
}));

function makePerson(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    personId: "person-1",
    source: "employee",
    employeeId: "emp-1",
    employeeNumber: 1,
    userId: "user-1",
    firstName: "Jamie",
    lastName: "Rivera",
    email: "jamie@example.com",
    phone: "",
    employeeStatus: "active",
    orgRole: "user",
    hasAppAccess: true,
    focusAreaIds: [],
    certificationId: null,
    roleIds: [],
    seniority: 1,
    lastSignInAt: null,
    invitationStatus: null,
    scheduledDepartmentIds: [],
    scheduledDeptAdminIds: [],
    managementDepartmentIds: [10],
    managementDeptAdminIds: [],
    departmentIds: [10],
    deptAdminIds: [],
    isManagementUser: true,
    ...overrides,
  };
}

const baseProps: Omit<MembersSectionProps, "canManageEmployees" | "isManagementUser"> = {
  employees: [],
  inactiveEmployees: [],
  removedEmployees: [],
  focusAreas: [],
  certifications: [],
  roles: [],
  onSave: vi.fn(),
  onRemove: vi.fn(),
  onDeactivate: vi.fn(),
  onActivate: vi.fn(),
  onAdd: vi.fn(),
  canViewEmployeeDetails: false,
  focusAreaLabel: "Focus Areas",
  certificationLabel: "Certifications",
  roleLabel: "Roles",
  useCompactRoleCertificationLabels: true,
  orgId: "org-1",
  orgName: "Acme",
  isSuperAdmin: false,
  isGridmaster: false,
  departments: [
    { id: 10, orgId: "org-1", name: "Leadership", abbr: "LEAD", type: "management", sortOrder: 0 },
  ],
  departmentLabel: "Scheduled Departments",
  managementDepartmentLabel: "Management Departments",
};

function renderMembersSection(props: Partial<MembersSectionProps> = {}) {
  lastStaffDetailPanelProps = null;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersSection
        {...baseProps}
        canManageEmployees={false}
        isManagementUser={false}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("MembersSection — management-only view access", () => {
  it("lets a self-management-only, non-admin viewer see (but not edit) other management users", async () => {
    const user = userEvent.setup();
    mockDirectory = [
      makePerson({ personId: "person-1", firstName: "Jamie", lastName: "Rivera" }),
      makePerson({ personId: "person-2", firstName: "Sam", lastName: "Lee", userId: "user-2" }),
    ];

    renderMembersSection({ canManageEmployees: false, isManagementUser: true });

    // Toggle to reach the Management view is visible for this viewer.
    const toggle = screen.getByRole("button", { name: /On Schedule/i });
    await user.click(toggle);
    await user.click(screen.getByRole("option", { name: /Management/i }));

    // Sees other management-only peers.
    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Sam Lee")).toBeInTheDocument();

    // No edit affordances: no "+ Add" (invite to management) button.
    expect(screen.queryByRole("button", { name: /^\+ Add$/ })).not.toBeInTheDocument();

    // Opening a member's detail panel is read-only.
    // The name itself links to the profile page (stopPropagation on click),
    // so click elsewhere in the row to trigger the row's own onClick.
    const row = screen.getByText("Jamie Rivera").closest("tr");
    if (!row) throw new Error("Expected to find a table row for Jamie Rivera");
    await user.click(row);
    expect(screen.getByTestId("management-staff-panel")).toBeInTheDocument();
    expect(screen.getByTestId("can-manage-management-access")).toHaveTextContent("false");
    expect(screen.getByTestId("can-manage-schedule-employees")).toHaveTextContent("false");
  });

  it("does not show the Export button to a self-management-only viewer on the scheduled tab", () => {
    mockDirectory = [];
    renderMembersSection({ canManageEmployees: false, isManagementUser: true });

    expect(screen.queryByRole("button", { name: /Export/i })).not.toBeInTheDocument();
  });

  it("hides the Management toggle entirely for a viewer with no management access at all", () => {
    mockDirectory = [];
    renderMembersSection({ canManageEmployees: false, isManagementUser: false });

    expect(screen.queryByRole("button", { name: /On Schedule/i })).not.toBeInTheDocument();
  });

  it("still lets super_admins manage (not just view) management users", async () => {
    const user = userEvent.setup();
    mockDirectory = [makePerson({ personId: "person-1", firstName: "Jamie", lastName: "Rivera" })];

    // Inviting/editing management access requires canManageManagementAccess
    // (super_admin/gridmaster), not just canManageEmployees — see the "+ Add"
    // gate on the Management tab in MembersSection.tsx.
    renderMembersSection({
      canManageEmployees: false,
      isSuperAdmin: true,
      isManagementUser: false,
    });

    const toggle = screen.getByRole("button", { name: /On Schedule/i });
    await user.click(toggle);
    await user.click(screen.getByRole("option", { name: /Management/i }));

    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add$/ })).toBeInTheDocument();
  });

  it("opens the same StaffDetailPanel as the People table for an on-schedule management member, not ManagementStaffPanel", async () => {
    const user = userEvent.setup();
    mockDirectory = [
      makePerson({
        personId: "person-1",
        employeeId: "emp-1",
        firstName: "Jamie",
        lastName: "Rivera",
        focusAreaIds: [1],
      }),
    ];

    renderMembersSection({
      canManageEmployees: true,
      isSuperAdmin: true,
      employees: [makeEmployee({ id: "emp-1", firstName: "Jamie", lastName: "Rivera" })],
    });

    const toggle = screen.getByRole("button", { name: /On Schedule/i });
    await user.click(toggle);
    await user.click(screen.getByRole("option", { name: /Management/i }));

    const row = screen.getByText("Jamie Rivera").closest("tr");
    if (!row) throw new Error("Expected to find a table row for Jamie Rivera");
    await user.click(row);

    expect(screen.getByTestId("staff-detail-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("management-staff-panel")).not.toBeInTheDocument();
  });

  it("opens Add to management in a modal without replacing the People detail sheet", async () => {
    const user = userEvent.setup();
    mockDirectory = [
      makePerson({
        employeeId: "emp-1",
        managementDepartmentIds: [],
        departmentIds: [],
        isManagementUser: false,
      }),
    ];
    const employee = makeEmployee({ id: "emp-1", email: "jamie@example.com" });

    renderMembersSection({
      canManageEmployees: true,
      isSuperAdmin: true,
      employees: [employee],
    });

    const row = screen.getByText("Pat Doe").closest("tr");
    if (!row) throw new Error("Expected to find the employee row");
    await user.click(row);

    if (!lastStaffDetailPanelProps?.onManageManagementAccess) {
      throw new Error("Expected StaffDetailPanel to receive the management access action");
    }
    act(() => {
      lastStaffDetailPanelProps?.onManageManagementAccess?.(employee);
    });

    expect(screen.getByTestId("staff-detail-panel")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add to management" })).toBeInTheDocument();
    expect(screen.getByTestId("employee-management-access-editor")).toBeInTheDocument();
    expect(lastStaffDetailPanelProps).not.toHaveProperty("managementAccessEditor");
  });

  it("keeps a management-only member (not on the schedule) on ManagementStaffPanel", async () => {
    const user = userEvent.setup();
    mockDirectory = [
      makePerson({
        personId: "person-1",
        firstName: "Jamie",
        lastName: "Rivera",
        focusAreaIds: [],
      }),
    ];

    renderMembersSection({ canManageEmployees: true, isSuperAdmin: true });

    const toggle = screen.getByRole("button", { name: /On Schedule/i });
    await user.click(toggle);
    await user.click(screen.getByRole("option", { name: /Management/i }));

    const row = screen.getByText("Jamie Rivera").closest("tr");
    if (!row) throw new Error("Expected to find a table row for Jamie Rivera");
    await user.click(row);

    expect(screen.getByTestId("management-staff-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("staff-detail-panel")).not.toBeInTheDocument();
  });
});

// Access is the directory table's own column, so the panel a row opens has to
// answer it too. It used to be reachable only through the management-access
// modal, which meant plain staff had no access control anywhere but the table.
describe("MembersSection — staff panel access controls", () => {
  it("hands the staff panel the same access role the table row shows", async () => {
    const user = userEvent.setup();
    mockDirectory = [
      makePerson({
        employeeId: "emp-1",
        orgRole: "user",
        managementDepartmentIds: [],
        departmentIds: [],
        isManagementUser: false,
        membershipUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];

    renderMembersSection({
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      isSuperAdmin: true,
      employees: [makeEmployee({ id: "emp-1", userId: "user-1" })],
    });

    const row = screen.getByText("Pat Doe").closest("tr");
    if (!row) throw new Error("Expected to find the employee row");
    await user.click(row);

    expect(lastStaffDetailPanelProps?.orgRole).toBe("user");
    expect(lastStaffDetailPanelProps?.onRoleChange).toBeTypeOf("function");
  });

  it("gives a staff manager who is not a super admin no way to change access", async () => {
    const user = userEvent.setup();
    mockDirectory = [
      makePerson({
        employeeId: "emp-1",
        orgRole: "user",
        managementDepartmentIds: [],
        departmentIds: [],
        isManagementUser: false,
        membershipUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];

    renderMembersSection({
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      isSuperAdmin: false,
      employees: [makeEmployee({ id: "emp-1", userId: "user-1" })],
    });

    const row = screen.getByText("Pat Doe").closest("tr");
    if (!row) throw new Error("Expected to find the employee row");
    await user.click(row);

    expect(lastStaffDetailPanelProps?.orgRole).toBe("user");
    expect(lastStaffDetailPanelProps?.onRoleChange).toBeUndefined();
    expect(lastStaffDetailPanelProps?.onPermissionsChange).toBeUndefined();
  });
});

describe("MembersSection — ManagementStaffPanel email/invitation wiring", () => {
  const fetchOrganizationInvitationsMock = vi.mocked(fetchOrganizationInvitations);
  const updatePendingInvitationMock = vi.mocked(updatePendingInvitation);
  const updateEmployeeIdentityMock = vi.mocked(updateEmployeeIdentity);
  const toastSuccessMock = vi.mocked(toast.success);

  const PENDING_INVITATION: Invitation = {
    id: "inv-1",
    orgId: "org-1",
    invitedBy: null,
    email: "old.invite@example.com",
    roleToAssign: "admin",
    expiresAt: "2099-01-01T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    employeeId: "emp-1",
    firstName: "Jamie",
    lastName: "Rivera",
    phone: null,
    departmentIds: [10],
    deptAdminIds: [],
  };

  async function openManagementOnlyPanel() {
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: /On Schedule/i });
    await user.click(toggle);
    await user.click(screen.getByRole("option", { name: /Management/i }));
    const row = screen.getByText("Jamie Rivera").closest("tr");
    if (!row) throw new Error("Expected to find a table row for Jamie Rivera");
    await user.click(row);
    await screen.findByTestId("management-staff-panel");
  }

  it("resolves contactEmail from the real employee record, not the coalesced directory display email", async () => {
    fetchOrganizationInvitationsMock.mockResolvedValueOnce([]);
    mockDirectory = [
      makePerson({
        personId: "person-1",
        employeeId: "emp-1",
        firstName: "Jamie",
        lastName: "Rivera",
        focusAreaIds: [],
        email: "coalesced-fallback@example.com",
      }),
    ];

    renderMembersSection({
      canManageEmployees: true,
      isSuperAdmin: true,
      employees: [makeEmployee({ id: "emp-1", email: "real.contact@example.com" })],
    });

    await openManagementOnlyPanel();

    expect(screen.getByTestId("contact-email")).toHaveTextContent("real.contact@example.com");
  });

  it("does not patch a pending invitation's fields after backfilling the employee email revokes it, and shows a distinct toast", async () => {
    fetchOrganizationInvitationsMock.mockResolvedValueOnce([PENDING_INVITATION]);
    updateEmployeeIdentityMock.mockResolvedValueOnce({
      success: true,
      employee: makeEmployee({ id: "emp-1", email: "new.address@example.com" }),
    });
    mockDirectory = [
      makePerson({
        personId: "person-1",
        employeeId: "emp-1",
        userId: null,
        firstName: "Jamie",
        lastName: "Rivera",
        focusAreaIds: [],
        managementDepartmentIds: [10],
      }),
    ];

    renderMembersSection({
      canManageEmployees: true,
      isSuperAdmin: true,
      orgId: "org-1",
      employees: [makeEmployee({ id: "emp-1", email: "", version: 3 })],
    });

    await openManagementOnlyPanel();

    if (!lastManagementStaffPanelSave) {
      throw new Error("Expected ManagementStaffPanel to receive onSave");
    }
    await act(async () => {
      await lastManagementStaffPanelSave!({
        firstName: "Jamie",
        lastName: "Rivera",
        email: "new.address@example.com",
        phone: "",
        managementDepartmentIds: [10],
      });
    });

    expect(updateEmployeeIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: "emp-1", email: "new.address@example.com" }),
    );
    expect(updatePendingInvitationMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("old.invite@example.com"),
    );
  });

  it("shows an error toast instead of an unhandled rejection when the save sequence throws", async () => {
    fetchOrganizationInvitationsMock.mockResolvedValueOnce([]);
    updateEmployeeIdentityMock.mockRejectedValueOnce(new Error("boom"));
    mockDirectory = [
      makePerson({
        personId: "person-1",
        employeeId: "emp-1",
        userId: null,
        firstName: "Jamie",
        lastName: "Rivera",
        focusAreaIds: [],
        managementDepartmentIds: [10],
      }),
    ];

    renderMembersSection({
      canManageEmployees: true,
      isSuperAdmin: true,
      orgId: "org-1",
      employees: [makeEmployee({ id: "emp-1", email: "existing@example.com", version: 3 })],
    });

    await openManagementOnlyPanel();

    if (!lastManagementStaffPanelSave) {
      throw new Error("Expected ManagementStaffPanel to receive onSave");
    }
    await act(async () => {
      await lastManagementStaffPanelSave!({
        firstName: "Jamie",
        lastName: "Rivera",
        email: "existing@example.com",
        phone: "555-0100",
        managementDepartmentIds: [10],
      });
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });
});

describe("MembersSection — pending invitation access", () => {
  it("waits for invitation state instead of flashing a gray Not invited pill", async () => {
    let resolveInvitations!: (invitations: Invitation[]) => void;
    const invitationRequest = new Promise<Invitation[]>((resolve) => {
      resolveInvitations = resolve;
    });
    const invitation: Invitation = {
      id: "inv-loading",
      orgId: "org-1",
      invitedBy: null,
      email: "mina@example.com",
      roleToAssign: "user",
      expiresAt: "2099-01-01T00:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      employeeId: "emp-loading",
      firstName: "Mina",
      lastName: "Diaz",
      phone: null,
      departmentIds: [],
      deptAdminIds: [],
    };
    vi.mocked(fetchOrganizationInvitations).mockReset();
    vi.mocked(fetchOrganizationInvitations)
      .mockReturnValueOnce(invitationRequest)
      .mockResolvedValue([]);

    renderMembersSection({
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      isSuperAdmin: true,
      employees: [
        makeEmployee({
          id: "emp-loading",
          firstName: "Mina",
          lastName: "Diaz",
          email: "mina@example.com",
        }),
      ],
    });

    const row = screen.getByText("Mina Diaz").closest("tr");
    if (!row) throw new Error("Expected to find Mina's staff row");
    expect(within(row).queryByLabelText(/^Account:/)).toBeNull();

    await act(async () => resolveInvitations([invitation]));

    await waitFor(() => expect(within(row).getByLabelText("Account: Invited")).toBeInTheDocument());
    expect(within(row).queryByLabelText("Account: Not invited")).toBeNull();
  });

  it("keeps Staff access editable and confirms before revoking and replacing the invite", async () => {
    const user = userEvent.setup();
    const invitation: Invitation = {
      id: "inv-pending",
      orgId: "org-1",
      invitedBy: null,
      email: "mina@example.com",
      roleToAssign: "user",
      expiresAt: "2099-01-01T00:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      employeeId: "emp-pending",
      firstName: "Mina",
      lastName: "Diaz",
      phone: null,
      departmentIds: [],
      deptAdminIds: [],
    };
    const replacement = {
      ...invitation,
      id: "inv-replacement",
      roleToAssign: "admin" as const,
      updatedAt: "2026-01-01T00:00:01.000Z",
    };
    vi.mocked(fetchOrganizationInvitations).mockReset();
    vi.mocked(fetchOrganizationInvitations).mockResolvedValue([invitation]);
    vi.mocked(replaceOrganizationInvitationAccessGuarded).mockReset();
    vi.mocked(replaceOrganizationInvitationAccessGuarded).mockResolvedValueOnce({
      invitation: replacement,
      previousInvitationId: invitation.id,
    });
    mockDirectory = [
      makePerson({
        personId: "inv:inv-pending",
        employeeId: "emp-pending",
        userId: null,
        firstName: "Mina",
        lastName: "Diaz",
        email: "mina@example.com",
        // The pending invitation is the source of truth before the directory
        // has a linked membership role to return.
        orgRole: null,
        hasAppAccess: false,
        invitationStatus: "pending",
        membershipUpdatedAt: null,
      }),
    ];

    renderMembersSection({
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      isSuperAdmin: true,
      employees: [makeEmployee({ id: "emp-pending", firstName: "Mina", lastName: "Diaz" })],
    });

    const row = await screen.findByText("Mina Diaz").then((name) => name.closest("tr"));
    if (!row) throw new Error("Expected to find Mina's staff row");
    await waitFor(() => expect(within(row).getByRole("button", { name: "User" })).toBeEnabled());
    await user.click(within(row).getByRole("button", { name: "User" }));
    await user.click(screen.getByRole("option", { name: "Admin" }));

    expect(screen.getByText("Replace invitation access?")).toBeInTheDocument();
    expect(replaceOrganizationInvitationAccessGuarded).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Revoke and resend" }));
    await waitFor(() =>
      expect(replaceOrganizationInvitationAccessGuarded).toHaveBeenCalledWith({
        orgId: "org-1",
        invitationId: "inv-pending",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        roleToAssign: "admin",
      }),
    );
  });
});

// The staff panel's filters (employment type, focus area, certification,
// contact) describe scheduled staff; a roster row answers none of them. Each
// half of the directory gets the filters its own rows can be narrowed by.
describe("MembersSection — management roster filters", () => {
  async function showManagementView(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /On Schedule/i }));
    await user.click(screen.getByRole("option", { name: /Management/i }));
  }

  it("swaps the staff filter panel for the roster's own filters", async () => {
    const user = userEvent.setup();
    mockDirectory = [makePerson({ personId: "person-1" })];

    renderMembersSection({ canManageEmployees: true, isSuperAdmin: true });

    await user.click(screen.getByRole("button", { name: /Filter/i }));
    expect(screen.getByText("Employment")).toBeInTheDocument();
    expect(screen.queryByText("Access level")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));

    await showManagementView(user);
    await user.click(screen.getByRole("button", { name: /Filter/i }));

    expect(screen.queryByText("Employment")).not.toBeInTheDocument();
    expect(screen.queryByText("Qualifications")).not.toBeInTheDocument();
    expect(screen.getByText("Invitation")).toBeInTheDocument();
    expect(screen.getByText("Sort by")).toBeInTheDocument();
    // Twice: the section of access-level filters, and the sort by it.
    expect(screen.getAllByText("Access level")).toHaveLength(2);
  });

  it("filters the roster by access level", async () => {
    const user = userEvent.setup();
    mockDirectory = [
      makePerson({ personId: "person-1", firstName: "Jamie", lastName: "Rivera" }),
      makePerson({
        personId: "person-2",
        firstName: "Sam",
        lastName: "Lee",
        userId: "user-2",
        orgRole: "super_admin",
      }),
    ];

    renderMembersSection({ canManageEmployees: true, isSuperAdmin: true });

    await showManagementView(user);
    await user.click(screen.getByRole("button", { name: /Filter/i }));
    await user.click(screen.getByRole("button", { name: "Super Admin" }));

    expect(screen.getByText("Sam Lee")).toBeInTheDocument();
    expect(screen.queryByText("Jamie Rivera")).not.toBeInTheDocument();
  });

  it("filters the roster down to pending invitations", async () => {
    const user = userEvent.setup();
    mockDirectory = [
      makePerson({ personId: "person-1", firstName: "Jamie", lastName: "Rivera" }),
      makePerson({
        personId: "person-2",
        source: "pending_invite",
        firstName: "Sam",
        lastName: "Lee",
        userId: null,
        hasAppAccess: false,
        invitationStatus: "pending",
      }),
    ];

    renderMembersSection({ canManageEmployees: true, isSuperAdmin: true });

    await showManagementView(user);
    await user.click(screen.getByRole("button", { name: /Filter/i }));
    await user.click(screen.getByRole("button", { name: /Invitation pending/ }));

    expect(screen.getByText("Sam Lee")).toBeInTheDocument();
    expect(screen.queryByText("Jamie Rivera")).not.toBeInTheDocument();
  });

  it("sorts the roster alphabetically, and by access level on request", async () => {
    const user = userEvent.setup();
    // Zoe outranks Alex, so the two sorts disagree and the order is a real
    // signal rather than alphabetical order twice.
    mockDirectory = [
      makePerson({
        personId: "person-1",
        firstName: "Zoe",
        lastName: "Adams",
        orgRole: "super_admin",
      }),
      makePerson({
        personId: "person-2",
        firstName: "Alex",
        lastName: "Brooks",
        userId: "user-2",
        orgRole: "user",
      }),
    ];

    renderMembersSection({ canManageEmployees: true, isSuperAdmin: true });

    await showManagementView(user);
    const namesInOrder = () =>
      screen.getAllByText(/^(Zoe Adams|Alex Brooks)$/).map((node) => node.textContent);

    expect(namesInOrder()).toEqual(["Alex Brooks", "Zoe Adams"]);

    await user.click(screen.getByRole("button", { name: /Filter/i }));
    await user.click(screen.getByRole("button", { name: "Access level" }));

    expect(namesInOrder()).toEqual(["Zoe Adams", "Alex Brooks"]);
  });
});

function makeEmployee(overrides: Partial<Employee> & { id: string }): Employee {
  return {
    firstName: "Pat",
    lastName: "Doe",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 1,
    ...overrides,
  };
}

const RN = { id: 10, orgId: "org-1", name: "Registered Nurse", abbr: "RN", sortOrder: 0 };

describe("MembersSection — certified staff count", () => {
  // Support staff hold no certification, which is the whole signal: a scheduler
  // reading "Certified staff" is reading the number of nurses.
  it("counts staff holding a certification, and support staff separately", () => {
    mockDirectory = [];
    renderMembersSection({
      certifications: [RN],
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      employees: [
        makeEmployee({ id: "e1", firstName: "Casey", certificationId: RN.id }),
        makeEmployee({ id: "e2", firstName: "Drew", certificationId: RN.id }),
        makeEmployee({ id: "e3", firstName: "Robin", certificationId: null }),
      ],
    });

    expect(screen.getByRole("button", { name: "Certified staff count, 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not certified count, 1" })).toBeInTheDocument();
  });

  it("reconciles with the on-schedule headcount beside it", () => {
    mockDirectory = [];
    renderMembersSection({
      certifications: [RN],
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      employees: [
        makeEmployee({ id: "e1", certificationId: RN.id }),
        makeEmployee({ id: "e2", certificationId: null }),
        makeEmployee({ id: "e3", certificationId: null }),
      ],
    });

    expect(screen.getByLabelText("On schedule staff count")).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "Certified staff count, 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not certified count, 2" })).toBeInTheDocument();
  });

  it("narrows the table to support staff when that filter is picked", async () => {
    const user = userEvent.setup();
    mockDirectory = [];
    renderMembersSection({
      certifications: [RN],
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      employees: [
        makeEmployee({ id: "e1", firstName: "Casey", certificationId: RN.id }),
        makeEmployee({ id: "e2", firstName: "Robin", certificationId: null }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /filter/i }));
    await user.click(screen.getByRole("button", { name: "Not certified" }));

    expect(screen.getByText(/Robin/)).toBeInTheDocument();
    expect(screen.queryByText(/Casey/)).not.toBeInTheDocument();
  });

  it("narrows the table to certified staff when that filter is picked", async () => {
    const user = userEvent.setup();
    mockDirectory = [];
    renderMembersSection({
      certifications: [RN],
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      employees: [
        makeEmployee({ id: "e1", firstName: "Casey", certificationId: RN.id }),
        makeEmployee({ id: "e2", firstName: "Robin", certificationId: null }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /filter/i }));
    await user.click(screen.getByRole("button", { name: "Certified staff" }));

    expect(screen.getByText(/Casey/)).toBeInTheDocument();
    expect(screen.queryByText(/Robin/)).not.toBeInTheDocument();
  });
});

const LPN = { id: 11, orgId: "org-1", name: "Licensed Practical Nurse", abbr: "LPN", sortOrder: 1 };

function renderWithCertifications(employees: Employee[], certifications = [RN, LPN]) {
  mockDirectory = [];
  renderMembersSection({
    certifications,
    canManageEmployees: true,
    canViewEmployeeDetails: true,
    employees,
  });
}

describe("MembersSection — per-certification cards", () => {
  it("shows a card per certification with its holder count", () => {
    renderWithCertifications([
      makeEmployee({ id: "e1", certificationId: RN.id }),
      makeEmployee({ id: "e2", certificationId: RN.id }),
      makeEmployee({ id: "e3", certificationId: LPN.id }),
    ]);

    expect(screen.getByRole("button", { name: "RN, 2 staff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LPN, 1 staff" })).toBeInTheDocument();
  });

  // A credential nobody holds is a staffing gap worth seeing, not noise.
  it("shows a zero for a certification nobody holds", () => {
    renderWithCertifications([makeEmployee({ id: "e1", certificationId: RN.id })]);

    expect(screen.getByRole("button", { name: "LPN, 0 staff" })).toBeInTheDocument();
  });

  it("card counts sum to the certified staff total", () => {
    renderWithCertifications([
      makeEmployee({ id: "e1", certificationId: RN.id }),
      makeEmployee({ id: "e2", certificationId: LPN.id }),
      makeEmployee({ id: "e3", certificationId: null }),
    ]);

    expect(screen.getByRole("button", { name: "Certified staff count, 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RN, 1 staff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LPN, 1 staff" })).toBeInTheDocument();
  });

  it("narrows the table to the holders of a card that is clicked", async () => {
    const user = userEvent.setup();
    renderWithCertifications([
      makeEmployee({ id: "e1", firstName: "Casey", certificationId: RN.id }),
      makeEmployee({ id: "e2", firstName: "Robin", certificationId: LPN.id }),
    ]);

    await user.click(screen.getByRole("button", { name: "RN, 1 staff" }));

    expect(screen.getByText(/Casey/)).toBeInTheDocument();
    expect(screen.queryByText(/Robin/)).not.toBeInTheDocument();
  });

  it("clears the filter when the selected card is clicked again", async () => {
    const user = userEvent.setup();
    renderWithCertifications([
      makeEmployee({ id: "e1", firstName: "Casey", certificationId: RN.id }),
      makeEmployee({ id: "e2", firstName: "Robin", certificationId: LPN.id }),
    ]);

    await user.click(screen.getByRole("button", { name: "RN, 1 staff" }));
    await user.click(screen.getByRole("button", { name: "RN, 1 staff" }));

    expect(screen.getByText(/Casey/)).toBeInTheDocument();
    expect(screen.getByText(/Robin/)).toBeInTheDocument();
  });

  it("keeps a holder of an archived certification visible in its own card", () => {
    renderWithCertifications([
      makeEmployee({ id: "e1", certificationId: RN.id }),
      makeEmployee({ id: "e2", certificationId: 999 }),
    ]);

    expect(screen.getByRole("button", { name: "Archived, 1 staff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Certified staff count, 2" })).toBeInTheDocument();
  });

  it("filters to certified staff when the leading total card is clicked", async () => {
    const user = userEvent.setup();
    renderWithCertifications([
      makeEmployee({ id: "e1", firstName: "Casey", certificationId: RN.id }),
      makeEmployee({ id: "e2", firstName: "Robin", certificationId: null }),
    ]);

    await user.click(screen.getByRole("button", { name: /^Certified staff count/ }));

    expect(screen.getByText(/Casey/)).toBeInTheDocument();
    expect(screen.queryByText(/Robin/)).not.toBeInTheDocument();
  });

  // Headcounts describe who is on staff now. The helper filters on status
  // itself, so a non-active row reaching this list can never inflate a count.
  it("counts active staff only", () => {
    renderWithCertifications([
      makeEmployee({ id: "e1", certificationId: RN.id }),
      makeEmployee({ id: "e2", certificationId: RN.id, status: "inactive" }),
      makeEmployee({ id: "e3", certificationId: LPN.id, status: "removed" }),
      makeEmployee({ id: "e4", certificationId: null }),
      makeEmployee({ id: "e5", certificationId: null, status: "inactive" }),
    ]);

    expect(screen.getByRole("button", { name: "Certified staff count, 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not certified count, 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RN, 1 staff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LPN, 0 staff" })).toBeInTheDocument();
  });

  it("renders no cards when the org has no certifications configured", () => {
    renderWithCertifications([makeEmployee({ id: "e1", certificationId: null })], []);

    expect(screen.queryByRole("button", { name: /staff$/ })).not.toBeInTheDocument();
  });
});
