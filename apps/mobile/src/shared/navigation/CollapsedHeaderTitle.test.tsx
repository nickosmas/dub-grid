import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

import { useCollapsedHeader } from "./CollapsedHeaderTitle";

function scrollTo(offsetY: number) {
  return {
    nativeEvent: { contentOffset: { y: offsetY } },
  } as NativeSyntheticEvent<NativeScrollEvent>;
}

describe("useCollapsedHeader", () => {
  it("adopts the title only once the page's own title has scrolled away", () => {
    const { result } = renderHook(() => useCollapsedHeader());

    expect(result.current.showCollapsedHeader).toBe(false);

    act(() => result.current.handleScroll(scrollTo(80)));
    expect(result.current.showCollapsedHeader).toBe(false);

    act(() => result.current.handleScroll(scrollTo(120)));
    expect(result.current.showCollapsedHeader).toBe(true);
  });

  /**
   * The reason the two thresholds differ. On a single threshold, a finger
   * parked at it flips the title every frame, and each flip reconfigures the
   * native header — the flashing header and stuttering scroll this replaced.
   */
  it("holds the title through jitter around the threshold it was crossed at", () => {
    const { result } = renderHook(() => useCollapsedHeader());

    act(() => result.current.handleScroll(scrollTo(120)));
    expect(result.current.showCollapsedHeader).toBe(true);

    for (const offsetY of [88, 86, 89, 87, 90]) {
      act(() => result.current.handleScroll(scrollTo(offsetY)));
      expect(result.current.showCollapsedHeader).toBe(true);
    }
  });

  it("gives the title back once the page is scrolled well clear of the top", () => {
    const { result } = renderHook(() => useCollapsedHeader());

    act(() => result.current.handleScroll(scrollTo(120)));
    act(() => result.current.handleScroll(scrollTo(40)));

    expect(result.current.showCollapsedHeader).toBe(false);
  });
});
