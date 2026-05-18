import * as React from "react";
import { ScrollView, View, Text } from "react-native";

const passthroughComponent = (Component: React.ComponentType<any>) => {
  return React.forwardRef<unknown, Record<string, unknown>>(
    function PassthroughComponent({ entering, exiting, ...rest }, ref) {
      void entering;
      void exiting;
      return React.createElement(Component as never, { ref, ...rest });
    },
  );
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
  return { value: initial };
}

export function useAnimatedScrollHandler() {
  return () => undefined;
}

export function useAnimatedStyle<T>(factory: () => T) {
  return factory();
}

export function interpolate(
  _value: number,
  _input: readonly number[],
  output: readonly number[],
) {
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
