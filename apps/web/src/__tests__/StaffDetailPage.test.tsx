import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithQuery as render } from "@/test-utils/renderWithQuery";
import { StaffDetailPage } from "@/components/staff-detail/StaffDetailPage";
import { makeEmployee } from "@/__tests__/factories";
import {
  fetchEmployeeById,
  fetchEmployeeShifts,
  fetchEmployeeInvitations,
  fetchEmployeeRoleHistory,
  updateEmployee,
} from "@/features/employees/client";
import { toast } from "sonner";
import { createOrganizationInvitation } from "@/features/organization/client";
import { fetchRecurringShifts, fetchShiftRequests } from "@/features/schedule/client";

const mockReplace = vi.fn();
const mockToastInfo = vi.fn();
const mockUsePermissions = vi.fn();
const mockUseOrganizationData = vi.fn();
const mockUseDirectory = vi.fn();
const mockInvalidateQueries = vi.fn();
// A single stable router object — the real useRouter is referentially stable,
// and StaffDetailPage lists it in effect deps, so a fresh object per render
// would re-run the fetch effect forever.
const mockRouter = { replace: mockReplace, push: vi.fn(), back: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
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
  useMediaQuery: () => false,
  MOBILE: 640,
  TABLET: 1024,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "viewer-user-id" } }),
}));

// Note: we no longer mock @tanstack/react-query; `renderWithQuery` provides a
// real QueryClient so `useQuery` + `useQueryClient` work as in production.
// `mockInvalidateQueries` is retained for compatibility but is unused.
void mockInvalidateQueries;

vi.mock("@/features/employees/client", () => {
  class MockEmployeeProfileConflictError extends Error {
    constructor(public readonly latestEmployee: unknown) {
      super("Employee details changed elsewhere.");
    }
  }
  class MockEmployeeContactConflictError extends Error {}
  class MockEmployeeStatusConflictError extends Error {
    constructor(public readonly latestEmployee: unknown) {
      super("Employee status changed elsewhere.");
    }
  }
  class MockEmployeeAccessDeniedError extends Error {}
  return {
    EmployeeAccessDeniedError: MockEmployeeAccessDeniedError,
    EmployeeContactConflictError: MockEmployeeContactConflictError,
    EmployeeProfileConflictError: MockEmployeeProfileConflictError,
    EmployeeStatusConflictError: MockEmployeeStatusConflictError,
    fetchEmployeeById: vi.fn(),
    fetchEmployeeShifts: vi.fn(),
    fetchEmployeeInvitations: vi.fn(),
    fetchEmployeeRoleHistory: vi.fn(),
    updateEmployee: vi.fn(),
    deactivateEmployee: vi.fn(),
    activateEmployee: vi.fn(),
    removeEmployee: vi.fn(),
  };
});

vi.mock("@/features/organization/client", () => ({
  revokeInvitation: vi.fn(),
  updateOrganizationMembershipGuarded: vi.fn(),
  createOrganizationInvitation: vi.fn(),
}));

vi.mock("@/features/schedule/client", () => ({
  fetchRecurringShifts: vi.fn(),
  fetchShiftRequests: vi.fn(),
  fetchScheduleActorNames: vi.fn().mockResolvedValue({ names: {} }),
}));

vi.mock("@/components/ProgressBar", () => ({
  default: ({ loading }: { loading?: boolean }) => (loading ? <div>Loading...</div> : null),
}));

vi.mock("@/components/staff-detail/StaffDetailHeader", () => ({
  StaffDetailHeader: () => <div>Personal details header</div>,
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

let lastEditEmployeePanelSave: ((updatedEmployee: unknown) => void | Promise<void>) | null = null;
let lastEditEmployeePanelSaveWithReinvite:
  ((updatedEmployee: unknown, oldInvitation: unknown) => void | Promise<void>) | null = null;
let lastEditEmployeePanelPendingInvitation: unknown = undefined;
let lastEditEmployeePanelPersistent = false;

vi.mock("@/components/EditEmployeePanel", () => ({
  default: (props: {
    onSave: (updatedEmployee: unknown) => void | Promise<void>;
    onSaveWithReinvite?: (updatedEmployee: unknown, oldInvitation: unknown) => void | Promise<void>;
    pendingInvitation?: unknown;
    persistent?: boolean;
  }) => {
    lastEditEmployeePanelSave = props.onSave;
    lastEditEmployeePanelSaveWithReinvite = props.onSaveWithReinvite ?? null;
    lastEditEmployeePanelPendingInvitation = props.pendingInvitation;
    lastEditEmployeePanelPersistent = props.persistent ?? false;
    return <div>Edit details form</div>;
  },
}));

vi.mock("@/components/InviteEmployeeModal", () => ({
  default: () => <div>Invite employee modal</div>,
}));

vi.mock("@/components/staff/EmployeeManagementAccessModal", () => ({
  EmployeeManagementAccessEditor: () => <div>Management access editor</div>,
}));

const mockedFetchEmployeeById = vi.mocked(fetchEmployeeById);
const mockedUpdateEmployee = vi.mocked(updateEmployee);
const mockedCreateOrganizationInvitation = vi.mocked(createOrganizationInvitation);
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

    // SettingsShell reads a sidebar-collapse preference from localStorage on
    // mount; jsdom in this project doesn't provide it by default.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
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
      assignments: [],
      absenceTypes: [],
      shiftCategories: [],
      certifications: [],
      orgRoles: [],
      departments: [],
      assignmentLabelMap: new Map(),
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
    mockedUpdateEmployee.mockImplementation(async (employee) => ({
      ...employee,
      version: employee.version + 1,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      expect(mockToastInfo).toHaveBeenCalledWith("You don't have access to employee details.");
      expect(mockReplace).toHaveBeenCalledWith("/people");
    });
  });

  it("defaults to the overview section", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByText("Work details")).toBeInTheDocument();
    expect(screen.getByText("Personal details header")).toBeInTheDocument();
    expect(screen.queryByText("Schedule panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity panel")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
  });

  it("uses the same account and work navigation structure as My Profile", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByText("Work details")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("My work")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/people/emp-1?section=overview",
    );
    expect(screen.getByRole("link", { name: "Schedule" })).toHaveAttribute(
      "href",
      "/people/emp-1?section=schedule",
    );
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/people/emp-1?section=activity",
    );
  });

  it("uses a focused sidebar instead of an actions menu", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.getByText("Edit details form")).toBeInTheDocument();
    expect(screen.getByText("Invitation pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reinvite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit profile" })).not.toBeInTheDocument();
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
    await screen.findByText("Work details");
    expect(screen.getByText("Edit details form")).toBeInTheDocument();
  });

  it("shows management access controls and invite flows in the detail page", async () => {
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
      assignments: [],
      absenceTypes: [],
      shiftCategories: [],
      certifications: [],
      orgRoles: [],
      departments: [
        {
          id: 1,
          orgId: "org-1",
          name: "HR",
          abbr: "",
          type: "management",
          sortOrder: 0,
          archivedAt: null,
          permissions: null,
        },
      ],
      assignmentLabelMap: new Map(),
      absenceTypeMap: new Map(),
      loading: false,
    });

    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");
    expect(screen.getByRole("button", { name: "Edit access" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reinvite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(screen.queryByText("Management access editor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit access" }));
    expect(screen.getByText("Management access editor")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the work-details form focused on biodata, without invite UI leaking in", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    expect(screen.getByText("Edit details form")).toBeInTheDocument();
    expect(lastEditEmployeePanelPersistent).toBe(true);
    expect(screen.getByRole("link", { name: "Back to People" })).toHaveAttribute("href", "/people");
    expect(screen.queryByRole("button", { name: "Invite control" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pending invitation:/)).not.toBeInTheDocument();
  });

  it("shows a distinct toast when saving a changed email silently revokes the pending invitation", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    if (!lastEditEmployeePanelSave) {
      throw new Error("Expected EditEmployeePanel to receive onSave");
    }
    await act(async () => {
      await lastEditEmployeePanelSave!({ ...mockEmployee, email: "new.address@example.com" });
    });

    await waitFor(() => {
      expect(mockedUpdateEmployee).toHaveBeenCalled();
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      expect.stringContaining("margaret@example.com"),
    );
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(expect.stringContaining("revoked"));
  });

  it("shows the plain saved toast when the email is unchanged, even with a pending invitation present", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    if (!lastEditEmployeePanelSave) {
      throw new Error("Expected EditEmployeePanel to receive onSave");
    }
    await act(async () => {
      await lastEditEmployeePanelSave!({ ...mockEmployee, firstName: "Marge" });
    });

    await waitFor(() => {
      expect(mockedUpdateEmployee).toHaveBeenCalled();
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Employee saved");
  });

  it("passes the live pending invitation and a reinvite handler into EditEmployeePanel", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    expect(lastEditEmployeePanelPendingInvitation).toMatchObject({
      id: "invite-1",
      email: "margaret@example.com",
    });
    expect(lastEditEmployeePanelSaveWithReinvite).toBeTypeOf("function");
  });

  it("saving with the reinvite confirmation creates and sends a new invitation with the old one's role and departments", async () => {
    mockedCreateOrganizationInvitation.mockResolvedValue({
      invitationId: "invite-2",
      token: "fresh-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
        json: async () => ({ success: true }),
      }),
    );

    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    if (!lastEditEmployeePanelSaveWithReinvite) {
      throw new Error("Expected EditEmployeePanel to receive onSaveWithReinvite");
    }
    const oldInvitation = lastEditEmployeePanelPendingInvitation;
    await act(async () => {
      await lastEditEmployeePanelSaveWithReinvite!(
        { ...mockEmployee, email: "new.address@example.com" },
        oldInvitation,
      );
    });

    expect(mockedUpdateEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new.address@example.com" }),
      "org-1",
      expect.anything(),
    );
    expect(mockedCreateOrganizationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new.address@example.com",
        role: "user",
        employeeId: "emp-1",
        departmentIds: undefined,
      }),
    );
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      expect.stringContaining("new.address@example.com"),
    );
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
    await screen.findByText("Work details");
    // canViewEmployeeDetails can be granted without canManageEmployees (a
    // per-person admin permission bit) — that viewer must see the read-only
    // summary, never the live editable form.
    expect(screen.queryByText("Edit details form")).not.toBeInTheDocument();
    expect(screen.getByText("Employment")).toBeInTheDocument();
  });
});
