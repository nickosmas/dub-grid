import * as React from "react";
import { Image, Pressable, ScrollView, View, Text } from "react-native";

// Only wrap primitives that `src/test/native.tsx` also exports. That module is
// a deliberately partial react-native emulation which most screen tests swap in
// via `vi.mock("react-native", ...)`, and vitest's mock proxy *throws* on
// accessing an undefined export, so wrapping e.g. FlatList here would break
// collection for every file that transitively imports Reanimated.
const passthroughComponent = (Component: React.ComponentType<any>) => {
  return React.forwardRef<unknown, Record<string, unknown>>(function PassthroughComponent(
    { entering, exiting, layout, animatedProps, ...rest },
    ref,
  ) {
    void entering;
    void exiting;
    void layout;
    // `useAnimatedProps` resolves to a plain object in this stub, so spreading
    // it here keeps `animatedProps={...}` observable to tests.
    return React.createElement(Component as never, {
      ref,
      ...(animatedProps as Record<string, unknown> | undefined),
      ...rest,
    });
  });
};

const AnimatedView = passthroughComponent(View);
const AnimatedText = passthroughComponent(Text);
const AnimatedScrollView = passthroughComponent(ScrollView);
const AnimatedImage = passthroughComponent(Image);
const AnimatedPressable = passthroughComponent(Pressable);

type NoopAnimation = Record<string, (...args: unknown[]) => NoopAnimation>;

// Entering/exiting/layout animation builders are chainable and their return
// value is only ever handed to a component prop the passthrough drops, so every
// method can return the same object.
const NOOP_ANIMATION_METHODS = [
  "build",
  "damping",
  "delay",
  "duration",
  "easing",
  "mass",
  "randomDelay",
  "reduceMotion",
  "restDisplacementThreshold",
  "restSpeedThreshold",
  "rotate",
  "springify",
  "stiffness",
  "withCallback",
  "withInitialValues",
] as const;

function createNoopAnimation(): NoopAnimation {
  const animation = {} as NoopAnimation;
  for (const method of NOOP_ANIMATION_METHODS) {
    animation[method] = () => animation;
  }
  return animation;
}

const noopAnimation = createNoopAnimation();

export const FadeIn = noopAnimation;
export const FadeOut = noopAnimation;
export const FadeInDown = noopAnimation;
export const FadeInUp = noopAnimation;
export const FadeInLeft = noopAnimation;
export const FadeInRight = noopAnimation;
export const FadeOutDown = noopAnimation;
export const FadeOutUp = noopAnimation;
export const FadeOutLeft = noopAnimation;
export const FadeOutRight = noopAnimation;
export const SlideInRight = noopAnimation;
export const SlideInLeft = noopAnimation;
export const SlideInUp = noopAnimation;
export const SlideInDown = noopAnimation;
export const SlideOutRight = noopAnimation;
export const SlideOutLeft = noopAnimation;
export const SlideOutUp = noopAnimation;
export const SlideOutDown = noopAnimation;
export const ZoomIn = noopAnimation;
export const ZoomOut = noopAnimation;
export const Layout = noopAnimation;
export const LinearTransition = noopAnimation;
export const CurvedTransition = noopAnimation;
export const JumpingTransition = noopAnimation;
export const SequencedTransition = noopAnimation;

export function useSharedValue<T>(initial: T) {
  return React.useRef({ value: initial }).current;
}

/**
 * Module-scope shared values, for state that outlives any one component (the
 * app-wide skeleton shimmer clock). Same plain-object shape `useSharedValue`
 * resolves to here, so tests can read `.value` off either.
 */
export function makeMutable<T>(initial: T) {
  return { value: initial };
}

export function useAnimatedRef<T>() {
  return React.useRef<T | null>(null);
}

export function useReducedMotion() {
  return false;
}

export const ReduceMotion = {
  System: "system",
  Always: "always",
  Never: "never",
} as const;

export function withTiming<T>(
  toValue: T,
  _config?: unknown,
  callback?: (finished: boolean) => void,
) {
  // Resolve immediately: tests that assert what happens *after* an animation
  // (a sheet dragged past its dismiss threshold) have no frames to wait for.
  callback?.(true);
  return toValue;
}

export function withSpring<T>(
  toValue: T,
  _config?: unknown,
  callback?: (finished: boolean) => void,
) {
  callback?.(true);
  return toValue;
}

export function withDecay<T>(_config: unknown, callback?: (finished: boolean) => void) {
  callback?.(true);
  return 0 as unknown as T;
}

export function withSequence<T>(...values: readonly T[]) {
  return values[values.length - 1] as T;
}

export function withRepeat<T>(value: T, _numberOfReps?: number, _reverse?: boolean) {
  return value;
}

export function withDelay<T>(_delay: number, value: T) {
  return value;
}

export const Easing = {
  inOut: (fn: unknown) => fn,
  in: (fn: unknown) => fn,
  out: (fn: unknown) => fn,
  bezier: () => (t: number) => t,
  ease: () => 0,
  linear: () => 0,
  quad: () => 0,
  cubic: () => 0,
  poly: () => () => 0,
  sin: () => 0,
  circle: () => 0,
  exp: () => 0,
  elastic: () => () => 0,
  back: () => () => 0,
  bounce: () => 0,
} as const;

export const Extrapolation = {
  EXTEND: "extend",
  CLAMP: "clamp",
  IDENTITY: "identity",
} as const;

/** Pre-v3 alias, still used by some Reanimated docs and call sites. */
export const Extrapolate = Extrapolation;

export function cancelAnimation(_sharedValue: unknown) {
  return undefined;
}

export function runOnJS<Args extends unknown[], Return>(fn: (...args: Args) => Return) {
  return fn;
}

export function runOnUI<Args extends unknown[], Return>(fn: (...args: Args) => Return) {
  return fn;
}

export function measure() {
  return { x: 0, y: 0, width: 0, height: 100, pageX: 0, pageY: 0 };
}

export function scrollTo() {
  return undefined;
}

export function clamp(value: number, lowerBound: number, upperBound: number) {
  return Math.min(Math.max(value, lowerBound), upperBound);
}

// Returned as-is so tests can drive it with a synthetic scroll event, the way
// they drive a captured gesture's handlers.
export function useAnimatedScrollHandler<T>(handler: T) {
  return handler;
}

export function useAnimatedStyle<T>(factory: () => T) {
  return factory();
}

export function useAnimatedProps<T>(factory: () => T) {
  return factory();
}

export function useDerivedValue<T>(factory: () => T) {
  return { value: factory() };
}

export function useAnimatedReaction<T>(
  prepare: () => T,
  react: (current: T, previous: T | null) => void,
) {
  React.useEffect(() => {
    react(prepare(), null);
  });
}

type ExtrapolationType = (typeof Extrapolation)[keyof typeof Extrapolation];

function extrapolate(
  value: number,
  edge: number,
  edgeOutput: number,
  neighbour: number,
  neighbourOutput: number,
  type: ExtrapolationType,
) {
  if (type === Extrapolation.CLAMP) return edgeOutput;
  if (type === Extrapolation.IDENTITY) return value;
  if (edge === neighbour) return edgeOutput;
  return edgeOutput + ((value - edge) * (neighbourOutput - edgeOutput)) / (neighbour - edge);
}

function resolveExtrapolation(
  config:
    | ExtrapolationType
    | { extrapolateLeft?: ExtrapolationType; extrapolateRight?: ExtrapolationType }
    | undefined,
  side: "left" | "right",
): ExtrapolationType {
  if (typeof config === "string") return config;
  if (config)
    return (
      (side === "left" ? config.extrapolateLeft : config.extrapolateRight) ?? Extrapolation.EXTEND
    );
  return Extrapolation.EXTEND;
}

/**
 * A real multi-stop linear interpolation, not a "return the first output stop"
 * placeholder. Anything driven off a scroll position or a press progress (slide
 * parallax, press scale) renders at its *starting* transform under a stubbed
 * `output[0]`, which silently makes those tests assert nothing.
 */
export function interpolate(
  value: number,
  input: readonly number[],
  output: readonly number[],
  extrapolation?: Parameters<typeof resolveExtrapolation>[0],
): number {
  if (input.length === 0 || output.length === 0) return 0;
  if (input.length === 1) return output[0];

  if (value <= input[0]) {
    return extrapolate(
      value,
      input[0],
      output[0],
      input[1],
      output[1],
      resolveExtrapolation(extrapolation, "left"),
    );
  }

  const last = input.length - 1;
  if (value >= input[last]) {
    return extrapolate(
      value,
      input[last],
      output[last],
      input[last - 1],
      output[last - 1],
      resolveExtrapolation(extrapolation, "right"),
    );
  }

  for (let index = 1; index <= last; index += 1) {
    if (value > input[index]) continue;

    const spanStart = input[index - 1];
    const spanEnd = input[index];
    if (spanEnd === spanStart) return output[index];

    const progress = (value - spanStart) / (spanEnd - spanStart);
    return output[index - 1] + progress * (output[index] - output[index - 1]);
  }

  return output[last];
}

/**
 * Colors can't be blended without parsing every supported color format, so pick
 * the nearest stop instead. That's enough for tests to distinguish "active" from
 * "inactive", which is all any assertion here needs.
 */
export function interpolateColor(
  value: number,
  input: readonly number[],
  output: readonly string[],
): string {
  if (input.length === 0 || output.length === 0) return output[0];

  const position = interpolate(
    value,
    input as number[],
    input.map((_, index) => index),
    Extrapolation.CLAMP,
  );

  return output[Math.min(Math.round(position), output.length - 1)];
}

const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  ScrollView: AnimatedScrollView,
  Image: AnimatedImage,
  Pressable: AnimatedPressable,
  createAnimatedComponent: passthroughComponent,
};

export default Animated;
