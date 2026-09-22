import type { ReactNode } from "react";
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
const queryClientCancel = vi.fn();
const replaceAuthSession = vi.fn();
const saveLastOrg = vi.fn();
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
const stackScreenOptions: StackScreenOptions[] = [];

type StackScreenOptions = {
  headerTitleStyle?: { color?: string; fontFamily?: string };
  title?: string;
  headerRight?: () => ReactNode;
};

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
    replace: routerReplace,
  },
  Stack: Object.assign(() => null, {
    // The bar's trailing slot rendered in place, so a test can press the
    // header's "Edit" the way it presses anything else on the page.
    Screen: (props: { options?: StackScreenOptions }) => {
      stackScreenOptions.push(props.options ?? {});
      return <div data-testid="navigation-bar">{props.options?.headerRight?.() ?? null}</div>;
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

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  replaceAuthSession,
}));

vi.mock("../../../shared/lib/session", () => ({
  loadStoredPushDevice,
  saveLastOrg,
}));

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: {
    cancelQueries: queryClientCancel,
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

async function chooseHiddenClinic() {
  fireEvent.click(screen.getByRole("button", { name: /^Switch organization/ }));
  fireEvent.click(screen.getByRole("button", { name: "Hidden Clinic" }));

  // The picker has to leave before iOS can present the confirmation.
  expect(screen.queryByRole("button", { name: "Hidden Clinic" })).not.toBeInTheDocument();
  const confirmation = await screen.findByRole("alert");
  return within(confirmation).getByRole("button", { name: "Switch" });
}

const singleOrgBootstrapData = {
  ...bootstrapData,
  memberships: [bootstrapData.memberships[0]],
};

function accessTokenForOrg(orgId: string, version: string) {
  const payload = btoa(
    JSON.stringify({ sub: "8af6f242-c060-4920-a7db-91b4cb66fd26", org_id: orgId }),
  );
  return `header.${payload}.${version}`;
}

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
    queryClientCancel.mockReset();
    queryClientCancel.mockResolvedValue(undefined);
    replaceAuthSession.mockReset();
    replaceAuthSession.mockReturnValue(true);
    saveLastOrg.mockReset();
    saveLastOrg.mockResolvedValue(undefined);

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

    // The native header has the person's real title from the start, but keeps
    // it invisible while the profile hero is at rest.
    expect(stackScreenOptions).toHaveLength(1);
    expect(stackScreenOptions[0]).toMatchObject({
      headerTitleStyle: { color: "transparent" },
      title: "Mina Diaz",
    });
    const scrollRoot = screen.getByTestId("screen-scroll");
    scrollRoot.dataset.scrollY = "24";
    fireEvent.scroll(scrollRoot);
    // Once the hero starts moving under the native bar, it identifies the
    // person rather than the tab.
    expect(stackScreenOptions.at(-1)).toMatchObject({
      headerTitleStyle: expect.objectContaining({ color: "#0F172A" }),
      title: "Mina Diaz",
    });
    expect(screen.getAllByText("Mina Diaz").length).toBeGreaterThan(0);
    expect(screen.getByText("MD")).toBeInTheDocument();
    // The tier is the insignia beside the name, no pill spelling it out.
    expect(screen.getByLabelText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
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

  it("submits one cancellation when Cancel request is pressed twice in the same tick", () => {
    const mutate = vi.fn();
    useMutation.mockReturnValue({ mutate, isPending: false, variables: undefined });
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
        return { data: profileData, error: null, isLoading: false, refetch: vi.fn() };
      }
      return { data: bootstrapData, error: null, isLoading: false, refetch: vi.fn() };
    });

    render(<ProfileScreen />);
    const cancel = screen.getByRole("button", { name: "Cancel request" });
    fireEvent.click(cancel);
    fireEvent.click(cancel);

    expect(mutate).toHaveBeenCalledTimes(1);
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

  // The same bar action the person page has. "Profile details" is this
  // profile's editor, so that is where Edit goes; the Settings row of the same
  // name stays as the list's way in.
  it("puts Edit in the navigation bar and opens Profile details from it", () => {
    render(<ProfileScreen />);

    const bar = within(screen.getByTestId("navigation-bar"));
    fireEvent.click(bar.getByRole("button", { name: "Edit" }));

    expect(routerPush).toHaveBeenCalledWith("/(tabs)/profile/work");
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
  });

  // The two actions that leave the organization are full buttons at the very
  // foot of the page, after every settings row: the switcher first, Sign Out
  // last. Nothing sits in a row under the avatar.
  it("ends the page with Switch organization and Sign Out as buttons", () => {
    render(<ProfileScreen />);

    expect(screen.queryByLabelText("Actions")).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    // By accessible name: a button's text content also holds FitText's
    // hidden measuring copy of the label.
    const switchIndex = buttons.findIndex(
      (b) => b.getAttribute("aria-label") === "Switch organization",
    );
    const signOutIndex = buttons.findIndex((b) => b.getAttribute("aria-label") === "Sign out");
    const appearanceIndex = buttons.findIndex((b) => b.textContent?.startsWith("Appearance"));
    expect(appearanceIndex).toBeGreaterThan(-1);
    expect(switchIndex).toBeGreaterThan(appearanceIndex);
    expect(signOutIndex).toBe(switchIndex + 1);
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  });

  it("opens organization switching in a modal from the button at the foot", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Sign out",
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
    const refreshedSession = {
      access_token: accessTokenForOrg("95d4c7f2-6b2e-4818-b47b-7d8f99879174", "v2"),
    };
    const refreshSession = vi.fn().mockResolvedValue({
      data: { session: refreshedSession },
      error: null,
    });
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession } } as never);

    render(<ProfileScreen />);

    fireEvent.click(await chooseHiddenClinic());

    expect(await screen.findByText("Switching to Hidden Clinic")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("switch_org", {
      target_org_id: "95d4c7f2-6b2e-4818-b47b-7d8f99879174",
    });

    resolveSwitch({ error: null });

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
    });
    expect(replaceAuthSession).toHaveBeenCalledWith(refreshedSession);
    expect(replaceAuthSession.mock.invocationCallOrder[0]).toBeLessThan(
      routerReplace.mock.invocationCallOrder[0],
    );
    // Cache teardown belongs to AuthSessionProvider's identity boundary, not
    // this screen, so an auth event racing the explicit commit cannot double it.
    expect(queryClientClear).not.toHaveBeenCalled();
    // Not latched: the Home screen owns the loading state from here, and a
    // leftover overlay would still be up if the user came back to this tab.
    expect(screen.queryByText("Switching to Hidden Clinic")).not.toBeInTheDocument();
  });

  it("coalesces concurrent organization-switch confirmations", async () => {
    let resolveSwitch: (result: { error: null }) => void = () => undefined;
    const rpc = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveSwitch = resolve;
      }),
    );
    const refreshSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: accessTokenForOrg("95d4c7f2-6b2e-4818-b47b-7d8f99879174", "v2"),
        },
      },
      error: null,
    });
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession } } as never);

    render(<ProfileScreen />);
    const confirm = await chooseHiddenClinic();
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await screen.findByText("Switching to Hidden Clinic");
    expect(rpc).toHaveBeenCalledTimes(1);

    resolveSwitch({ error: null });
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home"));
  });

  it("waits for a matching refreshed session before navigating", async () => {
    let resolveRefresh: (result: {
      data: { session: { access_token: string } };
      error: null;
    }) => void = () => undefined;
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const refreshSession = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession } } as never);

    render(<ProfileScreen />);
    fireEvent.click(await chooseHiddenClinic());

    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
    expect(replaceAuthSession).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();

    const refreshedSession = {
      access_token: accessTokenForOrg("95d4c7f2-6b2e-4818-b47b-7d8f99879174", "v2"),
    };
    resolveRefresh({ data: { session: refreshedSession }, error: null });

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home"));
    expect(replaceAuthSession).toHaveBeenCalledWith(refreshedSession);
  });

  it("fails closed when session refresh fails after the server switched organizations", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const refreshError = { message: "refresh failed" };
    const refreshSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: refreshError,
    });
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession } } as never);

    render(<ProfileScreen />);
    fireEvent.click(await chooseHiddenClinic());

    await waitFor(() => expect(handleExpiredMobileSession).toHaveBeenCalled());
    expect(queryClientCancel).toHaveBeenCalled();
    expect(queryClientClear).toHaveBeenCalled();
    expect(replaceAuthSession).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalledWith("/(tabs)/home");
  });

  it("fails closed when the refreshed session belongs to a different organization", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const refreshSession = vi.fn().mockResolvedValue({
      data: {
        session: { access_token: accessTokenForOrg("wrong-org", "v2") },
      },
      error: null,
    });
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession } } as never);

    render(<ProfileScreen />);
    fireEvent.click(await chooseHiddenClinic());

    await waitFor(() => expect(handleExpiredMobileSession).toHaveBeenCalled());
    expect(queryClientClear).toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalledWith("/(tabs)/home");
  });

  it("finishes a successful switch when remembering the organization fails", async () => {
    saveLastOrg.mockRejectedValue(new Error("SecureStore unavailable"));
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const refreshSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: accessTokenForOrg("95d4c7f2-6b2e-4818-b47b-7d8f99879174", "v2"),
        },
      },
      error: null,
    });
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession } } as never);

    render(<ProfileScreen />);
    fireEvent.click(await chooseHiddenClinic());

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home"));
    expect(saveLastOrg).toHaveBeenCalledWith({ slug: "hidden-clinic", name: "Hidden Clinic" });
    expect(handleExpiredMobileSession).not.toHaveBeenCalled();
  });

  it("takes the switching overlay back down when the switch fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "nope" } });
    getSupabaseClient.mockReturnValue({ rpc, auth: { refreshSession: vi.fn() } } as never);

    render(<ProfileScreen />);

    fireEvent.click(await chooseHiddenClinic());

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalled();
    });
    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("Switching to Hidden Clinic")).not.toBeInTheDocument();
  });
});
