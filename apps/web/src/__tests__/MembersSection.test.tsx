import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MembersSection, type MembersSectionProps } from "@/components/staff/MembersSection";
import type { DirectoryPerson, Employee } from "@/types";

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
