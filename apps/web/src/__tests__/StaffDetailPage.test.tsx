import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithQuery as render } from "@/test-utils/renderWithQuery";
import { StaffDetailPage } from "@/components/staff-detail/StaffDetailPage";
import { makeEmployee } from "@/__tests__/factories";
import type { DirectoryPerson } from "@/types";
import {
  fetchEmployeeById,
  fetchEmployeeShifts,
  fetchEmployeeInvitations,
  fetchEmployeeActivity,
  updateEmployee,
  deactivateEmployee,
  removeEmployee,
} from "@/features/employees/client";
import { toast } from "sonner";
import {
  createOrganizationInvitation,
  resendInvitation,
  revokeInvitation,
} from "@/features/organization/client";
import { fetchRecurringShifts } from "@/features/schedule/client";
import { getProfileOverviewDateRange } from "@/features/account/shared/profile-schedule";

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
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
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

const stepUpPrompt = vi.hoisted(() => vi.fn());
// Stands in for the shared prompt: a refusal the page hands back is retried
// with an assured token, as the real hook does after the person confirms.
vi.mock("@/hooks/useSharedStepUp", () => ({
  useSharedStepUp: () => ({
    dialog: null,
    run: async (action: (accessToken?: string) => Promise<unknown>) => {
      try {
        await action();
        return true;
      } catch (error) {
        if ((error as { code?: string }).code !== "STEP_UP_REQUIRED") throw error;
        stepUpPrompt();
        await action("assured-token");
        return true;
      }
    },
  }),
}));

// Manager's note: we no longer mock @tanstack/react-query; `renderWithQuery` provides a
// real QueryClient so `useQuery` + `useQueryClient` work as in production.
// `mockInvalidateQueries` is retained for compatibility but is unused.
void mockInvalidateQueries;

vi.mock("@/features/employees/client", () => {
  class MockEmployeeProfileConflictError extends Error {
    constructor(public readonly latestEmployee: unknown) {
      super("Someone else just changed their details. Refresh and try again.");
    }
  }
  class MockEmployeeContactConflictError extends Error {}
  class MockEmployeeStatusConflictError extends Error {
    constructor(public readonly latestEmployee: unknown) {
      super("Someone else just changed their status. Refresh and try again.");
    }
  }
  class MockEmployeeAccessDeniedError extends Error {}
  class MockFocusAreaShiftsCancelledError extends Error {}
  return {
    EmployeeAccessDeniedError: MockEmployeeAccessDeniedError,
    FocusAreaShiftsCancelledError: MockFocusAreaShiftsCancelledError,
    EmployeeContactConflictError: MockEmployeeContactConflictError,
    EmployeeProfileConflictError: MockEmployeeProfileConflictError,
    EmployeeStatusConflictError: MockEmployeeStatusConflictError,
    fetchEmployeeById: vi.fn(),
    fetchEmployeeShifts: vi.fn(),
    fetchEmployeeInvitations: vi.fn(),
    fetchEmployeeActivity: vi.fn(),
    updateEmployee: vi.fn(),
    deactivateEmployee: vi.fn(),
    activateEmployee: vi.fn(),
    removeEmployee: vi.fn(),
  };
});

vi.mock("@/features/organization/client", () => ({
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  updateOrganizationMembershipGuarded: vi.fn(),
  createOrganizationInvitation: vi.fn(),
}));

vi.mock("@/features/schedule/client", () => ({
  fetchRecurringShifts: vi.fn(),
  fetchShiftPreferences: vi.fn(async () => []),
  fetchJobPreferences: vi.fn(async () => []),
}));

vi.mock("@/components/ProgressBar", () => ({
  default: ({ loading }: { loading?: boolean }) => (loading ? <div>Loading...</div> : null),
}));

vi.mock("@/components/staff-detail/tabs/StaffOverviewTab", () => ({
  StaffOverviewTab: ({ range }: { range: { startDate: string; endDate: string } }) => (
    <div>
      <div>Overview content</div>
      <div data-testid="overview-range">{`${range.startDate}..${range.endDate}`}</div>
    </div>
  ),
}));

vi.mock("@/components/staff-detail/tabs/OverviewTab", () => ({
  OverviewTab: ({ scheduleOverview }: { scheduleOverview?: ReactNode }) => (
    <div>
      <div>Overview content</div>
      <div>Account summary</div>
      <div>Employment summary</div>
      {scheduleOverview}
    </div>
  ),
}));

vi.mock("@/components/staff-detail/RecurringScheduleCard", () => ({
  RecurringScheduleCard: () => <div>Recurring schedule card</div>,
}));

vi.mock("@/components/staff-detail/tabs/ActivityTab", () => ({
  ActivityTab: () => <div>Activity panel</div>,
}));

let lastEditEmployeePanelSave: ((updatedEmployee: unknown) => void | Promise<void>) | null = null;
let lastEditEmployeePanelSaveWithReinvite:
  | ((
      updatedEmployee: unknown,
      oldInvitation: unknown,
      runStepUp: (action: (accessToken: string) => Promise<unknown>) => Promise<boolean>,
    ) => void | Promise<void>)
  | null = null;
let lastEditEmployeePanelPendingInvitation: unknown = undefined;
let lastEditEmployeePanelHideActions = false;

vi.mock("@/components/EditEmployeePanel", () => ({
  default: (props: {
    onSave: (updatedEmployee: unknown) => void | Promise<void>;
    onSaveWithReinvite?: (updatedEmployee: unknown, oldInvitation: unknown) => void | Promise<void>;
    pendingInvitation?: unknown;
    hideActions?: boolean;
  }) => {
    lastEditEmployeePanelSave = props.onSave;
    lastEditEmployeePanelSaveWithReinvite = props.onSaveWithReinvite ?? null;
    lastEditEmployeePanelPendingInvitation = props.pendingInvitation;
    lastEditEmployeePanelHideActions = props.hideActions ?? false;
    return <div>Edit details form</div>;
  },
}));

vi.mock("@/components/InviteEmployeeModal", () => ({
  default: () => <div>Invite employee modal</div>,
}));

vi.mock("@/components/staff/EmployeeManagementAccessModal", () => ({
  EmployeeManagementAccessEditor: ({
    frame,
  }: {
    frame?: (fields: React.ReactNode, actions: React.ReactNode) => React.ReactNode;
  }) => {
    const fields = <div>Management access editor</div>;
    return frame ? frame(fields, null) : fields;
  },
}));

const mockedFetchEmployeeById = vi.mocked(fetchEmployeeById);
const mockedUpdateEmployee = vi.mocked(updateEmployee);
const mockedCreateOrganizationInvitation = vi.mocked(createOrganizationInvitation);
const mockedFetchEmployeeShifts = vi.mocked(fetchEmployeeShifts);
const mockedFetchRecurringShifts = vi.mocked(fetchRecurringShifts);
const mockedFetchEmployeeInvitations = vi.mocked(fetchEmployeeInvitations);
const mockedFetchEmployeeActivity = vi.mocked(fetchEmployeeActivity);

function makeDirectoryPerson(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
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
    invitationStatus: null,
    scheduledDepartmentIds: [],
    scheduledDeptAdminIds: [],
    managementDepartmentIds: [],
    managementDeptAdminIds: [],
    departmentIds: [],
    deptAdminIds: [],
    isManagementUser: false,
    ...overrides,
  } as DirectoryPerson;
}

async function openDetailsEditor() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit work details" }));
  return screen.findByRole("dialog", { name: "Edit details" });
}

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
    mockSearchParams = new URLSearchParams();

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
        timezone: "Pacific/Honolulu",
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
      role: "admin",
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
    mockedFetchEmployeeActivity.mockResolvedValue([]);
    mockedUpdateEmployee.mockImplementation(async (employee) => ({
      ...employee,
      version: employee.version + 1,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("previous and next person", () => {
    function saveOrder(ids: string[]) {
      window.sessionStorage.setItem("dg-people-order", JSON.stringify({ orgId: "org-1", ids }));
    }
    function directoryOf(...people: Array<[string, string, string | null]>) {
      mockUseDirectory.mockReturnValue({
        directory: people.map(([employeeId, firstName, userId]) =>
          makeDirectoryPerson({
            personId: employeeId,
            employeeId,
            firstName,
            lastName: "Lane",
            userId,
          }),
        ),
        loading: false,
        error: null,
      });
    }

    afterEach(() => window.sessionStorage.clear());

    it("steps through the People list's order, keeping the open tab", async () => {
      saveOrder(["emp-0", "emp-1", "emp-2"]);
      directoryOf(["emp-0", "Ann", null], ["emp-1", "Margaret", null], ["emp-2", "Cal", null]);
      mockSearchParams = new URLSearchParams("tab=activity");

      render(<StaffDetailPage employeeId="emp-1" />);

      const pager = within(await screen.findByRole("group", { name: "Move between people" }));
      expect(pager.getByText("2 of 3")).toBeInTheDocument();
      fireEvent.click(pager.getByRole("button", { name: "Next: Cal Lane" }));
      expect(mockRouter.push).toHaveBeenCalledWith("/people/emp-2?tab=activity");
      fireEvent.click(pager.getByRole("button", { name: "Previous: Ann Lane" }));
      expect(mockRouter.push).toHaveBeenCalledWith("/people/emp-0?tab=activity");
    });

    it("stops at the ends and steps over your own record", async () => {
      saveOrder(["emp-me", "emp-1", "emp-2"]);
      directoryOf(["emp-me", "Viewer", "viewer-user-id"], ["emp-1", "Margaret", null]);

      render(<StaffDetailPage employeeId="emp-1" />);

      const pager = within(await screen.findByRole("group", { name: "Move between people" }));
      expect(pager.getByText("1 of 2")).toBeInTheDocument();
      expect(pager.getByRole("button", { name: "Previous person" })).toBeDisabled();
      fireEvent.click(pager.getByRole("button", { name: "Next person" }));
      expect(mockRouter.push).toHaveBeenCalledWith("/people/emp-2");
    });

    it("offers no arrows without a saved list, or for someone not in it", async () => {
      render(<StaffDetailPage employeeId="emp-1" />);
      await screen.findByText("Work details");
      expect(screen.queryByRole("group", { name: "Move between people" })).not.toBeInTheDocument();
    });

    it("ignores a list saved for another organization", async () => {
      window.sessionStorage.setItem(
        "dg-people-order",
        JSON.stringify({ orgId: "org-2", ids: ["emp-0", "emp-1"] }),
      );
      render(<StaffDetailPage employeeId="emp-1" />);
      await screen.findByText("Work details");
      expect(screen.queryByRole("group", { name: "Move between people" })).not.toBeInTheDocument();
    });
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
    expect(mockedFetchEmployeeInvitations).not.toHaveBeenCalled();
  });

  it("opens on the Overview tab beside the person's cards", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Margaret Sullivan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Work details")).toBeInTheDocument();
    expect(screen.getByText("Overview content")).toBeInTheDocument();
    expect(screen.queryByText("Activity panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
  });

  it("bounds the staff Overview shift load to the shared twelve-week metrics window", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);

    await screen.findByText("Work details");
    const range = getProfileOverviewDateRange(new Date(), "Pacific/Honolulu");
    expect(mockedFetchEmployeeShifts).toHaveBeenCalledWith(
      "emp-1",
      "org-1",
      expect.any(Map),
      expect.any(Map),
      range.startDate,
      range.endDate,
    );
  });

  it("loads the Overview's shifts for the chosen period", async () => {
    localStorage.setItem(
      "dg-person-period",
      JSON.stringify({
        preset: "custom",
        range: { startDate: "2026-09-01", endDate: "2026-10-15" },
      }),
    );

    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByTestId("overview-range")).toHaveTextContent("2026-09-01..2026-10-15");
    await waitFor(() =>
      expect(mockedFetchEmployeeShifts).toHaveBeenCalledWith(
        "emp-1",
        "org-1",
        expect.any(Map),
        expect.any(Map),
        "2026-09-01",
        "2026-10-15",
      ),
    );
    expect(screen.getByRole("button", { name: "Period" })).toBeInTheDocument();
  });

  it("offers a tab for each section the viewer can see, and switches by URL", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);

    const tabs = within(await screen.findByRole("group", { name: "Person sections" }));
    expect(tabs.getAllByRole("button").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Access",
      "Activity",
    ]);
    expect(tabs.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(tabs.getByRole("button", { name: "Activity" }));
    expect(mockReplace).toHaveBeenCalledWith("/people/emp-1?tab=activity", { scroll: false });
    fireEvent.click(tabs.getByRole("button", { name: "Overview" }));
    expect(mockReplace).toHaveBeenCalledWith("/people/emp-1", { scroll: false });
  });

  it("opens the tab a ?tab= link names", async () => {
    mockSearchParams = new URLSearchParams("tab=activity");

    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByText("Activity panel")).toBeInTheDocument();
    expect(screen.queryByText("Overview content")).not.toBeInTheDocument();
  });

  it.each([
    ["schedule", "/people/emp-1"],
    ["overview", "/people/emp-1"],
    ["profile", "/people/emp-1"],
    ["activity", "/people/emp-1?tab=activity"],
  ])("sends an old ?section=%s link to its tab", async (section, href) => {
    mockSearchParams = new URLSearchParams(`section=${section}`);

    render(<StaffDetailPage employeeId="emp-1" />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(href));
  });

  it("falls back to Overview for a tab the viewer can't see", async () => {
    mockSearchParams = new URLSearchParams("tab=recurring");

    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByText("Overview content")).toBeInTheDocument();
    expect(screen.queryByText("Recurring schedule card")).not.toBeInTheDocument();
  });

  it("keeps Activity away from a viewer who can't read it", async () => {
    mockUsePermissions.mockReturnValue({
      role: "user",
      canViewEmployeeDetails: true,
      canViewRecurringShifts: false,
      canManageEmployees: false,
      isSuperAdmin: false,
      isGridmaster: false,
      isLoading: false,
      orgId: "org-1",
    });
    mockSearchParams = new URLSearchParams("tab=activity");

    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByText("Overview content")).toBeInTheDocument();
    const tabs = within(screen.getByRole("group", { name: "Person sections" }));
    expect(tabs.queryByRole("button", { name: "Activity" })).not.toBeInTheDocument();
  });

  it("shows recurring schedules on the Recurring tab when permitted", async () => {
    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: true,
      canViewRecurringShifts: true,
      canManageEmployees: true,
      isSuperAdmin: false,
      isGridmaster: false,
      isLoading: false,
      orgId: "org-1",
    });
    mockSearchParams = new URLSearchParams("tab=recurring");

    render(<StaffDetailPage employeeId="emp-1" />);

    expect(await screen.findByText("Recurring schedule card")).toBeInTheDocument();
    expect(await screen.findByText("Shift preferences")).toBeInTheDocument();
    expect(await screen.findByText("Any shift")).toBeInTheDocument();
  });

  it("keeps the editor in a popup and the status and invitation on the page", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Edit details form")).not.toBeInTheDocument();
    // Once in the banner, once as the Record card's account state.
    expect(screen.getAllByText("Invitation pending")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change status" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit profile" })).not.toBeInTheDocument();
  });

  it("reissues a pending invitation in place instead of revoking it and inviting again", async () => {
    vi.mocked(resendInvitation).mockResolvedValue({
      expiresAt: "2099-01-04T00:00:00.000Z",
    });
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    fireEvent.click(screen.getByRole("button", { name: "Resend" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    await waitFor(() => {
      expect(resendInvitation).toHaveBeenCalledWith("invite-1", "org-1");
    });
    expect(revokeInvitation).not.toHaveBeenCalled();
    expect(screen.queryByText("Invite employee modal")).not.toBeInTheDocument();
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
    const dialog = await openDetailsEditor();
    expect(within(dialog).getByText("Edit details form")).toBeInTheDocument();
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

    mockSearchParams = new URLSearchParams("tab=access");
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");
    expect(screen.getByRole("button", { name: "Edit access" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change status" })).toBeInTheDocument();
    expect(screen.queryByText("Management access editor")).not.toBeInTheDocument();

    // Management settings always open in a popup, never inline in the card.
    fireEvent.click(screen.getByRole("button", { name: "Edit access" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Management access editor")).toBeInTheDocument();
  });

  it("keeps the details editor focused on biodata, without invite UI leaking in", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    expect(await screen.findByRole("link", { name: "Back to People" })).toHaveAttribute(
      "href",
      "/people",
    );
    const dialog = await openDetailsEditor();

    expect(within(dialog).getByText("Edit details form")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(lastEditEmployeePanelHideActions).toBe(true);
    expect(screen.queryByRole("button", { name: "Invite control" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pending invitation:/)).not.toBeInTheDocument();
  });

  // Access used to live only inside the management card, so a plain staff
  // member with a login had no access field on this page at all.
  it("shows the access control for a linked staff member who is not a management user", async () => {
    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: true,
      canViewRecurringShifts: false,
      canManageEmployees: true,
      isSuperAdmin: true,
      isGridmaster: false,
      isLoading: false,
      orgId: "org-1",
    });
    mockedFetchEmployeeById.mockResolvedValue({ ...mockEmployee, userId: "user-1" });
    mockedFetchEmployeeInvitations.mockResolvedValue([]);
    mockUseDirectory.mockReturnValue({
      directory: [
        makeDirectoryPerson({
          userId: "user-1",
          orgRole: "user",
          hasAppAccess: true,
          managementDepartmentIds: [],
          departmentIds: [],
          isManagementUser: false,
        }),
      ],
      loading: false,
      error: null,
    });

    mockSearchParams = new URLSearchParams("tab=access");
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    expect(
      screen.getByText("Organization role and the permissions it carries."),
    ).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    // Not a management user, so the management card stays away entirely.
    expect(screen.queryByText("Management departments")).not.toBeInTheDocument();
  });

  it("says someone has no app access, and offers an invite where they can be invited", async () => {
    mockSearchParams = new URLSearchParams("tab=access");
    mockedFetchEmployeeInvitations.mockResolvedValue([]);

    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    // Once as the header pill and once as the Access tab's empty state.
    expect(screen.getAllByText("No app access")).toHaveLength(2);
    expect(
      screen.getByText("They can't sign in until they accept an invitation."),
    ).toBeInTheDocument();
    // In the header and in the empty state.
    expect(screen.getAllByRole("button", { name: "Send invitation" })).toHaveLength(2);
  });

  it("leaves the role out of the management card, which now covers departments only", async () => {
    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: true,
      canViewRecurringShifts: false,
      canManageEmployees: true,
      isSuperAdmin: true,
      isGridmaster: false,
      isLoading: false,
      orgId: "org-1",
    });
    mockedFetchEmployeeById.mockResolvedValue({ ...mockEmployee, userId: "user-1" });
    mockedFetchEmployeeInvitations.mockResolvedValue([]);
    mockUseDirectory.mockReturnValue({
      directory: [
        makeDirectoryPerson({
          userId: "user-1",
          orgRole: "admin",
          hasAppAccess: true,
          managementDepartmentIds: [1],
          departmentIds: [1],
          isManagementUser: true,
        }),
      ],
      loading: false,
      error: null,
    });

    mockSearchParams = new URLSearchParams("tab=access");
    render(<StaffDetailPage employeeId="emp-1" />);
    await screen.findByText("Work details");

    expect(screen.getByText("Management departments")).toBeInTheDocument();
    // One Role label, in the Access card, not duplicated in the card below.
    expect(screen.getAllByText("Role")).toHaveLength(1);
  });

  it("shows a distinct toast when saving a changed email silently revokes the pending invitation", async () => {
    render(<StaffDetailPage employeeId="emp-1" />);
    await openDetailsEditor();

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
    await openDetailsEditor();

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
    await openDetailsEditor();

    expect(lastEditEmployeePanelPendingInvitation).toMatchObject({
      id: "invite-1",
      email: "margaret@example.com",
    });
    expect(lastEditEmployeePanelSaveWithReinvite).toBeTypeOf("function");
  });

  it("saving with the reinvite confirmation creates and sends a new invitation with the old one's role and departments", async () => {
    mockedCreateOrganizationInvitation.mockResolvedValue({
      invitationId: "invite-2",
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
    await openDetailsEditor();

    if (!lastEditEmployeePanelSaveWithReinvite) {
      throw new Error("Expected EditEmployeePanel to receive onSaveWithReinvite");
    }
    const oldInvitation = lastEditEmployeePanelPendingInvitation;
    await act(async () => {
      await lastEditEmployeePanelSaveWithReinvite!(
        { ...mockEmployee, email: "new.address@example.com" },
        oldInvitation,
        async (action: (accessToken: string) => Promise<unknown>) => {
          await action("step-up-token");
          return true;
        },
      );
    });

    expect(mockedUpdateEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new.address@example.com" }),
      "org-1",
      expect.anything(),
      expect.objectContaining({ askFocusAreaShifts: expect.any(Function) }),
    );
    expect(mockedCreateOrganizationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new.address@example.com",
        role: "user",
        employeeId: "emp-1",
        departmentIds: undefined,
      }),
      "step-up-token",
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
    expect(screen.queryByRole("button", { name: "Edit work details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit contact" })).not.toBeInTheDocument();
    expect(screen.getByText("Employment")).toBeInTheDocument();
  });

  it.each([
    ["Mark away", /^Away/, deactivateEmployee],
    ["Offboard", /^Offboarded/, removeEmployee],
  ] as const)(
    "%s asks a Gridmaster for fresh proof and retries with the assured token",
    async (confirmLabel, choice, statusCall) => {
      const refusal = Object.assign(new Error("Confirm your identity."), {
        status: 403,
        code: "STEP_UP_REQUIRED",
        method: "password",
      });
      vi.mocked(statusCall)
        .mockRejectedValueOnce(refusal)
        .mockResolvedValueOnce({ ...mockEmployee, status: "inactive", version: 2 });

      render(<StaffDetailPage employeeId="emp-1" />);
      fireEvent.click(await screen.findByRole("button", { name: "Change status" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: choice }));
      fireEvent.click(within(dialog).getByRole("button", { name: confirmLabel }));

      await waitFor(() => expect(statusCall).toHaveBeenCalledTimes(2));
      expect(stepUpPrompt).toHaveBeenCalledOnce();
      expect(vi.mocked(statusCall).mock.calls[0].at(-1)).toBeUndefined();
      expect(vi.mocked(statusCall).mock.calls[1].at(-1)).toBe("assured-token");
      expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    },
  );
});
