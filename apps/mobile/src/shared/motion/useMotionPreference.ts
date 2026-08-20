import { useCallback, useMemo } from "react";
import { Easing, useReducedMotion } from "react-native-reanimated";
import {
  mobileEasingCurve,
  mobileMotion,
  type MobileEasingName,
  type MobileSpringConfig,
  type MobileSpringName,
} from "../theme/tokens";

export type MotionPreference = {
  /** False when the OS reduce-motion setting is on. */
  enabled: boolean;
  /**
   * Duration gate. Returns 0 when motion is reduced, which collapses any
   * `withTiming` into an instant set.
   *
   * Route every duration through this rather than branching at the call site:
   * one choke point is why reduce-motion can be honored app-wide instead of in
   * the one component that remembered to check.
   */
  d: (ms: number) => number;
  /** A named spring config, or an instant one when motion is reduced. */
  spring: (name: MobileSpringName) => MobileSpringConfig;
  /** A named easing curve paired with a gated duration. */
  timing: (
    name: MobileEasingName,
    ms: number,
  ) => { duration: number; easing: ReturnType<typeof Easing.bezier> };
};

/**
 * Reduce-motion honoured once, for everything.
 *
 * Before this, `Skeleton` was the only component in the app that checked the
 * setting at all.
 *
 * **Call `d`/`spring`/`timing` on the JS thread only, never inside a worklet.**
 * They are plain functions, and Reanimated serializes a captured non-worklet
 * function as a remote-function *object* — so invoking one inside a
 * `useAnimatedStyle` body throws `timing is not a function (it is Object)` on
 * the UI thread and takes the whole app down. Resolve the config during render
 * and let the worklet close over the resulting value:
 *
 * ```tsx
 * const config = useMemo(() => timing("emphasized", 200), [timing]);
 * const style = useAnimatedStyle(() => ({ opacity: withTiming(1, config) }), [config]);
 * ```
 */
export function useMotionPreference(): MotionPreference {
  const reducedMotion = useReducedMotion();
  const enabled = !reducedMotion;

  const d = useCallback((ms: number) => (enabled ? ms : 0), [enabled]);

  const spring = useCallback(
    (name: MobileSpringName) =>
      enabled
        ? mobileMotion.spring[name]
        : // Critically damped and very stiff: arrives immediately with no
          // visible travel, while still being a spring so callers don't branch.
          { damping: 100, stiffness: 1000, mass: 0.1 },
    [enabled],
  );

  const timing = useCallback(
    (name: MobileEasingName, ms: number) => ({
      duration: d(ms),
      easing: Easing.bezier(...mobileEasingCurve(name)),
    }),
    [d],
  );

  return useMemo(() => ({ enabled, d, spring, timing }), [enabled, d, spring, timing]);
}
