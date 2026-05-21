import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReactNativeModule,
  createScreenModule,
} from "../../../test/native";

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () =>
  createScreenModule(await import("react")),
);

const routerPush = vi.fn();
const useQuery = vi.fn();
const useMutation = vi.fn();
const useAccessToken = vi.fn();
const getSupabaseClient = vi.fn();
const registerPushToken = vi.fn();
const loadStoredPushDevice = vi.fn();
const handleExpiredMobileSession = vi.fn();
const pushToast = vi.fn();

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useQuery,
    useMutation,
  };
});

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient,
}));

vi.mock("../../../shared/lib/api", () => ({
  getBootstrap: vi.fn(),
  getProfile: vi.fn(),
  getProfileChangeRequests: vi.fn(),
  updateProfileChangeRequest: vi.fn(),
  registerPushToken,
}));

vi.mock("../../../shared/lib/auth-reset", () => ({
  handleExpiredMobileSession,
}));

vi.mock("../../../shared/lib/session", () => ({
  loadStoredPushDevice,
  saveLastOrgSlug: vi.fn(),
}));

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

const profileData = {
  user: {
    id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
    firstName: "Mina",
    lastName: "Diaz",
    email: "mina@dubgrid.com",
    createdAt: "2024-01-01T00:00:00.000Z",
    lastSignInAt: "2024-01-02T00:00:00.000Z",
    mfaEnabled: false,
  },
  currentOrg: {
    id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
    name: "DubGrid Health",
    slug: "dubgrid-health",
    timezone: "America/Los_Angeles",
    shiftDisplayMode: "code",
    labels: {
      focusArea: "Focus Area",
      certification: "Certification",
      role: "Role",
      department: "Department",
    },
    featureFlags: {},
  },
  currentMembership: {
    id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
    name: "DubGrid Health",
    slug: "dubgrid-health",
    orgRole: "admin",
    platformRole: "none",
    isCurrent: true,
  },
  effectiveRole: "admin",
  linkedEmployee: {
    id: "d660d308-4e0d-4daf-84fd-6753405e6740",
    firstName: "Mina",
    lastName: "Diaz",
    phone: "(415) 425-3334",
    status: "active",
    focusAreaIds: [2],
  },
  focusAreas: [
    {
      id: 2,
      name: "ICU",
    },
  ],
  pendingProfileChangeRequest: false,
  pendingAccountDeletionRequest: false,
};

const bootstrapData = {
  ...profileData,
  memberships: [
    {
      id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      name: "DubGrid Health",
      slug: "dubgrid-health",
      orgRole: "admin",
      platformRole: "none",
      isCurrent: true,
    },
    {
      id: "95d4c7f2-6b2e-4818-b47b-7d8f99879174",
      name: "Hidden Clinic",
      slug: "hidden-clinic",
      orgRole: "user",
      platformRole: "none",
      isCurrent: false,
    },
  ],
  permissions: {
    canViewSchedule: true,
    canEditShifts: false,
    canPublishSchedule: false,
    canApplyRecurringSchedule: false,
    canEditNotes: false,
    canEditScheduleIndicators: false,
    canViewRecurringShifts: false,
    canManageRecurringShifts: false,
    canManageShiftSeries: false,
    canViewStaff: true,
    canViewEmployeeDetails: false,
    canManageEmployees: false,
    canViewFocusAreas: false,
    canManageFocusAreas: false,
    canViewScheduleDefinitions: false,
    canManageScheduleDefinitions: false,
    canViewIndicatorTypes: false,
    canManageIndicatorTypes: false,
    canViewOrgLabels: false,
    canManageOrgLabels: false,
    canViewCoverageRequirements: false,
    canManageCoverageRequirements: false,
    canApproveShiftRequests: true,
    canViewDashboardAnalytics: false,
  },
  absenceTypes: [],
  unreadNotificationCount: 0,
};

const singleOrgBootstrapData = {
  ...bootstrapData,
  memberships: [bootstrapData.memberships[0]],
};

let ProfileScreen: (typeof import("./ProfileScreen"))["default"];

beforeAll(async () => {
  ProfileScreen = (await import("./ProfileScreen")).default;
});

describe("ProfileScreen", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useMutation.mockReset();
    useAccessToken.mockReset();
    getSupabaseClient.mockReset();
    registerPushToken.mockReset();
    loadStoredPushDevice.mockReset();
    handleExpiredMobileSession.mockReset();
    pushToast.mockReset();
    routerPush.mockReset();

    useAccessToken.mockReturnValue("token-123");
    loadStoredPushDevice.mockResolvedValue(null);
    useMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    });
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey.join(":");
      if (key.includes("change-requests")) {
        return {
          data: { requests: [] },
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }
      if (key.includes("profile")) {
        return {
          data: profileData,
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: bootstrapData,
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
  });

  it("shows organization-scoped data on the profile hub", () => {
    render(<ProfileScreen />);

    expect(screen.getAllByText("Mina Diaz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DubGrid Health").length).toBeGreaterThan(0);
    expect(screen.getByText("(415) 425-3334")).toBeInTheDocument();
    expect(screen.getByText("ICU")).toBeInTheDocument();
    expect(screen.getByText("Staff status")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Clinic")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch organization" })).toBeInTheDocument();
    expect(screen.queryByText("Current organization only")).not.toBeInTheDocument();
  });

  it("hides organization switching when the user belongs to one organization", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey.join(":");
      if (key.includes("profile")) {
        return {
          data: profileData,
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: singleOrgBootstrapData,
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<ProfileScreen />);

    expect(
      screen.queryByRole("button", { name: "Switch organization" }),
    ).not.toBeInTheDocument();
  });

  it("shows pending profile change request review state", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey.join(":");
      if (key.includes("change-requests")) {
        return {
          data: {
            requests: [
              {
                id: "11111111-1111-1111-1111-111111111111",
                type: "profile_update",
                status: "pending",
                createdAt: "2024-02-01T15:30:00.000Z",
              },
            ],
          },
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }
      if (key.includes("profile")) {
        return {
          data: profileData,
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: bootstrapData,
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<ProfileScreen />);

    expect(screen.getByText("1 pending request")).toBeInTheDocument();
    expect(screen.getByText("Name change")).toBeInTheDocument();
  });

  it("shows pending account deletion request review state", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey.join(":");
      if (key.includes("change-requests")) {
        return {
          data: {
            requests: [
              {
                id: "22222222-2222-2222-2222-222222222222",
                type: "account_deletion",
                status: "pending",
                createdAt: "2024-02-01T15:30:00.000Z",
              },
            ],
          },
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }
      if (key.includes("profile")) {
        return {
          data: profileData,
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: bootstrapData,
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<ProfileScreen />);

    expect(screen.getByText("1 pending request")).toBeInTheDocument();
    expect(screen.getByText("Account deletion")).toBeInTheDocument();
  });

  it("opens detail screens from tappable rows", () => {
    render(<ProfileScreen />);

    fireEvent.click(screen.getByText("Profile details"));
    fireEvent.click(screen.getByText("Security & sessions"));

    expect(routerPush).toHaveBeenCalledWith("/(tabs)/profile/work");
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/profile/security");
    expect(routerPush).not.toHaveBeenCalledWith("/(tabs)/profile/account");
    expect(routerPush).not.toHaveBeenCalledWith("/(tabs)/home");
    expect(routerPush).not.toHaveBeenCalledWith("/(tabs)/requests");
    expect(routerPush).not.toHaveBeenCalledWith("/(tabs)/profile/notifications");
  });

  it("opens organization switching in a modal from the bottom button", () => {
    render(<ProfileScreen />);

    fireEvent.click(
      screen.getByRole("button", { name: "Switch organization" }),
    );

    expect(screen.getByText("Hidden Clinic")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalledWith(
      "/(tabs)/profile/switch-organization",
    );
  });

  it("resets the mobile session after a successful sign-out", async () => {
    getSupabaseClient.mockReturnValue({
      auth: {
        signOut: vi.fn().mockResolvedValue({
          error: null,
        }),
      },
    } as never);
    handleExpiredMobileSession.mockResolvedValue(undefined);

    render(<ProfileScreen />);

    fireEvent.click(screen.getByText("Sign Out"));
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Sign Out",
      }),
    );

    await waitFor(() => {
      expect(handleExpiredMobileSession).toHaveBeenCalledWith({
        skipSignOut: true,
      });
    });
  });
});
