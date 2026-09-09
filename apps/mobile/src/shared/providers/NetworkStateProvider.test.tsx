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

const setOnline = vi.fn();
const setFocused = vi.fn();
const getNetworkStateAsync = vi.fn();
const addNetworkStateListener = vi.fn();
const removeNetworkListener = vi.fn();
let networkListener:
  ((state: { isConnected?: boolean; isInternetReachable?: boolean }) => void) | null = null;

vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    setOnline,
  },
  focusManager: {
    setFocused,
  },
}));

vi.mock("expo-network", () => ({
  getNetworkStateAsync,
  addNetworkStateListener,
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
    networkListener = null;
    appStateHarness.listener = null;
    addNetworkStateListener.mockImplementation((listener) => {
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
      appStateHarness.listener?.("background");
      appStateHarness.listener?.("background");
      appStateHarness.listener?.("active");
    });

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
});
