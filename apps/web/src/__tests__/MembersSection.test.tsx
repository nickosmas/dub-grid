import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MembersSection, type MembersSectionProps } from "@/components/staff/MembersSection";
import type { DirectoryPerson } from "@/types";

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

vi.mock("@/components/staff/ManagementStaffPanel", () => ({
  ManagementStaffPanel: (props: {
    person: DirectoryPerson;
    canManageManagementAccess: boolean;
    canManageScheduleEmployees: boolean;
  }) => (
    <div data-testid="management-staff-panel">
      <span>{`${props.person.firstName} ${props.person.lastName}`}</span>
      <span data-testid="can-manage-management-access">
        {String(props.canManageManagementAccess)}
      </span>
      <span data-testid="can-manage-schedule-employees">
        {String(props.canManageScheduleEmployees)}
      </span>
    </div>
  ),
}));

vi.mock("@/components/staff/StaffDetailPanel", () => ({
  StaffDetailPanel: () => <div data-testid="staff-detail-panel" />,
}));

vi.mock("@/components/staff/StaffReadOnlyDetailPanel", () => ({
  StaffReadOnlyDetailPanel: () => <div data-testid="staff-readonly-detail-panel" />,
}));

vi.mock("@/components/staff/EmployeeManagementAccessModal", () => ({
  EmployeeManagementAccessModal: () => <div data-testid="employee-management-access-modal" />,
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
    expect(screen.getByRole("button", { name: /^\+ Add$/ })).toBeInTheDocument();
  });
});
