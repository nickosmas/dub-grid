import { beforeEach, describe, expect, it, vi } from "vitest";

const removeNativeListener = vi.fn();
const addNetworkStateListener = vi.fn();
let nativeListener: ((state: { isConnected: boolean }) => void) | null = null;

vi.mock("expo-network", () => ({ addNetworkStateListener }));

describe("subscribeToNetworkState", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    nativeListener = null;
    addNetworkStateListener.mockImplementation((listener) => {
      nativeListener = listener;
      return { remove: removeNativeListener };
    });
  });

  it("subscribes natively once and never removes it as listeners come and go", async () => {
    const { subscribeToNetworkState } = await import("./network-state-source");

    const unsubscribeFirst = subscribeToNetworkState(vi.fn());
    unsubscribeFirst();
    const unsubscribeSecond = subscribeToNetworkState(vi.fn());
    unsubscribeSecond();
    subscribeToNetworkState(vi.fn());

    expect(addNetworkStateListener).toHaveBeenCalledTimes(1);
    expect(removeNativeListener).not.toHaveBeenCalled();
  });

  it("delivers native events to the listeners subscribed at the time", async () => {
    const { subscribeToNetworkState } = await import("./network-state-source");
    const gone = vi.fn();
    const current = vi.fn();

    subscribeToNetworkState(gone)();
    subscribeToNetworkState(current);
    nativeListener?.({ isConnected: false });

    expect(gone).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledWith({ isConnected: false });
  });
});
