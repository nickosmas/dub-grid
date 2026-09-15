import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

const routerReplace = vi.fn();
const useSessionState = vi.fn();
const getSupabaseClient = vi.fn();
const useHasSeenOnboarding = vi.fn();

vi.mock("expo-router", () => ({
  router: {
    replace: routerReplace,
  },
}));

vi.mock("../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

vi.mock("../shared/lib/supabase", () => ({
  getSupabaseClient,
}));

vi.mock("../features/auth/hooks/useHasSeenOnboarding", () => ({
  useHasSeenOnboarding,
}));

vi.mock("../features/auth/screens/LoginScreen", async () => {
  const React = await import("react");

  return {
    __esModule: true,
    default: () =>
      React.createElement(
        "div",
        {},
        React.createElement("span", {}, "Enter your subdomain"),
        React.createElement("button", { type: "button" }, "Continue"),
      ),
  };
});

let IndexScreen: (typeof import("../../app/index"))["default"];

beforeAll(async () => {
  IndexScreen = (await import("../../app/index")).default;
});

describe("IndexScreen", () => {
  beforeEach(() => {
    routerReplace.mockReset();
    useSessionState.mockReset();
    getSupabaseClient.mockReset();
    useHasSeenOnboarding.mockReset();
    useHasSeenOnboarding.mockReturnValue({ data: true, isLoading: false });
  });

  // The splash is owned by StartupSplashGate, above the router. A second
  // instance rendered from a route restarts the whole brand animation on the
  // handoff, which is what read as the splash showing twice.
  it("never renders a splash of its own", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: true });

    render(<IndexScreen />);

    expect(screen.queryByLabelText("DubGrid logo")).not.toBeInTheDocument();
  });

  it("paints nothing until it knows where the user is going", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: true });

    const { container } = render(<IndexScreen />);

    expect(container).toBeEmptyDOMElement();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("shows the login screen once startup resolves signed out", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: false });

    render(<IndexScreen />);

    expect(screen.getByText("Enter your subdomain")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("does not route a recoverable session-restore failure as signed out", () => {
    useSessionState.mockReturnValue({
      accessToken: null,
      isLoading: false,
      restoreError: true,
    });
    useHasSeenOnboarding.mockReturnValue({ data: false, isLoading: false });

    render(<IndexScreen />);

    expect(screen.getByText("Enter your subdomain")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalledWith("/(auth)/onboarding");
  });

  it("routes first-run users to the onboarding screen", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: false });
    useHasSeenOnboarding.mockReturnValue({ data: false, isLoading: false });

    render(<IndexScreen />);

    expect(routerReplace).toHaveBeenCalledWith("/(auth)/onboarding");
    // Never the login screen first: that would flash behind the splash and
    // then jump to onboarding.
    expect(screen.queryByText("Enter your subdomain")).not.toBeInTheDocument();
  });

  it("routes signed-in users to the Home tab even when the device-local intro tour is unseen", () => {
    useSessionState.mockReturnValue({ accessToken: "token", isLoading: false });
    useHasSeenOnboarding.mockReturnValue({ data: false, isLoading: false });

    render(<IndexScreen />);

    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
    expect(routerReplace).not.toHaveBeenCalledWith("/(auth)/onboarding");
  });

  it("waits for the first-run flag before picking a destination", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: false });
    useHasSeenOnboarding.mockReturnValue({ data: undefined, isLoading: true });

    render(<IndexScreen />);

    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("Enter your subdomain")).not.toBeInTheDocument();
  });
});
