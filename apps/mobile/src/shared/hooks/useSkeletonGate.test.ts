import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKELETON_DELAY_MS, SKELETON_MIN_VISIBLE_MS, useSkeletonGate } from "./useSkeletonGate";

describe("useSkeletonGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("paints nothing for a request that resolves inside the delay window", () => {
    const { result, rerender } = renderHook(({ isLoading }) => useSkeletonGate(isLoading), {
      initialProps: { isLoading: true },
    });

    expect(result.current).toBe(false);

    advance(SKELETON_DELAY_MS - 20);
    rerender({ isLoading: false });

    expect(result.current).toBe(false);

    // The delay timer must have been cancelled, not merely outrun.
    advance(SKELETON_DELAY_MS + SKELETON_MIN_VISIBLE_MS);
    expect(result.current).toBe(false);
  });

  it("shows the skeleton once loading outlasts the delay", () => {
    const { result } = renderHook(() => useSkeletonGate(true));

    advance(SKELETON_DELAY_MS - 1);
    expect(result.current).toBe(false);

    advance(2);
    expect(result.current).toBe(true);
  });

  it("holds a painted skeleton for the minimum visible time", () => {
    const { result, rerender } = renderHook(({ isLoading }) => useSkeletonGate(isLoading), {
      initialProps: { isLoading: true },
    });

    advance(SKELETON_DELAY_MS + 10);
    expect(result.current).toBe(true);

    // Data lands almost immediately after the skeleton appeared.
    rerender({ isLoading: false });
    expect(result.current).toBe(true);

    advance(SKELETON_MIN_VISIBLE_MS - 20);
    expect(result.current).toBe(true);

    advance(30);
    expect(result.current).toBe(false);
  });

  it("hides immediately when the skeleton has already outstayed the minimum", () => {
    const { result, rerender } = renderHook(({ isLoading }) => useSkeletonGate(isLoading), {
      initialProps: { isLoading: true },
    });

    advance(SKELETON_DELAY_MS + SKELETON_MIN_VISIBLE_MS + 500);
    expect(result.current).toBe(true);

    rerender({ isLoading: false });
    expect(result.current).toBe(false);
  });

  it("stays visible across a re-render while loading continues", () => {
    const { result, rerender } = renderHook(({ isLoading }) => useSkeletonGate(isLoading), {
      initialProps: { isLoading: true },
    });

    advance(SKELETON_DELAY_MS + 10);
    expect(result.current).toBe(true);

    rerender({ isLoading: true });
    advance(1000);

    expect(result.current).toBe(true);
  });

  it("never paints when loading was false from the start", () => {
    const { result } = renderHook(() => useSkeletonGate(false));

    advance(SKELETON_DELAY_MS + SKELETON_MIN_VISIBLE_MS + 100);

    expect(result.current).toBe(false);
  });
});
