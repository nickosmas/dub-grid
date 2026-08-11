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

vi.mock("expo-router", async () => {
  const React = await import("react");

  const Tabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);

  // Android hides a tab by passing `href: null` rather than omitting the
  // screen, so the rendered probe has to surface the href.
  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: { title?: string; href?: string | null };
  }) =>
    React.createElement(
      "span",
      { "data-testid": `tab-${name}` },
      `${name}:${options?.title ?? name}:${options?.href === null ? "hidden" : "visible"}`,
    );

  return {
    Redirect: ({ href }: { href: string }) => React.createElement("div", {}, `redirect:${href}`),
    Tabs,
  };
});

vi.mock("../shared/components/AppSplashScreen", async () => {
  const React = await import("react");
  return { AppSplashScreen: () => React.createElement("div", {}, "app-splash-screen") };
});

vi.mock("../shared/components/FloatingTabBar", async () => {
  const React = await import("react");
  return { FloatingTabBar: () => React.createElement("div", {}, "floating-tab-bar") };
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

  it("shows the app splash screen while the session is restoring", () => {
    useSessionState.mockReturnValue({ accessToken: undefined, isLoading: true });

    render(<TabsLayoutAndroid />);

    expect(screen.getByText("app-splash-screen")).toBeInTheDocument();
  });

  it("redirects to login without a session", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: false });

    render(<TabsLayoutAndroid />);

    expect(screen.getByText("redirect:/(auth)/login")).toBeInTheDocument();
  });

  it("renders the full tab set through the floating tab bar", () => {
    render(<TabsLayoutAndroid />);

    expect(screen.getByTestId("tab-home")).toHaveTextContent("home:Home:visible");
    expect(screen.getByTestId("tab-team")).toHaveTextContent("team:Schedule:visible");
    expect(screen.getByTestId("tab-requests")).toHaveTextContent("requests:Requests:visible");
    expect(screen.getByTestId("tab-people")).toHaveTextContent("people:People:visible");
    expect(screen.getByTestId("tab-profile")).toHaveTextContent("profile:Profile:visible");
  });

  // Android keeps the screen mounted and nulls its href, so a hidden tab must
  // still be registered — asserting on absence would pass for the wrong reason.
  it("hides the Schedule tab with href: null rather than dropping the screen", () => {
    useBootstrap.mockReturnValue(bootstrap({ canViewSchedule: false }));

    render(<TabsLayoutAndroid />);

    expect(screen.getByTestId("tab-team")).toHaveTextContent("team:Schedule:hidden");
  });

  it("hides the Home tab for a management-only regular user", () => {
    useBootstrap.mockReturnValue(
      bootstrap({ effectiveRole: "user", focusAreaIds: [], departmentIds: [7] }),
    );

    render(<TabsLayoutAndroid />);

    expect(screen.getByTestId("tab-home")).toHaveTextContent("home:Home:hidden");
  });

  it("hides Requests for a user who is neither scheduled nor an approver", () => {
    useBootstrap.mockReturnValue(
      bootstrap({ effectiveRole: "user", canApproveShiftRequests: false, focusAreaIds: [] }),
    );

    render(<TabsLayoutAndroid />);

    expect(screen.getByTestId("tab-requests")).toHaveTextContent("requests:Requests:hidden");
  });

  it("shows the organization lock instead of tabs when bootstrap reports it unavailable", () => {
    useBootstrap.mockReturnValue({
      ...bootstrap(),
      error: new Error("Organization unavailable. Sign in on the web to manage billing."),
    });

    render(<TabsLayoutAndroid />);

    expect(screen.getByText("Organization unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-team")).not.toBeInTheDocument();
  });
});
