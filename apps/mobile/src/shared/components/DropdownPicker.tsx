import type { SegmentedSwitchProps } from "./SegmentedSwitch.types";
import { SegmentedSwitch } from "./SegmentedSwitch";

/**
 * A choice of a few views in one button. iOS draws a native menu picker; elsewhere,
 * where no layout uses it yet, it stays the segmented switch.
 */
export function DropdownPicker<Value extends string>(props: SegmentedSwitchProps<Value>) {
  return <SegmentedSwitch {...props} />;
}
