import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

const routerPush = vi.fn();
const routerReplace = vi.fn();
const queryClientClear = vi.fn();
const useQuery = vi.fn();
const useMutation = vi.fn();
const useAccessToken = vi.fn();
const getSupabaseClient = vi.fn();
const registerPushToken = vi.fn();
const loadStoredPushDevice = vi.fn();
const handleExpiredMobileSession = vi.fn();
const disablePushForCurrentDevice = vi.fn();
const pushToast = vi.fn();
// Every options object the screen hands the native header, in render order.
const stackScreenOptions: { title?: string }[] = [];

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
    replace: routerReplace,
  },
  Stack: Object.assign(() => null, {
    Screen: (props: { options?: { title?: string } }) => {
      stackScreenOptions.push(props.options ?? {});
      return null;
    },
  }),
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
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
}));

vi.mock("../../../shared/lib/session", () => ({
  loadStoredPushDevice,
  saveLastOrg: vi.fn(),
}));

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: {
    clear: queryClientClear,
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
      departmentId: 7,
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
  departments: [
    { id: 7, name: "Nursing", abbr: "NUR", type: "scheduled" },
    { id: 10, name: "Clinical Leadership", abbr: "CL", type: "management" },
    { id: 11, name: "Operations", abbr: "OPS", type: "management" },
  ],
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
    stackScreenOptions.length = 0;
    useQuery.mockReset();
    useMutation.mockReset();
    useAccessToken.mockReset();
    getSupabaseClient.mockReset();
    registerPushToken.mockReset();
    loadStoredPushDevice.mockReset();
    handleExpiredMobileSession.mockReset();
    disablePushForCurrentDevice.mockReset();
    disablePushForCurrentDevice.mockResolvedValue(undefined);
    pushToast.mockReset();
    routerPush.mockReset();
    routerReplace.mockReset();
    queryClientClear.mockReset();

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

  function mockQueries(profile: Record<string, unknown>) {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey.join(":");
      if (key.includes("change-requests")) {
        return { data: { requests: [] }, error: null, isLoading: false, refetch: vi.fn() };
      }
      if (key.includes("profile")) {
        return { data: profile, error: null, isLoading: false, refetch: vi.fn() };
      }

      return { data: bootstrapData, error: null, isLoading: false, refetch: vi.fn() };
    });
  }

  // Nothing on the hub said you were a management user: the role badge names
  // the tier, which plenty of staff hold without managing anything.
  it("names the departments you manage when you are a management user", () => {
    mockQueries({ ...profileData, managementDepartmentIds: [10, 11] });

    render(<ProfileScreen />);

    // "Departments", not "Management access": the section holds both kinds.
    expect(screen.getByText("Departments")).toBeInTheDocument();
    // A fixed label, never composed from the org's own department noun — an
    // org that calls its scheduled kind "Scheduled Departments" was getting
    // "Management Scheduled Departments" here.
    expect(screen.getByText("Management Departments")).toBeInTheDocument();
    expect(screen.getByText("Clinical Leadership, Operations")).toBeInTheDocument();
    // A row each: where you are scheduled and what you manage are different
    // facts, and the same person commonly has both.
    expect(screen.getByText("Department")).toBeInTheDocument();
    expect(screen.getByText("Nursing")).toBeInTheDocument();
  });

  // A management-only account has no focus areas, so pairing the row it does
  // have with an empty "Department" would be stating a non-fact.
  it("leaves the scheduled row off for a management-only account", () => {
    mockQueries({
      ...profileData,
      linkedEmployee: { ...profileData.linkedEmployee, focusAreaIds: [] },
      managementDepartmentIds: [10],
    });

    render(<ProfileScreen />);

    expect(screen.getByText("Management Departments")).toBeInTheDocument();
    // The org's own label for the scheduled kind — this fixture's is
    // "Department", singular — never appears as a row of its own.
    expect(screen.queryByText("Department")).not.toBeInTheDocument();
  });

  it("leaves the management section off for someone who manages nothing", () => {
    mockQueries({ ...profileData, managementDepartmentIds: [] });

    render(<ProfileScreen />);

    expect(screen.queryByText("Management access")).not.toBeInTheDocument();
  });

  it("shows organization-scoped data on the profile hub", () => {
    render(<ProfileScreen />);

    // The large title names the page — "Profile", from the route — so the
    // screen tells the header nothing, and the hero is free to carry the
    // account's own identity: avatar, then name, then role badge.
    expect(stackScreenOptions).toEqual([]);
    expect(screen.getAllByText("Mina Diaz").length).toBeGreaterThan(0);
    expect(screen.getByText("MD")).toBeInTheDocument();
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DubGrid Health").length).toBeGreaterThan(0);
    // One quiet line under the identity, and the only thing left of a hero meta
    // grid that also carried the organization and the phone number. The phone
    // belongs to "Profile details", which prints it in full.
    // Matched loosely on purpose: `toLocaleDateString` formats in the runner's
    // zone, so pinning the rendered day makes this fail wherever CI is not.
    expect(screen.getByText(/^Joined \w+ \d+, \d{4}$/)).toBeInTheDocument();
    expect(screen.queryByText("(415) 425-3334")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden Clinic")).not.toBeInTheDocument();
    // Regex: the row carries the current organization as its trailing value.
    expect(screen.getByRole("button", { name: /^Switch organization/ })).toBeInTheDocument();
    expect(screen.queryByText("Current organization only")).not.toBeInTheDocument();

    // The organization section is organization-only, and names the slug as the
    // subdomain. It holds the organization's name again now that the hero has
    // no meta grid to carry it — otherwise the hub would name the organization
    // nowhere for anyone without a second one to switch to.
    expect(screen.getByText("Subdomain")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    // Exactly once, as the section heading. The word used to appear three
    // times: a hero meta label, this heading, and an info row beneath it.
    expect(screen.getAllByText("Organization")).toHaveLength(1);
    expect(screen.queryByText("Role")).not.toBeInTheDocument();

    // The staff record belongs to "Profile details", which has its own "Staff
    // profile" section for exactly this. The hub says where you are and where
    // to go; it doesn't hold the detail too.
    expect(screen.queryByText("Staff status")).not.toBeInTheDocument();
    expect(screen.queryByText("ICU")).not.toBeInTheDocument();
  });

  it("hides organization switching when the user belongs to one organization", () => {
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
        data: singleOrgBootstrapData,
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<ProfileScreen />);

    expect(screen.queryByRole("button", { name: /^Switch organization/ })).not.toBeInTheDocument();
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

  it("opens organization switching in a modal from the settings row", () => {
    render(<ProfileScreen />);

    fireEvent.click(screen.getByRole("button", { name: /^Switch organization/ }));

    expect(screen.getByText("Hidden Clinic")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalledWith("/(tabs)/profile/switch-organization");
  });

  it("marks the current organization without offering it as a choice", () => {
    render(<ProfileScreen />);

    fireEvent.click(screen.getByRole("button", { name: /^Switch organization/ }));

    // The current org is a status, not an option: no pressable row, so it can't
    // raise a confirmation for a switch to where you already are.
    expect(screen.queryByRole("button", { name: "DubGrid Health" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("DubGrid Health, current organization")).toBeInTheDocument();

    // The other org is the only thing that can be chosen.
    expect(screen.getByRole("button", { name: "Hidden Clinic" })).toBeInTheDocument();

    // Selection is carried by the tinted row, the brand icon tile and the
    // checkmark — not by a word, and not by telling every other row it is
    // tappable.
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
    expect(screen.queryByText("Tap to switch")).not.toBeInTheDocument();

    // Roles read as labels, and the separator can't be mistaken for part of a
    // hyphenated slug.
    expect(screen.getByText("dubgrid-health · Admin")).toBeInTheDocument();
    expect(screen.queryByText(/dubgrid-health - admin/)).not.toBeInTheDocument();
  });

  it("resets the mobile session after a successful sign-out", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    getSupabaseClient.mockReturnValue({ auth: { signOut } } as never);
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

    // The push token has to be revoked while the session is still valid,
    // otherwise the device keeps receiving this user's notifications.
    expect(disablePushForCurrentDevice).toHaveBeenCalled();
    expect(disablePushForCurrentDevice.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it("covers the screen for the whole organization switch, then hands off to Home", async () => {
    // Held open so the assertions below land mid-switch: the picker and the
    // confirmation are both closed by then, so this overlay is the only thing
    // telling the user anything is happening.
    let resolveSwitch: (result: { error: null }) => void = () => undefined;
    const rpc = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveSwitch = resolve;
      }),
    );
    const refreshSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "token-456" } },
      error: null,
    });
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession } } as never);

    render(<ProfileScreen />);

    fireEvent.click(screen.getByRole("button", { name: /^Switch organization/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hidden Clinic" }));
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Switch" }));

    expect(await screen.findByText("Switching to Hidden Clinic")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("switch_org", {
      target_org_id: "95d4c7f2-6b2e-4818-b47b-7d8f99879174",
    });

    resolveSwitch({ error: null });

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
    });
    expect(queryClientClear).toHaveBeenCalled();
    // Not latched: the Home screen owns the loading state from here, and a
    // leftover overlay would still be up if the user came back to this tab.
    expect(screen.queryByText("Switching to Hidden Clinic")).not.toBeInTheDocument();
  });

  it("takes the switching overlay back down when the switch fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "nope" } });
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession: vi.fn() } } as never);

    render(<ProfileScreen />);

    fireEvent.click(screen.getByRole("button", { name: /^Switch organization/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hidden Clinic" }));
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Switch" }));

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalled();
    });
    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("Switching to Hidden Clinic")).not.toBeInTheDocument();
  });
});
