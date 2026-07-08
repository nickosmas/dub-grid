import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleTimer } from "./useIdleTimer";

vi.mock("@/lib/idle-broadcast", () => ({
  broadcastIdleActivity: vi.fn(),
  listenForIdleActivity: vi.fn(() => () => {}),
}));

import { broadcastIdleActivity, listenForIdleActivity } from "@/lib/idle-broadcast";

const TIMEOUT_MS = 30_000;
const WARNING_MS = 5_000;
const THROTTLE_MS = 1_000;

function baseOptions(onExpire = vi.fn()) {
  return {
    timeoutMs: TIMEOUT_MS,
    warningMs: WARNING_MS,
    throttleMs: THROTTLE_MS,
    enabled: true,
    onExpire,
  };
}

function fireActivity() {
  window.dispatchEvent(new Event("mousemove"));
}

describe("useIdleTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("starts active and transitions to warning then expired with no activity", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useIdleTimer(baseOptions(onExpire)));

    expect(result.current.phase).toBe("active");

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS);
    });
    expect(result.current.phase).toBe("warning");
    expect(result.current.secondsRemaining).toBeGreaterThan(0);
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(WARNING_MS);
    });
    expect(result.current.phase).toBe("expired");
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not expire when activity resets the deadline", () => {
    const onExpire = vi.fn();
    renderHook(() => useIdleTimer(baseOptions(onExpire)));

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS - 1000);
    });
    act(() => {
      fireActivity();
    });
    act(() => {
      // Without the reset above, this would already be past the deadline.
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS - 1000);
    });

    expect(onExpire).not.toHaveBeenCalled();
  });

  it("throttles rapid activity to at most one reset per throttleMs", () => {
    renderHook(() => useIdleTimer(baseOptions()));

    act(() => {
      fireActivity();
      fireActivity();
      fireActivity();
    });

    expect(broadcastIdleActivity).toHaveBeenCalledTimes(1);
  });

  it("stayActive immediately resets and cancels the pending expiry", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useIdleTimer(baseOptions(onExpire)));

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS + 1000);
    });
    expect(result.current.phase).toBe("warning");

    act(() => {
      result.current.stayActive();
    });
    expect(result.current.phase).toBe("active");
    expect(broadcastIdleActivity).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS - 1);
    });
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("ignores cross-tab messages older than the local activity timestamp", () => {
    let deliver: (at: number) => void = () => {};
    vi.mocked(listenForIdleActivity).mockImplementation((cb) => {
      deliver = cb;
      return () => {};
    });

    const onExpire = vi.fn();
    renderHook(() => useIdleTimer(baseOptions(onExpire)));

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS - 1000);
    });
    act(() => {
      deliver(-500); // older than mount time (0) — must be ignored
    });
    act(() => {
      vi.advanceTimersByTime(WARNING_MS + 2000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not attach listeners or expire when disabled", () => {
    const onExpire = vi.fn();
    renderHook(() => useIdleTimer({ ...baseOptions(onExpire), enabled: false }));

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS * 2);
      fireActivity();
    });

    expect(onExpire).not.toHaveBeenCalled();
    expect(broadcastIdleActivity).not.toHaveBeenCalled();
  });

  it("resolves to expired immediately after a simulated sleep once woken", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useIdleTimer(baseOptions(onExpire)));

    // Simulate the system clock jumping forward (laptop sleep) without the
    // fake timer queue itself advancing — the pending setTimeout would fire
    // "late" in a real browser; the wake handler must recompute from the
    // wall clock rather than trust a stale scheduled callback.
    act(() => {
      vi.setSystemTime(TIMEOUT_MS + 60_000);
      window.dispatchEvent(new Event("pageshow"));
    });

    expect(result.current.phase).toBe("expired");
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
