import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPageContent from "./DashboardPageContent";
import { useEmployees, useOrganizationData, usePermissions } from "@/hooks";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@/components/RouteGuards", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/SetupGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ProgressBar", () => ({
  default: ({ loading }: { loading: boolean }) => (
    <div data-testid="progress" data-loading={String(loading)} />
  ),
}));

vi.mock("@/components/dashboard/DashboardView", () => ({
  default: () => <div data-testid="dashboard-view" />,
}));

vi.mock("@/components/gridmaster/GridmasterPortal", () => ({
  default: () => <div data-testid="gridmaster-portal" />,
}));

vi.mock("@/hooks", () => ({
  usePermissions: vi.fn(),
  useOrganizationData: vi.fn(),
  useEmployees: vi.fn(),
}));

const basePermissions = {
  orgId: "org-1",
  role: "user",
  isLoading: false,
  isGridmaster: false,
  isOnSchedule: true,
  isManagementUser: false,
};

const organizationData = {
  org: { id: "org-1", name: "Acme", timezone: "UTC" },
  focusAreas: [],
  assignments: [],
  shiftCategories: [],
  coverageRequirements: [],
  assignmentLabelMap: new Map(),
  absenceTypeMap: new Map(),
  absenceTypes: [],
  certifications: [],
  orgRoles: [],
  departments: [],
  loading: false,
  loadError: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePermissions).mockReturnValue({ ...basePermissions } as ReturnType<
    typeof usePermissions
  >);
  vi.mocked(useOrganizationData).mockReturnValue(
    organizationData as unknown as ReturnType<typeof useOrganizationData>,
  );
  vi.mocked(useEmployees).mockReturnValue({
    employees: [],
    loading: false,
  } as unknown as ReturnType<typeof useEmployees>);
});

describe("DashboardPageContent", () => {
  it("redirects a management-only non-admin user to /schedule", () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...basePermissions,
      isOnSchedule: false,
      isManagementUser: true,
    } as ReturnType<typeof usePermissions>);

    render(<DashboardPageContent />);

    expect(mockReplace).toHaveBeenCalledWith("/schedule");
    expect(screen.queryByTestId("dashboard-view")).not.toBeInTheDocument();
  });

  it("does not redirect a scheduled regular user", () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...basePermissions,
      isOnSchedule: true,
      isManagementUser: true,
    } as ReturnType<typeof usePermissions>);

    render(<DashboardPageContent />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId("dashboard-view")).toBeInTheDocument();
  });

  it("does not redirect a management-only admin", () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...basePermissions,
      role: "admin",
      isOnSchedule: false,
      isManagementUser: true,
    } as ReturnType<typeof usePermissions>);

    render(<DashboardPageContent />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId("dashboard-view")).toBeInTheDocument();
  });
});
