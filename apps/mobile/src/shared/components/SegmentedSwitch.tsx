import { View } from "react-native";
import { SegmentedControl } from "./SegmentedControl";
import type { SegmentedSwitchProps } from "./SegmentedSwitch.types";

export type { SegmentedSwitchOption, SegmentedSwitchProps } from "./SegmentedSwitch.types";

/** DubGrid's segmented control, stretched to its row, on both phones. */
export function SegmentedSwitch<Value extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedSwitchProps<Value>) {
  return (
    <View style={style}>
      <SegmentedControl
        accessibilityLabel={accessibilityLabel}
        options={options.map((option) => ({ value: option.value, label: option.label }))}
        stretch
        value={value}
        onChange={onChange}
      />
    </View>
  );
}
