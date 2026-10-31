import { StyleSheet } from "react-native";
import { Host, Picker, Text } from "@expo/ui/swift-ui";
import { environment, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { useThemeMode } from "../providers/ThemeModeProvider";
import type { SegmentedSwitchProps } from "./SegmentedSwitch.types";

export type { SegmentedSwitchOption, SegmentedSwitchProps } from "./SegmentedSwitch.types";

/** UIKit's own segmented control, which iOS 26 draws in Liquid Glass. */
export function SegmentedSwitch<Value extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedSwitchProps<Value>) {
  const { resolvedTheme } = useThemeMode();

  return (
    <Host matchContents={{ vertical: true }} ignoreSafeArea="all" style={[styles.host, style]}>
      <Picker
        label={accessibilityLabel}
        selection={value}
        onSelectionChange={(next) => onChange(next as Value)}
        modifiers={[pickerStyle("segmented"), environment("colorScheme", resolvedTheme)]}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    alignSelf: "stretch",
    // UIKit's segmented control is 32pt. Laid out at that height from the start, a header holding it
    // doesn't grow after its first measurement, which left the page under it
    // padded for the shorter header.
    minHeight: 32,
  },
});
