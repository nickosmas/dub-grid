import { SegmentedControl } from "./SegmentedControl";
import type { SegmentedSwitchProps } from "./SegmentedSwitch.types";

export type { SegmentedSwitchOption, SegmentedSwitchProps } from "./SegmentedSwitch.types";

export function SegmentedSwitch<Value extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedSwitchProps<Value>) {
  return (
    <SegmentedControl
      accessibilityLabel={accessibilityLabel}
      options={options.map((option) => ({ value: option.value, label: option.label }))}
      stretch
      value={value}
      onChange={onChange}
    />
  );
}
