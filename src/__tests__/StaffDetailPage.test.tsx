import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StaffDetailPage } from "@/components/staff-detail/StaffDetailPage";

const mockReplace = vi.fn();
const mockToastInfo = vi.fn();
const mockUsePermissions = vi.fn();
const mockUseOrganizationData = vi.fn();

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
}));

vi.mock("@/lib/db", () => ({
  fetchEmployeeById: vi.fn(),
  fetchEmployeeShifts: vi.fn(),
  fetchRecurringShifts: vi.fn(),
  fetchEmployeeInvitations: vi.fn(),
  fetchEmployeeRoleHistory: vi.fn(),
  fetchShiftRequests: vi.fn(),
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
  StaffDetailHeader: () => <div>Header</div>,
}));

vi.mock("@/components/staff-detail/tabs/OverviewTab", () => ({
  OverviewTab: () => <div>Overview</div>,
}));

vi.mock("@/components/staff-detail/tabs/ScheduleTab", () => ({
  ScheduleTab: () => <div>Schedule</div>,
}));

vi.mock("@/components/staff-detail/tabs/ActivityTab", () => ({
  ActivityTab: () => <div>Activity</div>,
}));

describe("StaffDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOrganizationData.mockReturnValue({
      org: null,
      focusAreas: [],
      shiftCodes: [],
      absenceTypes: [],
      shiftCategories: [],
      certifications: [],
      orgRoles: [],
      shiftCodeMap: new Map(),
      absenceTypeMap: new Map(),
      loading: false,
    });
  });

  it("redirects to /people when employee detail access is denied", async () => {
    mockUsePermissions.mockReturnValue({
      canViewEmployeeDetails: false,
      canViewRecurringShifts: false,
      canManageEmployees: false,
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
});
