import type { StyleProp, ViewStyle } from "react-native";

export type SegmentedSwitchOption<Value extends string> = {
  value: Value;
  label: string;
};

/**
 * A switch between a few views of one screen. Each phone draws its own control:
 * SwiftUI's segmented picker on iOS and Material 3 segmented buttons on
 * Android. The base file draws `SegmentedControl` for web and tests.
 */
export type SegmentedSwitchProps<Value extends string> = {
  options: ReadonlyArray<SegmentedSwitchOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};
