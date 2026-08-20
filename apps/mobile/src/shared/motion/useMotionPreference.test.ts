import { renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mobileMotion } from "../theme/tokens";

const reducedMotion = vi.fn(() => false);

vi.mock("react-native-reanimated", async () => {
  const actual = await vi.importActual<typeof import("../../test/reanimated-stub")>(
    "../../test/reanimated-stub",
  );
  return { ...actual, useReducedMotion: () => reducedMotion() };
});

let useMotionPreference: (typeof import("./useMotionPreference"))["useMotionPreference"];

beforeAll(async () => {
  useMotionPreference = (await import("./useMotionPreference")).useMotionPreference;
});

afterEach(() => {
  reducedMotion.mockReturnValue(false);
});

describe("useMotionPreference", () => {
  it("passes durations through when motion is allowed", () => {
    const { result } = renderHook(() => useMotionPreference());

    expect(result.current.enabled).toBe(true);
    expect(result.current.d(240)).toBe(240);
  });

  // The single choke point: every duration in the app routes through `d`, so
  // collapsing it to zero is what makes reduce-motion apply everywhere at once.
  it("collapses every duration to zero when reduce motion is on", () => {
    reducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotionPreference());

    expect(result.current.enabled).toBe(false);
    expect(result.current.d(240)).toBe(0);
    expect(result.current.d(1200)).toBe(0);
    expect(result.current.timing("standard", 320).duration).toBe(0);
  });

  it("returns the named spring config", () => {
    const { result } = renderHook(() => useMotionPreference());
    expect(result.current.spring("snappy")).toEqual(mobileMotion.spring.snappy);
  });

  it("substitutes a near-instant spring under reduce motion", () => {
    reducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotionPreference());
    const spring = result.current.spring("bouncy");

    expect(spring).not.toEqual(mobileMotion.spring.bouncy);
    // Overdamped and very stiff: arrives with no visible travel or overshoot.
    expect(spring.damping).toBeGreaterThan(mobileMotion.spring.bouncy.damping);
    expect(spring.stiffness).toBeGreaterThan(mobileMotion.spring.bouncy.stiffness);
  });

  it("pairs an easing curve with the gated duration", () => {
    const { result } = renderHook(() => useMotionPreference());
    const config = result.current.timing("emphasized", mobileMotion.duration.base);

    expect(config.duration).toBe(mobileMotion.duration.base);
    expect(typeof config.easing).toBe("function");
  });
});
