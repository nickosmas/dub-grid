import { render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.useFakeTimers();

const appStateHarness = vi.hoisted(() => ({
  listener: null as ((status: "active" | "background" | "inactive") => void) | null,
  remove: vi.fn(),
}));

vi.mock("react-native", async () => ({
  ...createReactNativeModule(await import("react")),
  AppState: {
    currentState: "active",
    addEventListener: (
      _event: string,
      listener: (status: "active" | "background" | "inactive") => void,
    ) => {
      appStateHarness.listener = listener;
      return { remove: appStateHarness.remove };
    },
  },
}));

let managerOnline = true;
const setOnline = vi.fn((online: boolean) => {
  managerOnline = online;
});
const setFocused = vi.fn();
const startAutoRefresh = vi.fn();
const stopAutoRefresh = vi.fn();
const getNetworkStateAsync = vi.fn();
const addNetworkStateListener = vi.fn();
const removeNetworkListener = vi.fn();
// Captured once: the provider subscribes to expo-network for the life of the
// module, never per mount.
let networkListener:
  ((state: { isConnected?: boolean; isInternetReachable?: boolean }) => void) | null = null;
let nativeSubscriptions = 0;

vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    setOnline,
    isOnline: () => managerOnline,
  },
  focusManager: {
    setFocused,
  },
}));

vi.mock("expo-network", () => ({
  getNetworkStateAsync,
  addNetworkStateListener,
}));

vi.mock("../lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      startAutoRefresh,
      stopAutoRefresh,
    },
  }),
}));

let NetworkStateProvider: (typeof import("./NetworkStateProvider"))["NetworkStateProvider"];
let useNetworkStatus: (typeof import("./NetworkStateProvider"))["useNetworkStatus"];

beforeAll(async () => {
  const module = await import("./NetworkStateProvider");
  NetworkStateProvider = module.NetworkStateProvider;
  useNetworkStatus = module.useNetworkStatus;
});

function NetworkProbe() {
  const { hasResolvedState, isOffline, isOnline } = useNetworkStatus();

  return (
    <div>
      <span data-testid="resolved">{String(hasResolvedState)}</span>
      <span data-testid="offline">{String(isOffline)}</span>
      <span data-testid="online">{String(isOnline)}</span>
    </div>
  );
}

describe("NetworkStateProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managerOnline = true;
    appStateHarness.listener = null;
    startAutoRefresh.mockResolvedValue(undefined);
    stopAutoRefresh.mockResolvedValue(undefined);
    addNetworkStateListener.mockImplementation((listener) => {
      nativeSubscriptions += 1;
      networkListener = listener;
      return {
        remove: removeNetworkListener,
      };
    });
  });

  it("waits for the initial network state before rendering children", async () => {
    getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );

    expect(screen.queryByTestId("resolved")).not.toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("resolved")).toHaveTextContent("true");
    expect(screen.getByTestId("offline")).toHaveTextContent("true");
    expect(setOnline).toHaveBeenCalledWith(false);
  });

  it("releases startup when the initial network probe does not settle", async () => {
    getNetworkStateAsync.mockReturnValue(new Promise(() => {}));

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(screen.queryByTestId("resolved")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByTestId("resolved")).toHaveTextContent("true");
    expect(screen.getByTestId("online")).toHaveTextContent("true");
    expect(setOnline).toHaveBeenCalledWith(true);
  });

  it("keeps the app offline until reconnect is stable", async () => {
    getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("offline")).toHaveTextContent("true");
    act(() => {
      networkListener?.({
        isConnected: true,
        isInternetReachable: true,
      });
    });

    expect(screen.getByTestId("offline")).toHaveTextContent("true");

    act(() => {
      vi.advanceTimersByTime(1_499);
    });

    expect(screen.getByTestId("offline")).toHaveTextContent("true");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByTestId("online")).toHaveTextContent("true");
    expect(setOnline).toHaveBeenLastCalledWith(true);
  });

  it("coalesces repeated online events into one stable reconnect", async () => {
    getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      networkListener?.({ isConnected: true, isInternetReachable: true });
      networkListener?.({ isConnected: true, isInternetReachable: true });
      vi.advanceTimersByTime(1_500);
    });

    expect(setOnline.mock.calls.filter(([value]) => value === true)).toHaveLength(1);
  });

  it("notifies React Query once per real foreground transition", async () => {
    getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      appStateHarness.listener?.("active");
      appStateHarness.listener?.("inactive");
      appStateHarness.listener?.("background");
      appStateHarness.listener?.("background");
      appStateHarness.listener?.("active");
      appStateHarness.listener?.("active");
    });

    expect(setFocused.mock.calls).toEqual([[false], [true]]);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) {
        await Promise.resolve();
      }
    });
    expect(startAutoRefresh).toHaveBeenCalledTimes(2);
    expect(stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps foreground focus usable when Supabase auto-refresh startup fails", async () => {
    startAutoRefresh.mockRejectedValue(new Error("refresh unavailable"));
    getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      appStateHarness.listener?.("background");
      appStateHarness.listener?.("active");
    });

    expect(screen.getByTestId("online")).toHaveTextContent("true");
    expect(setFocused.mock.calls).toEqual([[false], [true]]);
  });

  it("cancels a reconnect transition when connectivity drops again", async () => {
    getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("offline")).toHaveTextContent("true");
    act(() => {
      networkListener?.({
        isConnected: true,
        isInternetReachable: true,
      });
    });

    act(() => {
      vi.advanceTimersByTime(750);
    });

    act(() => {
      networkListener?.({
        isConnected: false,
        isInternetReachable: false,
      });
    });

    act(() => {
      vi.advanceTimersByTime(750);
    });

    expect(screen.getByTestId("offline")).toHaveTextContent("true");
    expect(setOnline).not.toHaveBeenLastCalledWith(true);
  });
  // expo-network cancels its native monitor when the last listener goes and
  // restarts that dead monitor for the next one, so a remount must not unsubscribe.
  it("keeps one native subscription through a remount and still hears events", async () => {
    getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });

    const first = render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    first.unmount();

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(nativeSubscriptions).toBe(1);
    expect(removeNetworkListener).not.toHaveBeenCalled();

    act(() => {
      networkListener?.({ isConnected: false, isInternetReachable: false });
    });
    expect(screen.getByTestId("offline")).toHaveTextContent("true");
  });

  it("re-reads the network on foreground and restores a wrong offline flag", async () => {
    getNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: false });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("offline")).toHaveTextContent("true");

    getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    await act(async () => {
      appStateHarness.listener?.("background");
      appStateHarness.listener?.("active");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("offline")).toHaveTextContent("true");

    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByTestId("online")).toHaveTextContent("true");
    expect(setOnline).toHaveBeenLastCalledWith(true);
  });

  it("recovers React Query's flag on foreground even when this provider thinks it is online", async () => {
    getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    managerOnline = false;
    await act(async () => {
      appStateHarness.listener?.("background");
      appStateHarness.listener?.("active");
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(managerOnline).toBe(true);
  });

  it("never lets a foreground re-read take an online app offline", async () => {
    getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });

    render(
      <NetworkStateProvider>
        <NetworkProbe />
      </NetworkStateProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    // A timed-out native probe reads offline.
    getNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await act(async () => {
      appStateHarness.listener?.("background");
      appStateHarness.listener?.("active");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getNetworkStateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("online")).toHaveTextContent("true");
    expect(setOnline).not.toHaveBeenCalledWith(false);
  });
});
