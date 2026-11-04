import { act, renderHook } from "@testing-library/react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { describe, expect, it } from "vitest";
import { useLargeTitleCollapse } from "./useLargeTitleCollapse";

const at = (y: number) =>
  ({ nativeEvent: { contentOffset: { x: 0, y } } }) as NativeSyntheticEvent<NativeScrollEvent>;

describe("useLargeTitleCollapse", () => {
  it("stays expanded until the page has scrolled a title's height past where it rests", () => {
    const { result } = renderHook(() => useLargeTitleCollapse());
    act(() => result.current.onScrollBeginDrag(at(-228)));
    act(() => result.current.onScroll(at(-200)));
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.onScroll(at(-150)));
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.onScroll(at(-220)));
    expect(result.current.collapsed).toBe(false);
  });

  it("measures from the highest resting point, not a drag begun mid-page", () => {
    const { result } = renderHook(() => useLargeTitleCollapse());
    act(() => result.current.onScrollBeginDrag(at(-100)));
    act(() => result.current.onScrollBeginDrag(at(-228)));
    act(() => result.current.onScroll(at(-200)));
    expect(result.current.collapsed).toBe(false);
  });

  it("does nothing before the first drag tells it where the page rests", () => {
    const { result } = renderHook(() => useLargeTitleCollapse());
    act(() => result.current.onScroll(at(500)));
    expect(result.current.collapsed).toBe(false);
  });
});
