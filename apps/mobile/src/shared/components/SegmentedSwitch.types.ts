import type { StyleProp, ViewStyle } from "react-native";

export type SegmentedSwitchOption<Value extends string> = {
  value: Value;
  label: string;
};

/** A switch between a few views of one screen. */
export type SegmentedSwitchProps<Value extends string> = {
  options: ReadonlyArray<SegmentedSwitchOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};
