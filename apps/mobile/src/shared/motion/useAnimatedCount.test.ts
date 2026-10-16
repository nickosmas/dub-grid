import { renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const reducedMotion = vi.fn(() => false);
const withTimingCalls: Array<{ toValue: unknown; config: { duration: number } }> = [];

vi.mock("react-native-reanimated", async () => {
  const actual = await vi.importActual<typeof import("../../test/reanimated-stub")>(
    "../../test/reanimated-stub",
  );
  return {
    ...actual,
    useReducedMotion: () => reducedMotion(),
    withTiming: (toValue: unknown, config: { duration: number }) => {
      withTimingCalls.push({ toValue, config });
      return toValue;
    },
  };
});

let useAnimatedCount: (typeof import("./useAnimatedCount"))["useAnimatedCount"];
let DATA_REVEAL_MS: number;

beforeAll(async () => {
  ({ useAnimatedCount, DATA_REVEAL_MS } = await import("./useAnimatedCount"));
});

afterEach(() => {
  reducedMotion.mockReturnValue(false);
  withTimingCalls.length = 0;
});

describe("useAnimatedCount", () => {
  it("animates to the value over the data-reveal duration and lands on it", () => {
    const { result } = renderHook(() => useAnimatedCount(42));

    expect(withTimingCalls.at(-1)).toMatchObject({
      toValue: 42,
      config: { duration: DATA_REVEAL_MS },
    });
    expect(result.current).toBe(42);
  });

  it("follows a changed value", () => {
    const { result, rerender } = renderHook(({ value }) => useAnimatedCount(value), {
      initialProps: { value: 3 },
    });

    rerender({ value: 7 });

    expect(withTimingCalls.at(-1)?.toValue).toBe(7);
    expect(result.current).toBe(7);
  });

  // A count is a whole number of people or shifts; a fractional input must
  // never show a fractional frame.
  it("rounds to a whole number and treats a non-finite value as zero", () => {
    expect(renderHook(() => useAnimatedCount(4.6)).result.current).toBe(5);
    expect(renderHook(() => useAnimatedCount(Number.NaN)).result.current).toBe(0);
  });

  it("starts on the value with no duration when reduce motion is on", () => {
    reducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useAnimatedCount(18));

    expect(result.current).toBe(18);
    expect(withTimingCalls.at(-1)?.config.duration).toBe(0);
  });
});
