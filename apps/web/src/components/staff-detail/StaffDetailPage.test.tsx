import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffDetailPage } from "./StaffDetailPage";
import { useDirectory, useOrganizationData, usePermissions } from "@/hooks";
import {
  fetchEmployeeById,
  fetchEmployeeInvitations,
  fetchEmployeeShifts,
  updateEmployee,
} from "@/features/employees/client";
import { resendInvitation } from "@/features/organization/client";
import type { Employee } from "@/types";

const mockReplace = vi.fn();
const mockRouter = { replace: mockReplace, push: vi.fn(), back: vi.fn() };
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => searchParams,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-me" }, isLoading: false }),
}));

vi.mock("@/hooks", () => ({
  usePermissions: vi.fn(),
  useOrganizationData: vi.fn(),
  useDirectory: vi.fn(),
}));

vi.mock("@/features/employees/client", () => ({
  fetchEmployeeById: vi.fn(),
  fetchEmployeeShifts: vi.fn(),
  fetchEmployeeActivity: vi.fn(async () => []),
  fetchEmployeeInvitations: vi.fn(async () => []),
  activateEmployee: vi.fn(),
  deactivateEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  removeEmployee: vi.fn(),
  EmployeeAccessDeniedError: class extends Error {},
  EmployeeContactConflictError: class extends Error {},
  EmployeeProfileConflictError: class extends Error {},
  EmployeeStatusConflictError: class extends Error {},
}));

vi.mock("@/features/schedule/client", () => ({
  fetchRecurringShifts: vi.fn(async () => []),
}));

vi.mock("@/components/ProgressBar", () => ({
  default: ({ loading }: { loading: boolean }) => (
    <div data-testid="progress" data-loading={String(loading)} />
  ),
}));

vi.mock("@/components/settings/SettingsShell", () => ({
  SettingsShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="staff-detail-shell">{children}</div>
  ),
}));

vi.mock("./StaffDetailHeader", () => ({ StaffDetailHeader: () => <div /> }));
vi.mock("./EmployeeStatusActions", () => ({ EmployeeStatusActions: () => <div /> }));
vi.mock("./tabs/OverviewTab", () => ({ OverviewTab: () => <div data-testid="overview" /> }));
vi.mock("./tabs/ActivityTab", () => ({ ActivityTab: () => <div /> }));
vi.mock("./RecurringScheduleCard", () => ({ RecurringScheduleCard: () => <div /> }));
vi.mock("@/components/EditEmployeePanel", () => ({
  default: ({ employee, onSave }: { employee: Employee; onSave: (employee: Employee) => void }) => (
    <button type="button" onClick={() => onSave({ ...employee, firstName: "Augusta" })}>
      Save details
    </button>
  ),
}));
vi.mock("@/components/InviteEmployeeModal", () => ({ default: () => <div /> }));
vi.mock("@/components/staff/PendingInvitationBanner", () => ({
  PendingInvitationBanner: ({
    pendingInvitation,
    onReinvite,
    expired,
  }: {
    pendingInvitation: { id: string };
    onReinvite?: () => void;
    expired?: boolean;
  }) => (
    <div data-testid="invitation-banner" data-expired={String(Boolean(expired))}>
      {pendingInvitation.id}
      <button type="button" onClick={onReinvite}>
        Reinvite
      </button>
    </div>
  ),
}));
vi.mock("@/features/organization/client", () => ({
  createOrganizationInvitation: vi.fn(),
  replaceOrganizationInvitationAccessGuarded: vi.fn(),
  resendInvitation: vi.fn(async () => undefined),
  revokeInvitation: vi.fn(),
  updateOrganizationMembershipGuarded: vi.fn(),
}));
vi.mock("@/components/staff/EmployeeManagementAccessModal", () => ({
  EmployeeManagementAccessEditor: () => <div />,
}));
vi.mock("@/components/staff/MemberAccessControls", () => ({
  MemberAccessControls: () => <div />,
}));
vi.mock("@/components/staff/AddManagementUserToScheduleModal", () => ({
  AddManagementUserToScheduleModal: () => <div />,
}));

const permissions = {
  orgId: "org-1",
  role: "super_admin",
  isLoading: false,
  isGridmaster: false,
  isSuperAdmin: true,
  canViewEmployeeDetails: true,
  canViewRecurringShifts: false,
  canManageScheduleEmployees: true,
};

function organizationData() {
  return {
    org: { id: "org-1", name: "Acme", timezone: "UTC" },
    focusAreas: [],
    assignments: [],
    shiftCategories: [],
    certifications: [],
    orgRoles: [],
    departments: [],
    jobs: [],
    assignmentLabelMap: new Map(),
    absenceTypes: [],
    absenceTypeMap: new Map(),
    loading: false,
  };
}

const employee = {
  id: "emp-2",
  orgId: "org-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "",
  status: "active",
  focusAreaIds: [1],
  roleIds: [],
  departmentIds: [],
  deptAdminIds: [],
  certificationId: null,
  userId: "user-other",
  version: 1,
  createdAt: "2026-01-09T12:00:00.000Z",
  joinedAt: "2026-02-03T12:00:00.000Z",
  statusChangedAt: null,
  statusNote: "",
};

const JOINED_DAY = new Date(employee.joinedAt).toLocaleDateString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function renderPage(employeeId = "emp-2") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StaffDetailPage employeeId={employeeId} />
    </QueryClientProvider>,
  );
}

describe("StaffDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue(permissions as never);
    vi.mocked(useOrganizationData).mockReturnValue(organizationData() as never);
    vi.mocked(useDirectory).mockReturnValue({
      directory: [],
      refresh: vi.fn(),
    } as never);
    vi.mocked(fetchEmployeeById).mockResolvedValue(employee as never);
    vi.mocked(fetchEmployeeShifts).mockResolvedValue({} as never);
  });

  it("renders another person's profile after one load", async () => {
    renderPage();
    expect(await screen.findByTestId("staff-detail-shell")).toBeInTheDocument();
    expect(fetchEmployeeById).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends the viewer's own record to /profile instead of rendering it", async () => {
    vi.mocked(fetchEmployeeById).mockResolvedValue({ ...employee, userId: "user-me" } as never);
    renderPage();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/profile"));
    expect(screen.queryByTestId("staff-detail-shell")).not.toBeInTheDocument();
  });

  it("keeps the rendered profile when the org label maps are rebuilt", async () => {
    const { rerender } = renderPage();
    await screen.findByTestId("staff-detail-shell");

    vi.mocked(useOrganizationData).mockReturnValue(organizationData() as never);
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <StaffDetailPage employeeId="emp-2" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("staff-detail-shell")).toBeInTheDocument();
    expect(fetchEmployeeById).toHaveBeenCalledTimes(1);
  });

  it("shows the record card on the Profile section, joined date included", async () => {
    renderPage();

    expect(await screen.findByText("Record")).toBeInTheDocument();
    expect(screen.getByText("Date joined").nextElementSibling).toHaveTextContent(JOINED_DAY);
    expect(screen.getByText("Account").nextElementSibling).toHaveTextContent("Linked account");
  });

  it("keeps the joined date on screen after a save whose response carries none", async () => {
    const { joinedAt: _omitted, ...savedWithoutJoinedDate } = employee;
    vi.mocked(updateEmployee).mockResolvedValue({
      ...savedWithoutJoinedDate,
      firstName: "Augusta",
      version: 2,
    } as never);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Save details" }));

    await waitFor(() => expect(updateEmployee).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("Date joined").nextElementSibling).toHaveTextContent(JOINED_DAY),
    );
  });

  describe("invitations", () => {
    const HOUR = 3_600_000;
    const unlinked = { ...employee, userId: null, joinedAt: null };

    function invitationFor(overrides: Record<string, unknown>) {
      return {
        id: "inv-1",
        orgId: "org-1",
        invitedBy: null,
        email: "ada@example.com",
        roleToAssign: "user",
        acceptedAt: null,
        revokedAt: null,
        createdAt: new Date(Date.now() - 96 * HOUR).toISOString(),
        expiresAt: new Date(Date.now() + 24 * HOUR).toISOString(),
        updatedAt: null,
        employeeId: "emp-2",
        ...overrides,
      };
    }

    beforeEach(() => {
      vi.mocked(usePermissions).mockReturnValue({
        ...permissions,
        canManageEmployees: true,
      } as never);
      vi.mocked(fetchEmployeeById).mockResolvedValue(unlinked as never);
    });

    it("offers Reinvite on an expired invitation and no second invitation", async () => {
      vi.mocked(fetchEmployeeInvitations).mockResolvedValue([
        invitationFor({ id: "inv-expired", expiresAt: new Date(Date.now() - HOUR).toISOString() }),
      ] as never);
      renderPage();

      const banner = await screen.findByTestId("invitation-banner");
      expect(banner).toHaveAttribute("data-expired", "true");
      expect(screen.getByText("Account").nextElementSibling).toHaveTextContent(
        "Invitation expired",
      );
      expect(screen.queryByRole("button", { name: "Send invitation" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Reinvite" }));
      await waitFor(() => expect(resendInvitation).toHaveBeenCalledWith("inv-expired", "org-1"));
    });

    it("shows a live invitation as pending", async () => {
      vi.mocked(fetchEmployeeInvitations).mockResolvedValue([invitationFor({})] as never);
      renderPage();

      const banner = await screen.findByTestId("invitation-banner");
      expect(banner).toHaveAttribute("data-expired", "false");
      expect(screen.getByText("Account").nextElementSibling).toHaveTextContent(
        "Invitation pending",
      );
    });

    it("offers Send invitation when there is no open invitation", async () => {
      vi.mocked(fetchEmployeeInvitations).mockResolvedValue([] as never);
      renderPage();

      expect(await screen.findByRole("button", { name: "Send invitation" })).toBeInTheDocument();
      expect(screen.queryByTestId("invitation-banner")).not.toBeInTheDocument();
    });
  });

  describe("management departments", () => {
    const managementPerson = {
      personId: "person-2",
      employeeId: "emp-2",
      userId: "user-other",
      orgRole: "admin",
      isManagementUser: true,
      managementDepartmentIds: [7],
      invitationStatus: null,
      lastSignInAt: null,
    };

    function renderWith(overrides: Record<string, unknown>) {
      vi.mocked(usePermissions).mockReturnValue({ ...permissions, ...overrides } as never);
      vi.mocked(useOrganizationData).mockReturnValue({
        ...organizationData(),
        departments: [{ id: 7, name: "Nursing Office", type: "management" }],
      } as never);
      vi.mocked(useDirectory).mockReturnValue({
        directory: [managementPerson],
        refresh: vi.fn(),
      } as never);
      renderPage();
    }

    it("shows a staff-managing Admin the departments, read-only", async () => {
      renderWith({ role: "admin", isSuperAdmin: false, canManageEmployees: true });

      expect(await screen.findByText("Management departments")).toBeInTheDocument();
      expect(screen.getByText("Nursing Office")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit access" })).not.toBeInTheDocument();
    });

    it("lets a Super Admin edit them", async () => {
      renderWith({});

      expect(await screen.findByText("Management departments")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit access" })).toBeInTheDocument();
    });

    it("hides them from a caller who does not manage employees", async () => {
      renderWith({ role: "admin", isSuperAdmin: false, canManageEmployees: false });

      await screen.findByText("Record");
      expect(screen.queryByText("Management departments")).not.toBeInTheDocument();
    });
  });
});
