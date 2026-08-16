import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../test/native";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const usePushRegistration = vi.fn();
const triggerIconMock = vi.fn();
const stackScreenMock = vi.fn();
const handleExpiredMobileSession = vi.fn();

// The shared emulation rather than a three-export hand-roll: the tab layout
// pulls in Button, which pulls in Reanimated, which needs most of the module.
vi.mock("react-native", async () =>
  createReactNativeModule(await import("react"), { platformOS: "ios" }),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: {
    getImageSource: vi.fn(),
  },
}));

vi.mock("expo-router", async () => {
  const React = await import("react");
  const Stack = Object.assign(
    ({ children }: { children: React.ReactNode }) => React.createElement("div", {}, children),
    {
      Screen: (props: Record<string, unknown>) => {
        stackScreenMock(props);
        return React.createElement("div");
      },
    },
  );

  return {
    Redirect: ({ href }: { href: string }) => React.createElement("div", {}, `redirect:${href}`),
    Stack,
  };
});

vi.mock("expo-router/unstable-native-tabs", async () => {
  const React = await import("react");

  const NativeTabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);

  const Trigger = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);

  NativeTabs.Trigger = Trigger;

  const Label = ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", {}, children);

  const Icon = (props: Record<string, unknown>) => {
    triggerIconMock(props);
    return React.createElement("div");
  };

  const VectorIcon = (props: Record<string, unknown>) => React.createElement("div", props);

  return { Icon, Label, NativeTabs, VectorIcon };
});

vi.mock("../shared/components/AppSplashScreen", async () => {
  const React = await import("react");

  return {
    AppSplashScreen: () => React.createElement("div", {}, "app-splash-screen"),
  };
});

vi.mock("../features/auth/screens/OrganizationLockedScreen", async () => {
  const React = await import("react");

  return {
    OrganizationLockedScreen: ({
      message,
      onRetry,
      onSignOut,
    }: {
      message: string;
      onRetry: () => void;
      onSignOut: () => void;
    }) =>
      React.createElement(
        "section",
        {},
        React.createElement("h1", {}, "Organization unavailable"),
        React.createElement("p", {}, message),
        React.createElement("button", { type: "button", onClick: onRetry }, "Try again"),
        React.createElement("button", { type: "button", onClick: onSignOut }, "Sign out"),
      ),
  };
});

vi.mock("../shared/navigation/AlertsHeaderButton", async () => {
  const React = await import("react");

  return {
    AlertsHeaderButton: () => React.createElement("button", {}, "Open alerts"),
  };
});

vi.mock("../features/auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../features/notifications/hooks/usePushRegistration", () => ({
  usePushRegistration,
}));

vi.mock("../features/notifications/hooks/usePushResponseHandler", () => ({
  usePushResponseHandler: vi.fn(),
}));

vi.mock("../shared/lib/auth-reset", () => ({
  handleExpiredMobileSession,
}));

vi.mock("../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

let TabsLayout: (typeof import("../../app/(tabs)/_layout"))["default"];
let RequestsLayout: (typeof import("../../app/(tabs)/requests/_layout"))["default"];
let PeopleLayout: (typeof import("../../app/(tabs)/people/_layout"))["default"];
let ProfileLayout: (typeof import("../../app/(tabs)/profile/_layout"))["default"];

beforeAll(async () => {
  TabsLayout = (await import("../../app/(tabs)/_layout")).default;
  RequestsLayout = (await import("../../app/(tabs)/requests/_layout")).default;
  PeopleLayout = (await import("../../app/(tabs)/people/_layout")).default;
  ProfileLayout = (await import("../../app/(tabs)/profile/_layout")).default;
});

describe("TabsLayout", () => {
  beforeEach(() => {
    triggerIconMock.mockReset();
    stackScreenMock.mockReset();
    handleExpiredMobileSession.mockReset();
    usePushRegistration.mockReset();
    useSessionState.mockReturnValue({
      accessToken: "token-123",
      isLoading: false,
    });
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { id: "org-123" },
        effectiveRole: "admin",
        permissions: {
          canViewSchedule: true,
          canEditShifts: false,
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
      },
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  // StartupSplashGate, above the router, owns the app's one splash and is still
  // covering the screen whenever this is reached on a cold launch. Rendering a
  // second instance here restarted the brand animation mid-handoff, which is
  // what read as the splash showing twice.
  it("renders nothing rather than a second splash while the session is restoring", () => {
    useSessionState.mockReturnValue({ accessToken: undefined, isLoading: true });

    const { container } = render(<TabsLayout />);

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  // Holding here is what keeps the Home tab from picking a screen (and a
  // skeleton shape) before it knows whether this is an admin. Every
  // `canView*` permission is also false until bootstrap lands, so releasing
  // early made the tab bar itself pop tabs in afterwards.
  it("keeps blocking until bootstrap resolves, not just the session", () => {
    useBootstrap.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    });

    const { container } = render(<TabsLayout />);

    expect(container).toBeEmptyDOMElement();
    expect(stackScreenMock).not.toHaveBeenCalled();
  });

  it("uses SF symbols on iOS and Android vector icon sources for the native tabs", () => {
    render(<TabsLayout />);

    expect(triggerIconMock).toHaveBeenCalledTimes(5);

    const [homeProps, ...restProps] = triggerIconMock.mock.calls.map(([props]) => props);

    expect(homeProps).toMatchObject({ src: expect.any(Object) });
    expect(homeProps).not.toHaveProperty("sf");
    expect(homeProps).not.toHaveProperty("androidSrc");

    for (const props of restProps) {
      expect(props).toMatchObject({
        androidSrc: expect.any(Object),
        sf: expect.any(Object),
      });
      expect(props).not.toHaveProperty("src");
    }
  });

  // The large-title screens carry no header background at all: an explicit one
  // makes an iOS 26 large title invisible, and painting it via
  // `headerBackground` makes the header translucent and stops it collapsing.
  // The page's own `background` shows through instead. Detail screens keep the
  // plain opaque header — they have no large title to lose.
  it("uses native stack headers for request, people, and profile tab pages", () => {
    render(<RequestsLayout />);
    render(<PeopleLayout />);
    render(<ProfileLayout />);

    expect(stackScreenMock).toHaveBeenCalledTimes(11);
    const requestsOptions = stackScreenMock.mock.calls[0]?.[0].options;
    const peopleOptions = stackScreenMock.mock.calls[1]?.[0].options;
    const profileOptions = stackScreenMock.mock.calls[5]?.[0].options;

    expect(stackScreenMock.mock.calls[0]?.[0]).toMatchObject({
      name: "index",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        // No background of any kind: an explicit one makes an iOS 26 large
        // title invisible, and `headerBackground` costs it the collapse.
        headerStyle: undefined,
        title: "Requests",
      },
    });
    expect(requestsOptions).not.toHaveProperty("headerLargeStyle");
    expect(stackScreenMock.mock.calls[1]?.[0]).toMatchObject({
      name: "index",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        // No background of any kind: an explicit one makes an iOS 26 large
        // title invisible, and `headerBackground` costs it the collapse.
        headerStyle: undefined,
        title: "People",
      },
    });
    expect(peopleOptions).not.toHaveProperty("headerLargeStyle");
    // The People and Profile sections take large titles at every level, so
    // their pushed screens opt in too, and follow the same no-background rule.
    expect(stackScreenMock.mock.calls[2]?.[0]).toMatchObject({
      name: "add",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        headerStyle: undefined,
        title: "Add Person",
      },
    });
    const peopleDetailOptions = stackScreenMock.mock.calls[3]?.[0].options;
    expect(stackScreenMock.mock.calls[3]?.[0]).toMatchObject({
      name: "[id]",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        headerStyle: undefined,
        // Never transparent: that is what costs a large title its collapse.
        title: "Person",
      },
    });
    expect(peopleDetailOptions).not.toHaveProperty("headerLargeStyle");
    expect(peopleDetailOptions).not.toHaveProperty("headerTransparent");
    // Registered under its static `management/` segment so it never competes
    // with `[id]` for a match, and takes the same large title as the rest of
    // the section.
    expect(stackScreenMock.mock.calls[4]?.[0]).toMatchObject({
      name: "management/[personId]",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        headerStyle: undefined,
        title: "Management",
      },
    });
    expect(stackScreenMock.mock.calls[5]?.[0]).toMatchObject({
      name: "index",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        // No background of any kind: an explicit one makes an iOS 26 large
        // title invisible, and `headerBackground` costs it the collapse.
        headerStyle: undefined,
        title: "Profile",
      },
    });
    expect(profileOptions).not.toHaveProperty("headerLargeStyle");
    expect(profileOptions).not.toHaveProperty("headerRight");
    expect(stackScreenMock.mock.calls.slice(6).map((call) => call[0]?.name)).toEqual([
      "account",
      "work",
      "security",
      "notifications",
      "privacy",
    ]);
  });

  it("shows the Schedule tab for regular users with schedule view access", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { id: "org-123" },
        effectiveRole: "user",
        permissions: {
          canViewSchedule: true,
          canEditShifts: false,
          canApproveShiftRequests: false,
          canManageEmployees: false,
        },
      },
      refetch: vi.fn(),
    });

    const { getByText } = render(<TabsLayout />);

    expect(getByText("Schedule")).toBeInTheDocument();
  });

  it("shows the Schedule tab for schedule editors even without approval permission", () => {
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { id: "org-123" },
        effectiveRole: "user",
        permissions: {
          canViewSchedule: true,
          canEditShifts: true,
          canApproveShiftRequests: false,
          canManageEmployees: false,
        },
      },
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    const { getByText } = render(<TabsLayout />);

    expect(getByText("Schedule")).toBeInTheDocument();
  });

  it("shows the organization lock instead of app tabs when bootstrap reports the organization is unavailable", () => {
    const refetch = vi.fn();
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { id: "org-123" },
        effectiveRole: "super_admin",
        permissions: {
          canViewSchedule: true,
          canEditShifts: true,
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
      },
      error: new Error(
        "Organization unavailable. Sign in on the web to finish organization setup.",
      ),
      isFetching: false,
      refetch,
    });

    render(<TabsLayout />);

    expect(screen.getByText("Organization unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Organization unavailable. Sign in on the web to finish organization setup.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
    expect(usePushRegistration).toHaveBeenLastCalledWith("token-123", null);

    fireEvent.click(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Sign out"));
    expect(handleExpiredMobileSession).toHaveBeenCalledTimes(1);
  });
});
