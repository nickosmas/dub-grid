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
  });

  it("shows the splash screen while startup is still loading", () => {
    useSessionState.mockReturnValue({
      accessToken: null,
      isLoading: true,
    });

    render(<IndexScreen />);

    expect(screen.getByText("DubGrid Mobile")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("keeps the splash visible briefly, then shows the login screen", () => {
    useSessionState.mockReturnValue({
      accessToken: null,
      isLoading: false,
    });

    render(<IndexScreen />);

    expect(screen.getByText("Opening workspace")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(899);
    });

    expect(screen.getByText("Opening workspace")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText("Enter your subdomain")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Continue",
      }),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("routes signed-in users to the Me tab after the splash delay", () => {
    useSessionState.mockReturnValue({
      accessToken: "token",
      isLoading: false,
    });

    render(<IndexScreen />);

    expect(screen.getByText("Opening workspace")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/me");
  });
});
