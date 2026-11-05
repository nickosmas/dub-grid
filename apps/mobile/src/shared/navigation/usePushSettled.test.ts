import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listeners = new Map<string, (event: unknown) => void>();
vi.mock("expo-router", () => ({
  useNavigation: () => ({
    addListener: (name: string, listener: (event: unknown) => void) => {
      listeners.set(name, listener);
      return () => listeners.delete(name);
    },
  }),
}));

describe("usePushSettled", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listeners.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("settles when the push animation ends", async () => {
    const { usePushSettled } = await import("./usePushSettled");
    const { result } = renderHook(() => usePushSettled());
    expect(result.current).toBe(false);

    act(() => listeners.get("transitionEnd")?.({ data: { closing: false } }));
    expect(result.current).toBe(true);
  });

  it("settles anyway when the end is never reported", async () => {
    const { usePushSettled } = await import("./usePushSettled");
    const { result } = renderHook(() => usePushSettled());

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current).toBe(true);
  });
});
