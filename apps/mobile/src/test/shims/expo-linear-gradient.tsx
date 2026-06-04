// Test shim for expo-linear-gradient. The real package's native color
// processing (processColor, native view manager) can't be parsed/run by vitest
// in jsdom, so render a plain View and drop the gradient-only props.
import * as React from "react";
import { View } from "react-native";

type LinearGradientProps = {
  colors?: unknown;
  locations?: unknown;
  start?: unknown;
  end?: unknown;
  children?: React.ReactNode;
  [key: string]: unknown;
};

export function LinearGradient({
  colors: _colors,
  locations: _locations,
  start: _start,
  end: _end,
  ...rest
}: LinearGradientProps) {
  return React.createElement(View, rest);
}

export default LinearGradient;
