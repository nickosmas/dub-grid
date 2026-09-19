import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffDetailPage } from "./StaffDetailPage";
import { useDirectory, useOrganizationData, usePermissions } from "@/hooks";
import { fetchEmployeeById, fetchEmployeeShifts } from "@/features/employees/client";

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
vi.mock("@/components/EditEmployeePanel", () => ({ default: () => <div /> }));
vi.mock("@/components/InviteEmployeeModal", () => ({ default: () => <div /> }));
vi.mock("@/components/staff/PendingInvitationBanner", () => ({
  PendingInvitationBanner: () => <div />,
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
};

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
});
