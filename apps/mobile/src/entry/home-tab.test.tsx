import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../test/native";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement("div", {}, `redirect:${href}`),
  };
});

vi.mock("../features/notifications/hooks/usePushRegistration", () => ({
  usePushRegistration: vi.fn(),
}));

vi.mock("../features/notifications/hooks/usePushResponseHandler", () => ({
  usePushResponseHandler: vi.fn(),
}));

vi.mock("../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

vi.mock("../features/auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../features/dashboard/screens/AdminHomeScreen", () => ({
  AdminHomeScreen: () => <div>admin-home-screen</div>,
}));

vi.mock("../features/schedule/screens/ScheduleScreen", () => ({
  HomeScheduleScreen: () => <div>personal-schedule-screen</div>,
}));

let HomeTabScreen: (typeof import("../../app/(tabs)/home/index"))["default"];

beforeAll(async () => {
  HomeTabScreen = (await import("../../app/(tabs)/home/index")).default;
});

describe("Home tab role branching", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    useSessionState.mockReturnValue({ accessToken: "token-1" });
  });

  // Picking a screen before the role is known meant an admin got the personal
  // schedule's skeleton, then the dashboard's — two waves, the first one the
  // wrong shape for the page that followed it.
  it("mounts neither home screen while bootstrap is loading", () => {
    useBootstrap.mockReturnValue({ isLoading: true, data: undefined });

    render(<HomeTabScreen />);

    expect(screen.queryByText("personal-schedule-screen")).not.toBeInTheDocument();
    expect(screen.queryByText("admin-home-screen")).not.toBeInTheDocument();
  });

  it("renders AdminHomeScreen for an admin", () => {
    useBootstrap.mockReturnValue({ isLoading: false, data: { effectiveRole: "admin" } });

    render(<HomeTabScreen />);

    expect(screen.getByText("admin-home-screen")).toBeInTheDocument();
  });

  it("renders AdminHomeScreen for a super_admin", () => {
    useBootstrap.mockReturnValue({ isLoading: false, data: { effectiveRole: "super_admin" } });

    render(<HomeTabScreen />);

    expect(screen.getByText("admin-home-screen")).toBeInTheDocument();
  });

  it("renders the personal schedule screen for a regular user", () => {
    useBootstrap.mockReturnValue({ isLoading: false, data: { effectiveRole: "user" } });

    render(<HomeTabScreen />);

    expect(screen.getByText("personal-schedule-screen")).toBeInTheDocument();
  });

  it("redirects a management-only regular user to the team schedule", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: {
        effectiveRole: "user",
        linkedEmployee: { focusAreaIds: [], departmentIds: [9] },
      },
    });

    render(<HomeTabScreen />);

    expect(screen.getByText("redirect:/(tabs)/team")).toBeInTheDocument();
  });
});
