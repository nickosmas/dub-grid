import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const usePushRegistration = vi.fn();
const triggerIconMock = vi.fn();
const stackScreenMock = vi.fn();
const handleExpiredMobileSession = vi.fn();

vi.mock("react-native", async () => {
  const React = await import("react");

  return {
    AppState: {
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Platform: {
      OS: "ios",
    },
    View: ({ children }: { children: React.ReactNode }) => React.createElement("div", {}, children),
  };
});

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

  it("shows the app splash screen instead of a spinner while the session is restoring", () => {
    useSessionState.mockReturnValue({ accessToken: undefined, isLoading: true });

    render(<TabsLayout />);

    expect(screen.getByText("app-splash-screen")).toBeInTheDocument();
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

  it("uses native stack headers for request, people, and profile tab pages", () => {
    render(<RequestsLayout />);
    render(<PeopleLayout />);
    render(<ProfileLayout />);

    expect(stackScreenMock).toHaveBeenCalledTimes(9);
    const requestsOptions = stackScreenMock.mock.calls[0]?.[0].options;
    const peopleOptions = stackScreenMock.mock.calls[1]?.[0].options;
    const profileOptions = stackScreenMock.mock.calls[3]?.[0].options;

    expect(stackScreenMock.mock.calls[0]?.[0]).toMatchObject({
      name: "index",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
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
        headerStyle: undefined,
        title: "People",
      },
    });
    expect(peopleOptions).not.toHaveProperty("headerLargeStyle");
    const peopleDetailOptions = stackScreenMock.mock.calls[2]?.[0].options;
    expect(stackScreenMock.mock.calls[2]?.[0]).toMatchObject({
      name: "[id]",
      options: {
        headerLargeTitle: false,
        headerLargeTitleEnabled: false,
        headerStyle: {
          backgroundColor: expect.any(String),
        },
        title: "Person",
      },
    });
    expect(peopleDetailOptions).not.toHaveProperty("headerLargeStyle");
    expect(stackScreenMock.mock.calls[3]?.[0]).toMatchObject({
      name: "index",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        headerStyle: undefined,
        title: "Profile",
      },
    });
    expect(profileOptions).not.toHaveProperty("headerLargeStyle");
    expect(profileOptions).not.toHaveProperty("headerRight");
    expect(stackScreenMock.mock.calls.slice(4).map((call) => call[0]?.name)).toEqual([
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
