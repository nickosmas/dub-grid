import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StaffView from "@/components/StaffView";
import { Department, Employee, FocusArea, NamedItem, ScheduleCellSegmentInput } from "@/types";
import { upsertRecurringShift } from "@/features/schedule/client";

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
const { mockShiftPickerRender } = vi.hoisted(() => ({
  mockShiftPickerRender: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
let mockCurrentUser: { id: string } | null = null;
const DESIGNATIONS: NamedItem[] = [
  { id: 1, orgId: "org-1", name: "JLCSN", abbr: "JLCSN", sortOrder: 0 },
  { id: 2, orgId: "org-1", name: "CSN III", abbr: "CSN III", sortOrder: 1 },
  { id: 3, orgId: "org-1", name: "CSN II", abbr: "CSN II", sortOrder: 2 },
  { id: 4, orgId: "org-1", name: "STAFF", abbr: "STAFF", sortOrder: 3 },
  { id: 5, orgId: "org-1", name: "—", abbr: "—", sortOrder: 4 },
];
const ROLES: NamedItem[] = [
  { id: 1, orgId: "org-1", name: "DCSN", abbr: "DCSN", sortOrder: 0 },
  { id: 2, orgId: "org-1", name: "DVCSN", abbr: "DVCSN", sortOrder: 1 },
  { id: 3, orgId: "org-1", name: "Supv", abbr: "Supv", sortOrder: 2 },
  { id: 4, orgId: "org-1", name: "Mentor", abbr: "Mentor", sortOrder: 3 },
  { id: 5, orgId: "org-1", name: "CN", abbr: "CN", sortOrder: 4 },
  { id: 6, orgId: "org-1", name: "SC. Mgr.", abbr: "SC. Mgr.", sortOrder: 5 },
  { id: 7, orgId: "org-1", name: "Activity Coordinator", abbr: "Activity Coordinator", sortOrder: 6 },
  { id: 8, orgId: "org-1", name: "SC/Asst/Act/Cor", abbr: "SC/Asst/Act/Cor", sortOrder: 7 },
];

vi.mock("@/components/EditEmployeePanel", () => ({
  default: () => <div data-testid="edit-panel" />,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/people",
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: mockCurrentUser, signOut: vi.fn(), isLoading: false }),
}));

vi.mock("@/components/ShiftPicker", () => ({
  default: ({
    assignments = [],
    absenceTypes = [],
    orgRoles = [],
    certifications = [],
    onSelect,
    onAbsenceSelect,
  }: {
      assignments?: Array<{ id: number; label: string }>;
      absenceTypes?: Array<{ id: number; label: string }>;
      orgRoles?: Array<{ id: number }>;
      certifications?: Array<{ id: number }>;
      onSelect: (segments: ScheduleCellSegmentInput[]) => void;
      onAbsenceSelect?: (absenceType: { id: number; label: string }) => void;
    }) => {
      mockShiftPickerRender({ assignments, absenceTypes, orgRoles, certifications });
      return (
        <div>
        {assignments.map((assignment) => (
          <button
            key={assignment.id}
            onClick={() =>
              onSelect([
                {
                  shiftId: null,
                  jobId: assignment.id,
                  position: 0,
                },
              ])
            }
          >
            {`pick-${assignment.label}`}
          </button>
        ))}
        {absenceTypes.map((absenceType) => (
          <button
            key={`absence-${absenceType.id}`}
            onClick={() => onAbsenceSelect?.(absenceType)}
          >
            {`absence-${absenceType.label}`}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock("@/features/schedule/client", () => ({
  fetchRecurringShifts: vi.fn().mockResolvedValue([]),
  getRecurringDraft: vi.fn().mockResolvedValue(null),
  upsertRecurringShift: vi.fn(),
  deleteRecurringShift: vi.fn(),
  saveRecurringDraft: vi.fn(),
  deleteRecurringDraft: vi.fn(),
}));

vi.mock("@/features/organization/client", () => ({
  fetchOrganizationInvitations: vi.fn().mockResolvedValue([]),
  revokeOrganizationInvitationGuarded: vi.fn(),
  resendOrganizationInvitationGuarded: vi.fn(),
  removeUserFromOrganization: vi.fn(),
  updateAppOnlyUser: vi.fn(),
  updateOrganizationInvitationGuarded: vi.fn(),
}));

vi.mock("@/components/ui/sidebar", () => {
  const passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    SidebarProvider: passthrough,
    SidebarInset: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <main {...props}>{children}</main>,
    Sidebar: () => <div data-testid="mock-sidebar" />,
    SidebarContent: passthrough,
    SidebarGroup: passthrough,
    SidebarGroupContent: passthrough,
    SidebarMenu: passthrough,
    SidebarMenuItem: passthrough,
    SidebarMenuButton: passthrough,
    SidebarFooter: passthrough,
  };
});

// Mock base-ui popover to avoid Floating UI positioning overhead in jsdom.
// Root always renders children so Trigger stays visible; Popup content is always present in tests.
vi.mock("@base-ui/react/popover", () => {
  const passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    Popover: {
      Root: passthrough,
      Trigger: ({ children, ...props }: { children: React.ReactNode; render?: unknown; [key: string]: unknown }) => <button {...props}>{children}</button>,
      Portal: passthrough,
      Positioner: passthrough,
      Popup: ({
        children,
        className,
      }: {
        children: React.ReactNode;
        className?:
          | string
          | ((state: { open: boolean; side: string; align: string }) => string | undefined);
      }) => (
        <div className={typeof className === "function" ? className({ open: true, side: "bottom", align: "start" }) : className}>
          {children}
        </div>
      ),
      Arrow: ({
        className,
      }: {
        className?:
          | string
          | ((state: { open: boolean; side: string; align: string; uncentered: boolean }) => string | undefined);
      }) => (
        <div
          className={
            typeof className === "function"
              ? className({
                  open: true,
                  side: "bottom",
                  align: "start",
                  uncentered: false,
                })
              : className
          }
        />
      ),
    },
  };
});

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "North",
    sortOrder: 1,
    departmentId: null,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "South",
    sortOrder: 2,
    departmentId: null,
  },
];

const departments: Department[] = [
  {
    id: 10,
    orgId: "org-1",
    name: "Residential",
    abbr: "RES",
    type: "scheduled",
    sortOrder: 1,
    archivedAt: null,
  },
  {
    id: 20,
    orgId: "org-1",
    name: "Clinical",
    abbr: "CLN",
    type: "scheduled",
    sortOrder: 2,
    archivedAt: null,
  },
];
const managementDepartments: Department[] = [
  ...departments,
  {
    id: 30,
    orgId: "org-1",
    name: "Operations",
    abbr: "OPS",
    type: "management",
    sortOrder: 3,
    archivedAt: null,
  },
];

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: 4,
    roleIds: [],
    seniority: 2,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
    employeeNumber: 1001,
    createdAt: null,
  },
  {
    id: "emp-2",
    firstName: "Bob",
    lastName: "Jones",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: 3,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
    employeeNumber: 1002,
    createdAt: null,
  },
];

const filterEmployees: Employee[] = [
  {
    ...employees[0],
    id: "emp-filter-1",
    firstName: "Alice",
    lastName: "Alpha",
    employmentType: "full_time",
    certificationId: 4,
    roleIds: [4],
    focusAreaIds: [1],
    email: "alice@example.com",
    phone: "555-0101",
    userId: "user-alice",
    departmentIds: [10],
    deptAdminIds: [10],
  },
  {
    ...employees[1],
    id: "emp-filter-2",
    firstName: "Bob",
    lastName: "Beta",
    employmentType: "part_time",
    certificationId: 3,
    roleIds: [2],
    focusAreaIds: [2],
    email: "",
    phone: "555-0202",
    userId: null,
    departmentIds: [20],
    deptAdminIds: [],
  },
  {
    ...employees[0],
    id: "emp-filter-3",
    firstName: "Casey",
    lastName: "Clark",
    employmentType: "full_time",
    certificationId: 3,
    roleIds: [2],
    focusAreaIds: [1],
    email: "casey@example.com",
    phone: "",
    userId: null,
    departmentIds: [10],
    deptAdminIds: [],
    seniority: 3,
  },
];

const defaultCertifications = [...DESIGNATIONS];
const defaultRoles = [...ROLES];

const defaultProps = {
  employees,
  focusAreas,
  certifications: defaultCertifications,
  roles: defaultRoles,
  onSave: vi.fn(),
  onRemove: vi.fn(),
  onDeactivate: vi.fn(),
  onActivate: vi.fn(),
  onAdd: vi.fn(),
  canViewEmployeeDetails: true,
  canManageEmployees: true,
  departments,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  mockCurrentUser = null;
  mockShiftPickerRender.mockReset();
  document.body.style.overflow = "";
});

describe("StaffView", () => {
  describe("Controls", () => {
    it("renders 'Add' button", () => {
      renderWithProviders(<StaffView {...defaultProps} />);
      expect(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
    });

    it("clicking 'Add' button calls onAdd", async () => {
      const onAdd = vi.fn();
      renderWithProviders(<StaffView {...defaultProps} onAdd={onAdd} />);
      await userEvent.click(screen.getByRole("button", { name: /Add/ }));
      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("renders sortable column headers", async () => {
      renderWithProviders(<StaffView {...defaultProps} />);
      // The ID column header is clickable for seniority sort; the Name column header is clickable for name sort.
      expect(screen.getByText("ID")).toBeInTheDocument();
      expect(screen.getByText("Name")).toBeInTheDocument();
    });

    it("grays out empty roster export and reorder while leaving import available", async () => {
      renderWithProviders(
        <StaffView {...defaultProps} employees={[]} orgId="org-1" />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
      });
      // Reorder only shows on the Active tab (reordering rewrites seniority on
      // active employees only). Default landed on the All tab after the
      // 4-tab restructure, so switch to Active to assert the disabled state.
      await userEvent.click(screen.getByRole("button", { name: /^Active/ }));
      expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Reorder" })).toBeDisabled();
    });

    it("hides admin-only People controls from regular users", async () => {
      mockSearchParams = new URLSearchParams("section=recurring-schedule");

      renderWithProviders(
        <StaffView
          {...defaultProps}
          orgId="org-1"
          canManageEmployees={false}
          canViewEmployeeDetails={false}
          canViewRecurringShifts
          canManageRecurringShifts={false}
          departments={managementDepartments}
        />,
      );

      expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Add/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /On Schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByText("Recurring Shifts")).not.toBeInTheDocument();
      expect(screen.queryByRole("gridcell")).not.toBeInTheDocument();
    });
  });

  describe("Expand/collapse", () => {
    it("clicking an employee row expands the inline editor", async () => {
      renderWithProviders(<StaffView {...defaultProps} />);
      expect(screen.queryByTestId("edit-panel")).not.toBeInTheDocument();
      // Click the avatar initials (part of the row, not the name link)
      await userEvent.click(screen.getByText("AS"));
      expect(screen.getByTestId("edit-panel")).toBeInTheDocument();
    });

    it("clicking the same expanded row again collapses the editor", async () => {
      renderWithProviders(<StaffView {...defaultProps} />);
      // Click the avatar initials to expand
      await userEvent.click(screen.getByText("AS"));
      expect(screen.getByTestId("edit-panel")).toBeInTheDocument();
      // Click the avatar initials again to collapse
      await userEvent.click(screen.getAllByText("AS")[0]);
      expect(screen.queryByTestId("edit-panel")).not.toBeInTheDocument();
    });
  });

  describe("Avatar", () => {
    it("renders initials 'AS' for Alice Smith", () => {
      renderWithProviders(<StaffView {...defaultProps} />);
      expect(screen.getByText("AS")).toBeInTheDocument();
    });

    it("renders initials 'BJ' for Bob Jones", () => {
      renderWithProviders(<StaffView {...defaultProps} />);
      expect(screen.getByText("BJ")).toBeInTheDocument();
    });
  });

  describe("Employee count", () => {
    it("shows only on-schedule and employment-type summary cards", () => {
      renderWithProviders(
        <StaffView
          {...defaultProps}
          employees={[
            employees[0],
            {
              ...employees[1],
              employmentType: "part_time",
            },
          ]}
          inactiveEmployees={[
            {
              ...employees[0],
              id: "emp-inactive",
              employmentType: "part_time",
              status: "inactive",
            },
          ]}
          removedEmployees={[
            {
              ...employees[1],
              id: "emp-removed",
              status: "removed",
            },
          ]}
        />,
      );

      expect(within(screen.getByLabelText("On schedule staff count")).getByText("2")).toBeInTheDocument();
      expect(within(screen.getByLabelText("Full-time staff count")).getByText("1")).toBeInTheDocument();
      expect(within(screen.getByLabelText("Part-time staff count")).getByText("1")).toBeInTheDocument();
      expect(screen.queryByLabelText("Management staff count")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Benched staff count")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Terminated staff count")).not.toBeInTheDocument();
    });

    it("renders both employees in the list", () => {
      renderWithProviders(<StaffView {...defaultProps} />);
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });

    it("routes the current user's own profile link to /profile", () => {
      mockCurrentUser = { id: "user-1" };
      renderWithProviders(
        <StaffView
          {...defaultProps}
          employees={[
            {
              ...employees[0],
              userId: "user-1",
            },
            employees[1],
          ]}
        />,
      );

      expect(screen.getByRole("link", { name: "Alice Smith" })).toHaveAttribute("href", "/profile");
      expect(screen.getByRole("link", { name: "Bob Jones" })).toHaveAttribute("href", "/people/emp-2");
    });
  });

  describe("Detailed filters", () => {
    it("locks page scroll while the filter window is open", async () => {
      const user = userEvent.setup();
      renderWithProviders(<StaffView {...defaultProps} employees={filterEmployees} />);

      expect(document.body.style.overflow).toBe("");

      await user.click(screen.getByRole("button", { name: /Filter/i }));
      expect(document.body.style.overflow).toBe("hidden");

      await user.click(screen.getByRole("button", { name: "Done" }));
      await waitFor(() => {
        expect(document.body.style.overflow).toBe("");
      });
    });

    it("filters scheduled staff by employment type and shows a clearable pill", async () => {
      const user = userEvent.setup();
      renderWithProviders(<StaffView {...defaultProps} employees={filterEmployees} />);

      await user.click(screen.getByRole("button", { name: /Filter/i }));
      await user.click(screen.getByRole("button", { name: "Part-time" }));

      expect(screen.getByRole("link", { name: "Bob Beta" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Alice Alpha" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Casey Clark" })).not.toBeInTheDocument();
      expect(screen.getByText("Employment: Part-time")).toBeInTheDocument();
    });

    it("filters scheduled staff by department and department admin status", async () => {
      const user = userEvent.setup();
      renderWithProviders(<StaffView {...defaultProps} employees={filterEmployees} />);

      await user.click(screen.getByRole("button", { name: /Filter/i }));
      await user.click(screen.getByRole("button", { name: "Residential" }));
      await user.click(screen.getByLabelText("Department admins only"));

      expect(screen.getByRole("link", { name: "Alice Alpha" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Bob Beta" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Casey Clark" })).not.toBeInTheDocument();
      expect(screen.getByText("Scheduled Departments: Residential")).toBeInTheDocument();
      expect(screen.getByText("Department admin: Residential")).toBeInTheDocument();
    });

    it("combines certification, role, and employment filters", async () => {
      const user = userEvent.setup();
      renderWithProviders(<StaffView {...defaultProps} employees={filterEmployees} />);

      await user.click(screen.getByRole("button", { name: /Filter/i }));
      await user.click(screen.getByRole("button", { name: "Full-time" }));
      await user.click(screen.getByRole("button", { name: "CSN II" }));
      await user.click(screen.getByRole("button", { name: "DVCSN" }));

      expect(screen.getByRole("link", { name: "Casey Clark" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Alice Alpha" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Bob Beta" })).not.toBeInTheDocument();
      expect(screen.getByText("Certifications: CSN II")).toBeInTheDocument();
      expect(screen.getByText("Roles: DVCSN")).toBeInTheDocument();
    });

    it("filters by linked account and contact detail presence alongside search", async () => {
      const user = userEvent.setup();
      renderWithProviders(<StaffView {...defaultProps} employees={filterEmployees} />);

      await user.type(screen.getByPlaceholderText("Search by name, email, or phone..."), "Alice");
      await user.click(screen.getByRole("button", { name: /Filter/i }));
      await user.click(screen.getByRole("button", { name: "Linked account" }));
      await user.click(screen.getByRole("button", { name: "Has email" }));
      await user.click(screen.getByRole("button", { name: "Has phone" }));

      expect(screen.getByRole("link", { name: "Alice Alpha" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Bob Beta" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Casey Clark" })).not.toBeInTheDocument();
      expect(screen.getByText("Account: Linked account")).toBeInTheDocument();
      expect(screen.getByText("Email: Has email")).toBeInTheDocument();
      expect(screen.getByText("Phone: Has phone")).toBeInTheDocument();
    });

    it("filters by unlinked and missing contact details, then clears all filters", async () => {
      const user = userEvent.setup();
      renderWithProviders(<StaffView {...defaultProps} employees={filterEmployees} />);

      await user.click(screen.getByRole("button", { name: /Filter/i }));
      await user.click(screen.getByRole("button", { name: /Unlinked account/ }));
      await user.click(screen.getByRole("button", { name: "Missing email" }));

      expect(screen.getByRole("link", { name: "Bob Beta" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Alice Alpha" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Casey Clark" })).not.toBeInTheDocument();

      await user.click(screen.getAllByRole("button", { name: /Clear all/i })[0]);

      expect(screen.getByRole("link", { name: "Alice Alpha" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Bob Beta" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Casey Clark" })).toBeInTheDocument();
      expect(screen.queryByText("Account: Unlinked account")).not.toBeInTheDocument();
      expect(screen.queryByText("Email: Missing email")).not.toBeInTheDocument();
    });
  });

  describe("Recurring permissions", () => {
    it("hides the Recurring Shifts section when recurring view permission is absent", async () => {
      renderWithProviders(<StaffView {...defaultProps} orgId="org-1" canViewRecurringShifts={false} />);
      expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
      expect(screen.queryByText("Recurring Shifts")).not.toBeInTheDocument();
    });

    it("renders the recurring section read-only when recurring manage permission is absent", async () => {
      mockSearchParams = new URLSearchParams("section=recurring-schedule");
      renderWithProviders(
        <StaffView
          {...defaultProps}
          orgId="org-1"
          canViewRecurringShifts
          canManageRecurringShifts={false}
        />,
      );

      expect(await screen.findByText("Recurring Shifts")).toBeInTheDocument();
      expect((await screen.findAllByRole("gridcell"))[0]).toHaveAttribute("tabindex", "-1");
      expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    });

    it("saves recurring shift changes through the recurring upsert helper", async () => {
      mockSearchParams = new URLSearchParams("section=recurring-schedule");
      const user = userEvent.setup();
      const mockedUpsertRecurringShift = vi.mocked(upsertRecurringShift);

      renderWithProviders(
        <StaffView
          {...defaultProps}
          orgId="org-1"
          assignments={[
            {
              id: 101,
              orgId: "org-1",
              label: "D",
              name: "Day",
              color: "#dbeafe",
              border: "#93c5fd",
              text: "#1d4ed8",
              categoryId: null,
              focusAreaId: null,
              sortOrder: 0,
              requiredCertificationIds: [],
              defaultStartTime: "07:00",
              defaultEndTime: "15:00",
              defaultDurationHours: 8,
              defaultDurationMinutes: 0,
              archivedAt: null,
            },
          ]}
          canViewRecurringShifts
          canManageRecurringShifts
        />,
      );

      expect(await screen.findByText("Recurring Shifts")).toBeInTheDocument();

      await user.click((await screen.findAllByRole("gridcell"))[0]);
      await user.click(screen.getByRole("button", { name: "pick-D" }));
      await user.click(screen.getByRole("button", { name: "Save Changes" }));
      const confirmDialog = await screen.findByRole("dialog", {
        name: "Save Recurring Schedule Changes?",
      });
      await user.click(
        within(confirmDialog).getByRole("button", { name: "Save Changes" }),
      );

      expect(mockedUpsertRecurringShift).toHaveBeenCalledTimes(1);
      expect(mockedUpsertRecurringShift).toHaveBeenCalledWith(
        "emp-2",
        "org-1",
        0,
        {
          kind: "worked",
          segments: [
            {
              shiftId: null,
              jobId: 101,
              position: 0,
            },
          ],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: true,
        },
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
      expect(mockToastSuccess).toHaveBeenCalledWith("Recurring schedules saved");
    });

    it("passes recurring picker ranking inputs so shift options can stay correctly ordered", async () => {
      mockSearchParams = new URLSearchParams("section=recurring-schedule");
      const user = userEvent.setup();

      renderWithProviders(
        <StaffView
          {...defaultProps}
          orgId="org-1"
          assignments={[
            {
              id: 101,
              orgId: "org-1",
              label: "D",
              name: "Day",
              color: "#dbeafe",
              border: "#93c5fd",
              text: "#1d4ed8",
              categoryId: null,
              focusAreaId: null,
              sortOrder: 0,
              requiredCertificationIds: [],
              defaultStartTime: "07:00",
              defaultEndTime: "15:00",
              defaultDurationHours: 8,
              defaultDurationMinutes: 0,
              archivedAt: null,
            },
          ]}
          canViewRecurringShifts
          canManageRecurringShifts
        />,
      );

      expect(await screen.findByText("Recurring Shifts")).toBeInTheDocument();
      await user.click((await screen.findAllByRole("gridcell"))[0]);

      expect(mockShiftPickerRender).toHaveBeenCalled();
      const lastCall = mockShiftPickerRender.mock.calls.at(-1)?.[0] as {
        orgRoles: NamedItem[];
        certifications: NamedItem[];
      };
      expect(lastCall.orgRoles.map((role) => role.id)).toEqual(defaultRoles.map((role) => role.id));
      expect(lastCall.certifications.map((certification) => certification.id)).toEqual(
        defaultCertifications.map((certification) => certification.id),
      );
    });

    it("closes the recurring picker when the window starts resizing", async () => {
      mockSearchParams = new URLSearchParams("section=recurring-schedule");
      const user = userEvent.setup();

      renderWithProviders(
        <StaffView
          {...defaultProps}
          orgId="org-1"
          assignments={[
            {
              id: 101,
              orgId: "org-1",
              label: "D",
              name: "Day",
              color: "#dbeafe",
              border: "#93c5fd",
              text: "#1d4ed8",
              categoryId: null,
              focusAreaId: null,
              sortOrder: 0,
              requiredCertificationIds: [],
              defaultStartTime: "07:00",
              defaultEndTime: "15:00",
              defaultDurationHours: 8,
              defaultDurationMinutes: 0,
              archivedAt: null,
            },
          ]}
          canViewRecurringShifts
          canManageRecurringShifts
        />,
      );

      expect(await screen.findByText("Recurring Shifts")).toBeInTheDocument();

      await user.click((await screen.findAllByRole("gridcell"))[0]);
      expect(screen.getByRole("button", { name: "pick-D" })).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "pick-D" }),
        ).not.toBeInTheDocument();
      });
    });
  });
});

// Feature: ui-ux-test-suite, Property 3: Seniority sort produces non-decreasing sequence
// Feature: ui-ux-test-suite, Property 4: Name sort produces non-decreasing alphabetical sequence
describe("Property-based tests", () => {
  const arbUniqueEmployees = fc
    .array(
      fc.record({
        firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && /[a-zA-Z]/.test(s)),
        lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && /[a-zA-Z]/.test(s)),
        employmentType: fc.constant("full_time" as const),
        status: fc.constant("active" as const),
        statusChangedAt: fc.constant(null as string | null),
        statusNote: fc.constant(""),
        certificationId: fc.oneof(fc.constant(null as number | null), fc.constantFrom(...DESIGNATIONS.map((d) => d.id))),
        roleIds: fc.array(fc.constantFrom(...ROLES.map((r) => r.id))).map(ids => [...new Set(ids)]),
        seniority: fc.integer({ min: 1, max: 999 }),
        focusAreaIds: fc.array(fc.integer({ min: 1, max: 10 }), {
          minLength: 1,
        }).map(ids => [...new Set(ids)]),
        phone: fc.string(),
        email: fc.string(),
        contactNotes: fc.string(),
        userId: fc.constant(null as string | null),
        departmentIds: fc.constant([] as number[]),
        deptAdminIds: fc.constant([] as number[]),
        version: fc.constant(0),
      }),
      { minLength: 1, maxLength: 20 },
    )
    .map((emps) =>
      emps.map((emp, idx) => ({
        ...emp,
        id: `emp-${idx + 1}`,
      })),
    );

  it("seniority sort produces non-decreasing sequence", { timeout: 15000 }, async () => {
    // Validates: Requirements 5.4, 8.2
    await fc.assert(
      fc.asyncProperty(arbUniqueEmployees, async (emps) => {
        const { unmount, container } = renderWithProviders(
          <StaffView
            employees={emps}
            focusAreas={[]}
            certifications={defaultCertifications}
            roles={defaultRoles}
            onSave={vi.fn()}
            onRemove={vi.fn()}
            onDeactivate={vi.fn()}
            onActivate={vi.fn()}
            onAdd={vi.fn()}
          />,
        );

        // Seniority sort is the default — no interaction needed
        const tableContainer = container.querySelector('[data-testid="staff-table"]') as HTMLElement;

        // Table uses <table> with <tbody>; each row is a <tr>
        const tbody = tableContainer.querySelector("tbody") as HTMLElement;
        const rows = Array.from(tbody.querySelectorAll("tr"));

        // Each row's first <td> contains a seniority number in a <span>
        const seniorityValues = rows.map((row) => {
          const firstCell = row.querySelector("td") as HTMLElement;
          const span = firstCell.querySelector("span") as HTMLElement;
          return parseInt(span?.textContent ?? "0", 10);
        });

        // Assert non-decreasing order
        for (let i = 0; i < seniorityValues.length - 1; i++) {
          if (seniorityValues[i] > seniorityValues[i + 1]) {
            unmount();
            return false;
          }
        }

        unmount();
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it(
    "name sort produces non-decreasing alphabetical sequence",
    { timeout: 30000 },
    async () => {
      // Validates: Requirements 5.5
      // Use a dedicated arbitrary with unique ids to avoid React key conflicts

      await fc.assert(
        fc.asyncProperty(arbUniqueEmployees, async (emps) => {
          // The component sorts by firstName then lastName.
          // Verify the rendered order matches that sort.
          const expected = [...emps].sort(
            (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName),
          );

          const { unmount, container } = renderWithProviders(
            <StaffView
              employees={emps}
              focusAreas={[]}
              certifications={defaultCertifications}
              roles={defaultRoles}
              onSave={vi.fn()}
              onRemove={vi.fn()}
              onDeactivate={vi.fn()}
              onActivate={vi.fn()}
              onAdd={vi.fn()}
              canViewEmployeeDetails
              canManageEmployees
            />,
          );

          // Click the "Name" column header to sort by name
          const tableContainer = container.querySelector('[data-testid="staff-table"]') as HTMLElement;
          const nameHeader = tableContainer.querySelector("th:nth-child(2)") as HTMLElement;
          await userEvent.click(nameHeader);

          // Table uses <table> with <tbody>; each row is a <tr>
          const tbody = tableContainer.querySelector("tbody") as HTMLElement;
          const rows = Array.from(tbody.querySelectorAll("tr"));

          // Each row's second <td> contains the name cell
          // Inside: <div> > <Avatar/> + <div> > <div> > <a>Name</a>
          const names = rows.map((row) => {
            const nameCell = row.querySelectorAll("td")[1] as HTMLElement;
            const link = nameCell.querySelector("a") as HTMLElement;
            return link?.textContent ?? "";
          });

          unmount();

          // Compare rendered order against expected order (firstName then lastName)
          const expectedNames = expected.map((e) => `${e.firstName} ${e.lastName}`.trim());
          for (let i = 0; i < expectedNames.length; i++) {
            if (names[i] !== expectedNames[i]) return false;
          }
          return true;
        }),
        { numRuns: 30 },
      );
    },
  );

});
