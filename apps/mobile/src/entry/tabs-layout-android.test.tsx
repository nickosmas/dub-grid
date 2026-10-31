import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();

// The Android layout shares `useTabsGate` with the other platforms, so these
// exercise the real gate — same mock set as tabs-layout.test.tsx.
vi.mock("react-native", async () => {
  const React = await import("react");

  return {
    AppState: {
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Platform: { OS: "android" },
    View: ({ children }: { children: React.ReactNode }) => React.createElement("div", {}, children),
  };
});

vi.mock("../features/notifications/hooks/usePushRegistration", () => ({
  usePushRegistration: vi.fn(),
}));

vi.mock("../features/notifications/hooks/usePushResponseHandler", () => ({
  usePushResponseHandler: vi.fn(),
}));

// Hidden tabs are left out of the native bar, so a probe per trigger shows
// which tabs Android draws.
vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement("div", {}, `redirect:${href}`),
  };
});

vi.mock("expo-router/unstable-native-tabs", async () => {
  const React = await import("react");
  const NativeTabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);
  const Trigger = ({ name, children }: { name: string; children: React.ReactNode }) =>
    React.createElement("span", { "data-testid": `tab-${name}` }, children);
  NativeTabs.Trigger = Object.assign(Trigger, {
    Label: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Icon: () => null,
  });
  return { NativeTabs };
});

vi.mock("../shared/components/AppSplashScreen", async () => {
  const React = await import("react");
  return { AppSplashScreen: () => React.createElement("div", {}, "app-splash-screen") };
});

vi.mock("../features/auth/screens/OrganizationLockedScreen", async () => {
  const React = await import("react");
  return {
    OrganizationLockedScreen: ({ message }: { message: string }) =>
      React.createElement(
        "section",
        {},
        React.createElement("h1", {}, "Organization unavailable"),
        message,
      ),
  };
});

vi.mock("../features/auth/screens/NetworkConnectionRecoveryScreen", async () => {
  const React = await import("react");
  return {
    NetworkConnectionRecoveryScreen: () =>
      React.createElement("div", {}, "network-connection-recovery"),
  };
});

vi.mock("../features/auth/hooks/useBootstrap", () => ({ useBootstrap }));
vi.mock("../shared/lib/auth-reset", () => ({ handleExpiredMobileSession: vi.fn() }));
vi.mock("../shared/providers/AuthSessionProvider", () => ({ useSessionState }));

let TabsLayoutAndroid: (typeof import("../../app/(tabs)/_layout.android"))["default"];

beforeAll(async () => {
  TabsLayoutAndroid = (await import("../../app/(tabs)/_layout.android")).default;
});

function bootstrap(overrides?: {
  effectiveRole?: string;
  canViewSchedule?: boolean;
  canApproveShiftRequests?: boolean;
  focusAreaIds?: number[];
  departmentIds?: number[];
}) {
  return {
    data: {
      currentOrg: { id: "org-1", featureFlags: {} },
      effectiveRole: overrides?.effectiveRole ?? "admin",
      permissions: {
        canViewSchedule: overrides?.canViewSchedule ?? true,
        canApproveShiftRequests: overrides?.canApproveShiftRequests ?? true,
      },
      linkedEmployee: {
        focusAreaIds: overrides?.focusAreaIds ?? [1],
        departmentIds: overrides?.departmentIds ?? [],
      },
    },
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
}

describe("TabsLayoutAndroid", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    useSessionState.mockReturnValue({ accessToken: "token-123", isLoading: false });
    useBootstrap.mockReturnValue(bootstrap());
  });

  // StartupSplashGate owns the launch splash and is still covering the
  // screen for the entire window the session takes to restore, so this
  // renders nothing rather than a second, competing loading screen.
  it("renders nothing while the session is restoring", () => {
    useSessionState.mockReturnValue({ accessToken: undefined, isLoading: true });

    const { container } = render(<TabsLayoutAndroid />);

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  // Bootstrap's first load no longer blocks the tab tree: every tab shows
  // optimistically (see useTabsGate) and each destination screen owns its
  // own useBootstrap call and skeleton, so it settles into the right shape
  // once this resolves instead of the whole layout staying blank.
  it("shows every tab optimistically while bootstrap's first load is in flight", () => {
    useBootstrap.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<TabsLayoutAndroid />);

    expect(screen.getByTestId("tab-home")).toHaveTextContent("Home");
    expect(screen.getByTestId("tab-team")).toHaveTextContent("Schedule");
    expect(screen.getByTestId("tab-requests")).toHaveTextContent("Requests");
  });

  it("redirects to login without a session", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: false });

    render(<TabsLayoutAndroid />);

    expect(screen.getByText("redirect:/(auth)/login")).toBeInTheDocument();
  });

  it("renders the full tab set in the native bottom navigation", () => {
    render(<TabsLayoutAndroid />);

    expect(screen.getByTestId("tab-home")).toHaveTextContent("Home");
    expect(screen.getByTestId("tab-team")).toHaveTextContent("Schedule");
    expect(screen.getByTestId("tab-requests")).toHaveTextContent("Requests");
    expect(screen.getByTestId("tab-people")).toHaveTextContent("People");
    expect(screen.getByTestId("tab-profile")).toHaveTextContent("Profile");
  });

  // Android keeps the screen mounted and nulls its href, so a hidden tab must
  // still be registered — asserting on absence would pass for the wrong reason.
  it("leaves the Schedule tab out of the bar for someone who can't see it", () => {
    useBootstrap.mockReturnValue(bootstrap({ canViewSchedule: false }));

    render(<TabsLayoutAndroid />);

    expect(screen.queryByTestId("tab-team")).not.toBeInTheDocument();
  });

  it("hides the Home tab for a management-only regular user", () => {
    useBootstrap.mockReturnValue(
      bootstrap({ effectiveRole: "user", focusAreaIds: [], departmentIds: [7] }),
    );

    render(<TabsLayoutAndroid />);

    expect(screen.queryByTestId("tab-home")).not.toBeInTheDocument();
  });

  it("hides Requests for a user who is neither scheduled nor an approver", () => {
    useBootstrap.mockReturnValue(
      bootstrap({ effectiveRole: "user", canApproveShiftRequests: false, focusAreaIds: [] }),
    );

    render(<TabsLayoutAndroid />);

    expect(screen.queryByTestId("tab-requests")).not.toBeInTheDocument();
  });

  it("shows the organization lock instead of tabs when bootstrap reports it unavailable", () => {
    useBootstrap.mockReturnValue({
      ...bootstrap(),
      error: new Error("Organization unavailable. Sign in on the web to manage billing."),
      isError: true,
    });

    render(<TabsLayoutAndroid />);

    expect(screen.getByText("Organization unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-team")).not.toBeInTheDocument();
  });
});
