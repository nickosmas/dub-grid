import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ enabled: true }));

// The shared harness rather than a bare `useWindowDimensions` stub: the
// Reanimated stub this module pulls in imports View/Text/etc from react-native,
// and the mock proxy throws on any export a partial mock leaves out.
vi.mock("react-native", async () => {
  const { createReactNativeModule } = await import("../../../test/native");
  return createReactNativeModule(await import("react"));
});

vi.mock("../../motion/useMotionPreference", () => ({
  useMotionPreference: () => ({
    enabled: motion.enabled,
    d: (ms: number) => (motion.enabled ? ms : 0),
    spring: () => ({ damping: 1, stiffness: 1, mass: 1 }),
    timing: (_name: string, ms: number) => ({ duration: ms, easing: (t: number) => t }),
  }),
}));

let useSkeletonWave: (typeof import("./useSkeletonWave"))["useSkeletonWave"];
let getSkeletonWaveSubscriberCount: (typeof import("./useSkeletonWave"))["getSkeletonWaveSubscriberCount"];
let resetSkeletonWaveForTests: (typeof import("./useSkeletonWave"))["resetSkeletonWaveForTests"];

beforeEach(async () => {
  const module = await import("./useSkeletonWave");
  useSkeletonWave = module.useSkeletonWave;
  getSkeletonWaveSubscriberCount = module.getSkeletonWaveSubscriberCount;
  resetSkeletonWaveForTests = module.resetSkeletonWaveForTests;
  resetSkeletonWaveForTests();
  motion.enabled = true;
});

afterEach(() => {
  resetSkeletonWaveForTests();
});

describe("useSkeletonWave", () => {
  it("runs one clock for however many blocks are mounted", () => {
    const first = renderHook(() => useSkeletonWave());
    expect(getSkeletonWaveSubscriberCount()).toBe(1);

    const second = renderHook(() => useSkeletonWave());
    const third = renderHook(() => useSkeletonWave());

    // The point of the shared clock: every block sweeps in phase, because
    // there is only ever one value driving them.
    expect(getSkeletonWaveSubscriberCount()).toBe(3);
    expect(second.result.current.wave).toBe(first.result.current.wave);
    expect(third.result.current.wave).toBe(first.result.current.wave);
  });

  it("stops once the last skeleton unmounts", () => {
    const first = renderHook(() => useSkeletonWave());
    const second = renderHook(() => useSkeletonWave());

    first.unmount();
    expect(getSkeletonWaveSubscriberCount()).toBe(1);

    second.unmount();
    expect(getSkeletonWaveSubscriberCount()).toBe(0);
  });

  it("never starts under reduce motion", () => {
    motion.enabled = false;

    const { result } = renderHook(() => useSkeletonWave());

    expect(result.current.enabled).toBe(false);
    expect(getSkeletonWaveSubscriberCount()).toBe(0);
  });

  it("sizes the band and its travel from the window, not the block", () => {
    const { result } = renderHook(() => useSkeletonWave());

    // A band measured against the window is what lets every block render its
    // slice of one continuous sweep rather than a highlight of its own.
    expect(result.current.bandWidth).toBeCloseTo(390 * 0.55);
    expect(result.current.bandStartX).toBeCloseTo(-result.current.bandWidth);
    expect(result.current.bandEndX).toBeCloseTo(390 + result.current.bandWidth);
  });
});
