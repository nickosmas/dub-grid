import { useEffect, useMemo, useState } from "react";
import { runOnJS, useAnimatedReaction, useSharedValue, withTiming } from "react-native-reanimated";
import { mobileMotion } from "../theme/tokens";
import { useMotionPreference } from "./useMotionPreference";

/**
 * How long a figure or meter takes to reach its value. Long enough to read as
 * the data arriving, short enough that nobody waits on it.
 */
export const DATA_REVEAL_MS = mobileMotion.duration.slower + 120;

/**
 * A whole number that counts to `value` from zero when it first shows, and
 * from its last value when it changes, on the same curve as `AnimatedMeterFill`.
 * Give the text tabular figures so its width holds while it counts, and
 * announce `value` itself to assistive tech rather than the frame on screen.
 * Under reduce-motion it returns `value` straight away.
 */
export function useAnimatedCount(value: number): number {
  const { enabled, timing } = useMotionPreference();
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const [display, setDisplay] = useState(enabled ? 0 : target);
  const progress = useSharedValue(enabled ? 0 : target);
  const config = useMemo(() => timing("emphasizedDecelerate", DATA_REVEAL_MS), [timing]);

  useEffect(() => {
    progress.value = withTiming(target, config);
  }, [config, progress, target]);

  useAnimatedReaction(
    () => Math.round(progress.value),
    (current, previous) => {
      if (current !== previous) runOnJS(setDisplay)(current);
    },
  );

  return display;
}
