import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StaffDetailPage } from "@/components/staff-detail/StaffDetailPage";
import { makeEmployee } from "@/__tests__/factories";
import {
  fetchEmployeeById,
  fetchEmployeeShifts,
  fetchRecurringShifts,
  fetchEmployeeInvitations,
  fetchEmployeeRoleHistory,
  fetchShiftRequests,
} from "@/lib/db";

const mockReplace = vi.fn();
const mockToastInfo = vi.fn();
const mockUsePermissions = vi.fn();
const mockUseOrganizationData = vi.fn();
const mockUseDirectory = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), back: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => mockToastInfo(...args),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/hooks", () => ({
  usePermissions: () => mockUsePermissions(),
  useOrganizationData: () => mockUseOrganizationData(),
  useDirectory: () => mockUseDirectory(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("@/lib/db", () => ({
  fetchEmployeeById: vi.fn(),
  fetchEmployeeShifts: vi.fn(),
  fetchRecurringShifts: vi.fn(),
  fetchEmployeeInvitations: vi.fn(),
  fetchEmployeeRoleHistory: vi.fn(),
  fetchShiftRequests: vi.fn(),
  updateEmployee: vi.fn(),
  benchEmployee: vi.fn(),
  activateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ data: [] }),
      })),
    })),
  },
}));

vi.mock("@/components/ProgressBar", () => ({
  default: ({ loading }: { loading?: boolean }) =>
    loading ? <div>Loading...</div> : null,
}));

vi.mock("@/components/staff-detail/StaffDetailHeader", () => ({
  StaffDetailHeader: ({
    canEditDetails,
    showManagementPanel,
    onToggleEditDetails,
  }: {
    canEditDetails: boolean;
    showManagementPanel: boolean;
    onToggleEditDetails: () => void;
  }) => (
    <div>
      <div>Personal details header</div>
      {canEditDetails ? <button onClick={onToggleEditDetails}>{showManagementPanel ? "Hide Edit Details" : "Edit Details"}</button> : null}
    </div>
  ),
}));

vi.mock("@/components/staff-detail/tabs/OverviewTab", () => ({
  OverviewTab: () => (
    <div>
      <div>Overview content</div>
      <div>Account summary</div>
      <div>Employment summary</div>
    </div>
  ),
}));

vi.mock("@/components/staff-detail/tabs/ScheduleTab", () => ({
  ScheduleTab: () => <div>Schedule panel</div>,
}));

vi.mock("@/components/staff-detail/tabs/ActivityTab", () => ({
  ActivityTab: () => <div>Activity panel</div>,
}));

vi.mock("@/components/EditEmployeePanel", () => ({
  default: () => <div>Edit details form</div>,
}));

vi.mock("@/components/InviteEmployeeModal", () => ({
  default: () => <div>Invite employee modal</div>,
}));

vi.mock("@/components/staff/EmployeeManagementAccessModal", () => ({
  EmployeeManagementAccessModal: () => <div>Management access modal</div>,
}));

const mockedFetchEmployeeById = vi.mocked(fetchEmployeeById);
const mockedFetchEmployeeShifts = vi.mocked(fetchEmployeeShifts);
const mockedFetchRecurringShifts = vi.mocked(fetchRecurringShifts);
const mockedFetchEmployeeInvitations = vi.mocked(fetchEmployeeInvitations);
const mockedFetchEmployeeRoleHistory = vi.mocked(fetchEmployeeRoleHistory);
const mockedFetchShiftRequests = vi.mocked(fetchShiftRequests);

const mockEmployee = makeEmployee({
  id: "emp-1",
  firstName: "Margaret",
  lastName: "Sullivan",
  email: "margaret@example.com",
  status: "active",
  userId: null,
});

describe("StaffDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseOrganizationData.mockReturnValue({
      org: {
        id: "org-1",
        name: "Acme Org",
        shiftDisplayMode: "code",
        focusAreaLabel: "Focus Areas",
        certificationLabel: "Certification",
        roleLabel: "Roles",
      },
      focusAreas: [],
      shiftCodes: [],
      absenceTypes: [],
      shiftCategories: [],
      certifications: [],
      orgRoles: [],
      departments: [],
      shiftCodeMap: new Map(),
      absenceTypeMap: new Map(),
      loading: false,
    });
    mockUseDirectory.mockReturnValue({
      directory: [],
      loading: false,
      error: null,
    });

    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: true,
      canViewRecurringShifts: false,
      canManageEmployees: true,
      isSuperAdmin: false,
      isGridmaster: false,
      isLoading: false,
      orgId: "org-1",
    });

    mockedFetchEmployeeById.mockResolvedValue(mockEmployee);
    mockedFetchEmployeeShifts.mockResolvedValue({});
    mockedFetchRecurringShifts.mockResolvedValue([]);
    mockedFetchEmployeeInvitations.mockResolvedValue([
      {
        id: "invite-1",
        orgId: "org-1",
        invitedBy: null,
        email: "margaret@example.com",
        roleToAssign: "user",
        expiresAt: "2099-01-01T00:00:00.000Z",
        acceptedAt: null,
        revokedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        employeeId: "emp-1",
      },
    ]);
    mockedFetchEmployeeRoleHistory.mockResolvedValue([]);
    mockedFetchShiftRequests.mockResolvedValue([]);
  });

  it("redirects to /people when employee detail access is denied", async () => {
    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: false,
      canViewRecurringShifts: false,
      canManageEmployees: false,
      isSuperAdmin: false,
      isGridmaster: false,
      isLoading: false,
      orgId: "org-1",
    });

    render(<StaffDetailPage employeeId="emp-1" />);

    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith(
        "You don't have access to employee details.",
      );
      expect(mockReplace).toHaveBeenCalledWith("/people");
    });
  });

  it("defaults to the overview section", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByText("Overview content")).toBeInTheDocument();
    expect(screen.getByText("Personal details header")).toBeInTheDocument();
    expect(screen.queryByText("Schedule panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity panel")).not.toBeInTheDocument();
    expect(screen.getByText("Account summary")).toBeInTheDocument();
    expect(screen.getByText("Employment summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
  });

  it("switches between overview, schedule, and activity sections", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByText("Overview content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(screen.queryByText("Overview content")).not.toBeInTheDocument();
    expect(screen.getByText("Schedule panel")).toBeInTheDocument();
    expect(screen.queryByText("Activity panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Activity" }));

    expect(screen.queryByText("Overview content")).not.toBeInTheDocument();
    expect(screen.getByText("Activity panel")).toBeInTheDocument();
    expect(screen.queryByText("Schedule panel")).not.toBeInTheDocument();
  });

  it("shows staffing and access actions without requiring edit mode", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Overview content");

    expect(screen.getByText("Staffing actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reinvite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Invitation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bench" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminate" })).toBeInTheDocument();
    expect(screen.queryByText("Edit details form")).not.toBeInTheDocument();
  });

  it("still exposes management tools for super admins", async () => {
    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: true,
      canViewRecurringShifts: false,
      canManageEmployees: false,
      isSuperAdmin: true,
      isGridmaster: false,
      isLoading: false,
      orgId: "org-1",
    });

    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Overview content");
    expect(screen.getByRole("button", { name: "Edit Details" })).toBeInTheDocument();
  });

  it("shows management access controls and invite flows available in the popover", async () => {
    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: true,
      canViewRecurringShifts: false,
      canManageEmployees: true,
      isSuperAdmin: false,
      isGridmaster: true,
      isLoading: false,
      orgId: "org-1",
    });
    mockUseDirectory.mockReturnValue({
      directory: [
        {
          personId: "person-1",
          source: "employee",
          employeeId: "emp-1",
          userId: null,
          firstName: "Margaret",
          lastName: "Sullivan",
          email: "margaret@example.com",
          phone: "",
          employeeStatus: "active",
          orgRole: null,
          hasAppAccess: false,
          focusAreaIds: [],
          certificationId: null,
          roleIds: [],
          seniority: 1,
          lastSignInAt: null,
          invitationStatus: "pending",
          scheduledDepartmentIds: [],
          scheduledDeptAdminIds: [],
          managementDepartmentIds: [1],
          managementDeptAdminIds: [],
          departmentIds: [1],
          deptAdminIds: [],
          isManagementUser: false,
        },
      ],
      loading: false,
      error: null,
    });
    mockUseOrganizationData.mockReturnValue({
      org: {
        id: "org-1",
        name: "Acme Org",
        shiftDisplayMode: "code",
        focusAreaLabel: "Focus Areas",
        certificationLabel: "Certification",
        roleLabel: "Roles",
      },
      focusAreas: [],
      shiftCodes: [],
      absenceTypes: [],
      shiftCategories: [],
      certifications: [],
      orgRoles: [],
      departments: [{ id: 1, orgId: "org-1", name: "HR", abbr: "", type: "management", sortOrder: 0, archivedAt: null, permissions: null }],
      shiftCodeMap: new Map(),
      absenceTypeMap: new Map(),
      loading: false,
    });

    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Overview content");
    expect(screen.getByRole("button", { name: "Edit Management Access" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Invitation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reinvite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bench" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminate" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Management Access" }));
    expect(screen.getByText("Management access modal")).toBeInTheDocument();
  });

  it("keeps edit mode focused on biodata changes", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Overview content");

    fireEvent.click(screen.getByRole("button", { name: "Edit Details" }));

    expect(screen.getByText("Edit details form")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite control" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pending invitation:/)).not.toBeInTheDocument();
  });

  it("hides management tools for viewers without edit access", async () => {
    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: true,
      canViewRecurringShifts: false,
      canManageEmployees: false,
      isSuperAdmin: false,
      isGridmaster: false,
      isLoading: false,
      orgId: "org-1",
    });

    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Overview content");
    expect(screen.queryByRole("button", { name: "Edit Details" })).not.toBeInTheDocument();
  });
});
