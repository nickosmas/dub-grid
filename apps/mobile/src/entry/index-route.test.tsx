import { act, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReactNativeModule,
  createSafeAreaContextModule,
} from "../test/native";

vi.useFakeTimers();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

const routerReplace = vi.fn();
const useSessionState = vi.fn();
const getSupabaseClient = vi.fn();
const loadHasSeenOnboarding = vi.fn();

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

vi.mock("../shared/lib/session", () => ({
  loadHasSeenOnboarding,
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
    loadHasSeenOnboarding.mockReset();
    loadHasSeenOnboarding.mockResolvedValue(true);
  });

  it("shows the splash screen while startup is still loading", () => {
    useSessionState.mockReturnValue({
      accessToken: null,
      isLoading: true,
    });

    render(<IndexScreen />);

    expect(screen.getByLabelText("DubGrid logo")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("keeps the splash visible briefly, then shows the login screen for returning users", async () => {
    useSessionState.mockReturnValue({
      accessToken: null,
      isLoading: false,
    });

    render(<IndexScreen />);

    expect(screen.getByLabelText("DubGrid logo")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(899);
    });

    expect(screen.getByLabelText("DubGrid logo")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByText("Enter your subdomain")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Continue",
      }),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("routes first-run users to the onboarding screen", async () => {
    useSessionState.mockReturnValue({
      accessToken: null,
      isLoading: false,
    });
    loadHasSeenOnboarding.mockResolvedValue(false);

    render(<IndexScreen />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(routerReplace).toHaveBeenCalledWith("/(auth)/onboarding");
  });

  it("routes signed-in users to the Home tab after the splash delay", async () => {
    useSessionState.mockReturnValue({
      accessToken: "token",
      isLoading: false,
    });

    render(<IndexScreen />);

    expect(screen.getByLabelText("DubGrid logo")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
  });
});
