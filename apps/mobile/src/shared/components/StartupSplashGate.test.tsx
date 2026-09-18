import { act, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";

vi.useFakeTimers();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const useHasSeenOnboarding = vi.fn();
const hideAsync = vi.fn();

vi.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => {
    hideAsync();
    return Promise.resolve();
  },
}));

vi.mock("../providers/AuthSessionProvider", () => ({
  useSessionState,
}));

vi.mock("../../features/auth/hooks/useBootstrap", () => ({
  BOOTSTRAP_QUERY_KEY_PREFIX: ["mobile", "bootstrap"],
  useBootstrap,
}));

vi.mock("../../features/auth/hooks/useHasSeenOnboarding", () => ({
  useHasSeenOnboarding,
}));

vi.mock("./AppSplashScreen", async () => {
  const React = await import("react");

  return {
    AppSplashScreen: () => React.createElement("div", {}, "app-splash-screen"),
  };
});

let StartupSplashGate: (typeof import("./StartupSplashGate"))["StartupSplashGate"];

beforeAll(async () => {
  StartupSplashGate = (await import("./StartupSplashGate")).StartupSplashGate;
});

function renderGate() {
  return render(
    <StartupSplashGate>
      <div>router</div>
    </StartupSplashGate>,
  );
}

async function elapseMinimumSplash() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(900);
  });
}

describe("StartupSplashGate", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    useHasSeenOnboarding.mockReset();
    hideAsync.mockReset();

    useSessionState.mockReturnValue({ accessToken: "token", isLoading: false });
    useBootstrap.mockReturnValue({ isLoading: false });
    useHasSeenOnboarding.mockReturnValue({ data: true, isLoading: false });
  });

  it("holds the splash over the router until startup resolves", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: true });

    renderGate();

    expect(screen.getByText("app-splash-screen")).toBeInTheDocument();
    // The router renders underneath rather than being replaced, so the index
    // route can resolve its destination while the splash covers the seam.
    expect(screen.getByText("router")).toBeInTheDocument();
  });

  it("lifts the splash once the session, bootstrap and first-run flag have landed", async () => {
    renderGate();

    expect(screen.getByText("app-splash-screen")).toBeInTheDocument();

    await elapseMinimumSplash();

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
  });

  it("holds past the minimum wait while bootstrap is still in flight", async () => {
    useBootstrap.mockReturnValue({ fetchStatus: "fetching", isLoading: true });

    renderGate();
    await elapseMinimumSplash();

    // Releasing here would hand the tab tree an unknown role: the tab bar's
    // shape and the Home tab's choice of screen both come from bootstrap.
    expect(screen.getByText("app-splash-screen")).toBeInTheDocument();
  });

  it("lifts when an offline bootstrap is paused so recovery can render", async () => {
    useBootstrap.mockReturnValue({ fetchStatus: "paused", isLoading: true });

    renderGate();
    await elapseMinimumSplash();

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
  });

  it("never lets an unsettled bootstrap latch the splash past its request budget", async () => {
    useBootstrap.mockReturnValue({ fetchStatus: "fetching", isLoading: true });

    renderGate();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(screen.getByText("app-splash-screen")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
  });

  it("does not wait on bootstrap when there is no session to bootstrap", async () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: false });
    // A disabled query reports `isLoading: false`, but assert the signed-out
    // path regardless of what the query says, so it can never pin the splash.
    useBootstrap.mockReturnValue({ isLoading: true });

    renderGate();
    await elapseMinimumSplash();

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
  });

  it("lifts the splash when bootstrap fails instead of stranding the launch", async () => {
    useBootstrap.mockReturnValue({ isLoading: false, isError: true, error: new Error("nope") });

    renderGate();
    await elapseMinimumSplash();

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
  });

  it("waits for the first-run flag before lifting", async () => {
    useHasSeenOnboarding.mockReturnValue({ data: undefined, isLoading: true });

    renderGate();
    await elapseMinimumSplash();

    expect(screen.getByText("app-splash-screen")).toBeInTheDocument();
  });

  // The whole point of the gate. Supabase rotates the access token on its own,
  // and a rotation used to re-enter bootstrap's loading state, which threw the
  // launch splash back over a running app.
  it("never brings the splash back once startup has completed", async () => {
    const { rerender } = renderGate();
    await elapseMinimumSplash();

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();

    useSessionState.mockReturnValue({ accessToken: "rotated-token", isLoading: true });
    useBootstrap.mockReturnValue({ isLoading: true });
    useHasSeenOnboarding.mockReturnValue({ data: undefined, isLoading: true });

    await act(async () => {
      rerender(
        <StartupSplashGate>
          <div>router</div>
        </StartupSplashGate>,
      );
    });

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
  });

  // Owned here rather than by the index route, so deep links that mount a
  // screen without passing through it still take the native splash down.
  it("hides the native splash on mount", () => {
    renderGate();

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });
});
