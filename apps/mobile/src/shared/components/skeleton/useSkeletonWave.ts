import { useEffect } from "react";
import { useWindowDimensions } from "react-native";
import {
  cancelAnimation,
  Easing,
  makeMutable,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useMotionPreference } from "../../motion/useMotionPreference";
import { mobileMotion } from "../../theme/tokens";

/**
 * The whole app's shimmer clock. One value, one loop.
 *
 * Module scope rather than a hook or a provider because the point is that
 * *every* skeleton block on screen shares a phase. A per-block `useSharedValue`
 * gave a screen of 17 blocks 17 independent 1200ms loops, which is what made
 * the old skeletons read as static noise rather than one surface loading.
 *
 * `makeMutable` is the sanctioned way to build a shared value outside a
 * component; `useSharedValue` cannot be called at module scope.
 */
const wave = makeMutable(0);

/** Ref-count of mounted blocks, so the loop stops when nothing is loading. */
let subscriberCount = 0;

const SWEEP_MS = mobileMotion.duration.shimmerSweep;
const REST_MS = mobileMotion.duration.shimmerRest;
const CYCLE_MS = SWEEP_MS + REST_MS;

/**
 * Where in the 0..1 cycle the band finishes crossing and the pause begins.
 *
 * The rest beat is folded into the interpolation rather than expressed as a
 * `withSequence`, which keeps the clock a single linear timing: a sequence has
 * to be restarted from 0 on every repetition, and getting that wrong leaves the
 * band frozen at the right edge.
 */
export const SKELETON_WAVE_HOLD_POINT = SWEEP_MS / CYCLE_MS;

/** Band width as a fraction of the window. Wide enough to feel like light. */
const BAND_WIDTH_RATIO = 0.55;

function startWave() {
  wave.value = 0;
  wave.value = withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1, false);
}

function stopWave() {
  cancelAnimation(wave);
  wave.value = 0;
}

/**
 * Subscribes to the shared shimmer clock for as long as the caller is mounted.
 *
 * Returns the clock plus the geometry a block needs to position the band in
 * *window* coordinates. Window coordinates are what make the band read as one
 * object crossing the page instead of a highlight repeated per block.
 *
 * The band travels horizontally only, so vertical scrolling can never desync
 * it and a block only ever has to know its own x.
 */
export function useSkeletonWave() {
  const { width: windowWidth } = useWindowDimensions();
  const { enabled: motionEnabled } = useMotionPreference();

  // Driving a free-running animation loop is external state, which is exactly
  // what an effect is for; the teardown is what stops the loop once the last
  // skeleton on screen unmounts.
  useEffect(() => {
    if (!motionEnabled) return undefined;

    subscriberCount += 1;
    if (subscriberCount === 1) startWave();

    return () => {
      subscriberCount -= 1;
      if (subscriberCount === 0) stopWave();
    };
  }, [motionEnabled]);

  const bandWidth = windowWidth * BAND_WIDTH_RATIO;

  return {
    wave,
    bandWidth,
    /** Band x at the start of a sweep: fully off the left edge of the window. */
    bandStartX: -bandWidth,
    /** Band x at the end: fully off the right edge. */
    bandEndX: windowWidth + bandWidth,
    enabled: motionEnabled,
  };
}

/** Test seam: the loop is module state, so suites have to be able to reset it. */
export function resetSkeletonWaveForTests() {
  subscriberCount = 0;
  stopWave();
}

/** Test seam: asserts the loop is ref-counted rather than restarted per block. */
export function getSkeletonWaveSubscriberCount() {
  return subscriberCount;
}
