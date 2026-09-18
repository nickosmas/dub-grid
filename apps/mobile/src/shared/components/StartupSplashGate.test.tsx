import { act, cleanup, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTUP_STATUS_DELAY_MS, STARTUP_TIMEOUT_MS } from "@dubgrid/design-tokens";

const MIN_SPLASH_MS = 900;
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

let isOffline = false;

vi.mock("../providers/NetworkStateProvider", () => ({
  useOptionalNetworkStatus: () => ({ isOffline, isOnline: !isOffline, hasResolvedState: true }),
}));

vi.mock("../../features/auth/hooks/useBootstrap", () => ({
  BOOTSTRAP_QUERY_KEY_PREFIX: ["mobile", "bootstrap"],
  useBootstrap,
}));

vi.mock("../../features/auth/hooks/useHasSeenOnboarding", () => ({
  useHasSeenOnboarding,
}));

const splashProps = vi.fn();

vi.mock("./AppSplashScreen", async () => {
  const React = await import("react");

  return {
    AppSplashScreen: (props: Record<string, unknown>) => {
      splashProps(props);
      return React.createElement("div", {}, "app-splash-screen");
    },
  };
});

const refetch = vi.fn(() => Promise.resolve());

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
    await vi.advanceTimersByTimeAsync(MIN_SPLASH_MS);
  });
}

function lastSplashProps() {
  return splashProps.mock.calls.at(-1)?.[0] as
    { phase?: string; offline?: boolean; onRetry?: () => void; retrying?: boolean } | undefined;
}

describe("StartupSplashGate", () => {
  beforeEach(() => {
    // Gates from earlier cases stay mounted otherwise, and their phase timers
    // keep firing into this one's fake clock, so the props under assertion
    // could come from a component the test never rendered.
    cleanup();
    useSessionState.mockReset();
    useBootstrap.mockReset();
    useHasSeenOnboarding.mockReset();
    hideAsync.mockReset();
    isOffline = false;

    splashProps.mockReset();
    refetch.mockClear();

    useSessionState.mockReturnValue({ accessToken: "token", isLoading: false });
    useBootstrap.mockReturnValue({ isLoading: false, refetch });
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
    useBootstrap.mockReturnValue({ fetchStatus: "fetching", isLoading: true, refetch });

    renderGate();
    await elapseMinimumSplash();

    // Releasing here would hand the tab tree an unknown role: the tab bar's
    // shape and the Home tab's choice of screen both come from bootstrap.
    expect(screen.getByText("app-splash-screen")).toBeInTheDocument();
  });

  it("lifts when an offline bootstrap is paused so recovery can render", async () => {
    useBootstrap.mockReturnValue({ fetchStatus: "paused", isLoading: true, refetch });

    renderGate();
    await elapseMinimumSplash();

    expect(screen.queryByText("app-splash-screen")).not.toBeInTheDocument();
  });

  it("never lets an unsettled bootstrap latch the splash past its request budget", async () => {
    useBootstrap.mockReturnValue({ fetchStatus: "fetching", isLoading: true, refetch });

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

  // A launch that beats the status delay never explains itself, which is the
  // common case and the reason the copy is delayed at all.
  it("stays quiet through a launch that resolves before the status delay", async () => {
    renderGate();
    await elapseMinimumSplash();

    expect(lastSplashProps()?.phase).toBe("quiet");
  });

  it("explains itself at the status delay and offers a way out at the timeout", async () => {
    useBootstrap.mockReturnValue({ fetchStatus: "fetching", isLoading: true, refetch });

    renderGate();
    expect(lastSplashProps()?.phase).toBe("quiet");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_STATUS_DELAY_MS);
    });
    expect(lastSplashProps()?.phase).toBe("status");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS - STARTUP_STATUS_DELAY_MS);
    });
    expect(lastSplashProps()?.phase).toBe("timeout");
  });

  it("retries the bootstrap the launch is waiting on", async () => {
    useBootstrap.mockReturnValue({ fetchStatus: "fetching", isLoading: true, refetch });

    renderGate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS);
    });

    await act(async () => {
      lastSplashProps()?.onRetry?.();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("hands the splash the offline state so it can say so", async () => {
    useBootstrap.mockReturnValue({ fetchStatus: "fetching", isLoading: true, refetch });
    isOffline = true;

    renderGate();
    await elapseMinimumSplash();

    expect(lastSplashProps()?.offline).toBe(true);
  });

  // Owned here rather than by the index route, so deep links that mount a
  // screen without passing through it still take the native splash down.
  it("hides the native splash on mount", () => {
    renderGate();

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });
});
