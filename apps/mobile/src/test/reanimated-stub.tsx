import * as React from "react";
import { ScrollView, View, Text } from "react-native";

const passthroughComponent = (Component: React.ComponentType<any>) => {
  return React.forwardRef<unknown, Record<string, unknown>>(function PassthroughComponent(
    { entering, exiting, ...rest },
    ref,
  ) {
    void entering;
    void exiting;
    return React.createElement(Component as never, { ref, ...rest });
  });
};

const AnimatedView = passthroughComponent(View);
const AnimatedText = passthroughComponent(Text);
const AnimatedScrollView = passthroughComponent(ScrollView);

const noopAnimation = {
  duration: () => noopAnimation,
  delay: () => noopAnimation,
  springify: () => noopAnimation,
  damping: () => noopAnimation,
  easing: () => noopAnimation,
};

export const FadeIn = noopAnimation;
export const FadeOut = noopAnimation;
export const FadeInDown = noopAnimation;
export const FadeInUp = noopAnimation;
export const FadeOutDown = noopAnimation;
export const FadeOutUp = noopAnimation;
export const SlideInRight = noopAnimation;
export const SlideInLeft = noopAnimation;
export const SlideOutRight = noopAnimation;
export const SlideOutLeft = noopAnimation;

export function useSharedValue<T>(initial: T) {
  return React.useRef({ value: initial }).current;
}

export function useAnimatedRef<T>() {
  return React.useRef<T | null>(null);
}

export function useReducedMotion() {
  return false;
}

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
  out: (fn: unknown) => fn,
  ease: () => 0,
  linear: () => 0,
  quad: () => 0,
  cubic: () => 0,
} as const;

export const Extrapolation = {
  EXTEND: "extend",
  CLAMP: "clamp",
  IDENTITY: "identity",
} as const;

export function cancelAnimation(_sharedValue: unknown) {
  return undefined;
}

export function runOnJS<Args extends unknown[], Return>(fn: (...args: Args) => Return) {
  return fn;
}

// Returned as-is so tests can drive it with a synthetic scroll event, the way
// they drive a captured gesture's handlers.
export function useAnimatedScrollHandler<T>(handler: T) {
  return handler;
}

export function useAnimatedStyle<T>(factory: () => T) {
  return factory();
}

export function interpolate(_value: number, _input: readonly number[], output: readonly number[]) {
  return output[0];
}

export function interpolateColor(
  _value: number,
  _input: readonly number[],
  output: readonly string[],
) {
  return output[0];
}

const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  ScrollView: AnimatedScrollView,
  createAnimatedComponent: passthroughComponent,
};

export default Animated;
