import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addEventListener = vi.fn();
const remove = vi.fn();

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (...args: unknown[]) => addEventListener(...args),
  },
}));

import { useRealtimeNow } from "./useRealtimeNow";

function emitAppState(state: string) {
  const handler = addEventListener.mock.calls.at(-1)?.[1] as (s: string) => void;
  act(() => {
    handler(state);
  });
}

describe("useRealtimeNow", () => {
  beforeEach(() => {
    addEventListener.mockReset();
    remove.mockReset();
    addEventListener.mockReturnValue({ remove });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current time on first render", () => {
    vi.setSystemTime(new Date("2026-08-05T10:20:30.000Z"));

    const { result } = renderHook(() => useRealtimeNow());

    expect(result.current.toISOString()).toBe("2026-08-05T10:20:30.000Z");
  });

  // The tick is aligned to the wall clock rather than a fixed 60s interval, so
  // a "3 minutes ago" label flips exactly when the minute does.
  it("ticks on the minute boundary, not 60s after mount", () => {
    vi.setSystemTime(new Date("2026-08-05T10:20:30.000Z"));

    const { result } = renderHook(() => useRealtimeNow());

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(result.current.toISOString()).toBe("2026-08-05T10:20:30.000Z");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toISOString()).toBe("2026-08-05T10:21:00.000Z");
  });

  it("keeps ticking every minute after the first alignment", () => {
    vi.setSystemTime(new Date("2026-08-05T10:20:30.000Z"));

    const { result } = renderHook(() => useRealtimeNow());

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.toISOString()).toBe("2026-08-05T10:22:00.000Z");
  });

  // Timers don't fire reliably while backgrounded, so the clock would other-
  // wise come back stale and show a shift as still upcoming after it started.
  it("resyncs immediately when the app returns to the foreground", () => {
    vi.setSystemTime(new Date("2026-08-05T10:20:30.000Z"));

    const { result } = renderHook(() => useRealtimeNow());

    vi.setSystemTime(new Date("2026-08-05T11:45:10.000Z"));
    emitAppState("active");

    expect(result.current.toISOString()).toBe("2026-08-05T11:45:10.000Z");
  });

  it("ignores non-active app states", () => {
    vi.setSystemTime(new Date("2026-08-05T10:20:30.000Z"));

    const { result } = renderHook(() => useRealtimeNow());

    vi.setSystemTime(new Date("2026-08-05T11:45:10.000Z"));
    emitAppState("background");

    expect(result.current.toISOString()).toBe("2026-08-05T10:20:30.000Z");
  });

  it("tears down its timer and listener on unmount", () => {
    vi.setSystemTime(new Date("2026-08-05T10:20:30.000Z"));

    const { unmount } = renderHook(() => useRealtimeNow());
    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
