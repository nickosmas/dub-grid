/**
 * Motion tokens for the mobile app.
 *
 * Named `mobileMotionTokens` because `motionTokens` already exists in
 * `index.ts` and holds CSS duration *strings* for the web ("120ms"). These are
 * plain numbers and spring configs, which is what Reanimated wants.
 *
 * The iOS/Android split lives in the consuming hook, not here: iOS reads
 * `spring.*` and Android reads `duration` + `easing` and drives `withTiming`.
 * A spring on Android reads as un-Material; a flat cubic-bezier on iOS reads as
 * un-native. Same token set, two readers.
 */

export const mobileMotionTokens = {
  duration: {
    /** State flips that should feel instantaneous: checkbox, ripple onset. */
    instant: 100,
    /** Small local changes: chip selection, icon swap, tab indicator. */
    fast: 160,
    /** The default. Expand/collapse, list item entrance, most transitions. */
    base: 240,
    /** Larger surfaces travelling further: sheets, full-width panels. */
    slow: 320,
    /** Deliberate, attention-carrying motion. Use rarely. */
    slower: 480,
    /**
     * The sheet timings predate this file and are preserved to the millisecond:
     * `useSheetDragToDismiss` is covered by tests that assert on its behaviour,
     * and its feel is already tuned.
     */
    sheetIn: 260,
    sheetOut: 180,
    /**
     * One pass of the skeleton shimmer band across the window. Slower than
     * `slower` on purpose: this is ambient, not a transition, and anything
     * quicker reads as impatient under a load that may last seconds.
     */
    shimmerSweep: 1100,
    /**
     * The pause between sweeps. Without it the band is continuous and the
     * screen never settles; with it the shimmer reads as a repeating beat.
     */
    shimmerRest: 450,
  },

  /**
   * Reanimated `withSpring` configs. Damping ratios are chosen so only
   * `bouncy` overshoots; UI chrome that oscillates reads as broken rather than
   * lively.
   */
  spring: {
    /** Press feedback. Settles in ~120ms with no overshoot. */
    press: { damping: 26, stiffness: 420, mass: 0.7 },
    /** Segmented thumb, week strip, pagination dot. Quick and precise. */
    snappy: { damping: 22, stiffness: 300, mass: 0.9 },
    /** Sheets and other large surfaces. Softer arrival. */
    gentle: { damping: 28, stiffness: 180, mass: 1.0 },
    /** The only config that overshoots. Confirmation moments only. */
    bouncy: { damping: 14, stiffness: 220, mass: 0.9 },
  },

  /**
   * Cubic-bezier control points for `Easing.bezier(...)`, following Material 3's
   * emphasized family. Spread them: `Easing.bezier(...easing.standard)`.
   */
  easing: {
    /** Material 3 standard. The default for anything entering and settling. */
    standard: [0.2, 0.0, 0.0, 1.0],
    /** Entering the screen from off-canvas. */
    standardDecelerate: [0.0, 0.0, 0.0, 1.0],
    /** Leaving the screen. */
    standardAccelerate: [0.3, 0.0, 1.0, 1.0],
    emphasized: [0.2, 0.0, 0.0, 1.0],
    emphasizedDecelerate: [0.05, 0.7, 0.1, 1.0],
    emphasizedAccelerate: [0.3, 0.0, 0.8, 0.15],
    /** iOS-flavoured ease-out, for things on iOS that must not spring. */
    ios: [0.25, 0.1, 0.25, 1.0],
  },

  /** List entrance stagger. Capped so a long list doesn't ripple for seconds. */
  stagger: {
    list: 40,
    maxItems: 8,
  },

  /** Press affordance magnitudes. iOS scales; Android uses its ripple instead. */
  press: {
    scale: 0.97,
    /** Reduced-motion fallback: a stepped dim rather than a scale. */
    opacity: 0.9,
    /** Small circular targets need a deeper scale to register at all. */
    iconOnlyScale: 0.92,
  },
} as const;

export type MobileSpringName = keyof typeof mobileMotionTokens.spring;
export type MobileEasingName = keyof typeof mobileMotionTokens.easing;
export type MobileDurationName = keyof typeof mobileMotionTokens.duration;
/**
 * Structural, not the literal type of a specific named spring: consumers pass
 * these straight to `withSpring`, and a reduce-motion override needs to be able
 * to substitute its own values.
 */
export type MobileSpringConfig = {
  damping: number;
  stiffness: number;
  mass: number;
};
/** Tuple form so it can be spread straight into `Easing.bezier(...)`. */
export type MobileEasingCurve = readonly [number, number, number, number];

export function getMobileEasingCurve(name: MobileEasingName): MobileEasingCurve {
  return mobileMotionTokens.easing[name] as unknown as MobileEasingCurve;
}
