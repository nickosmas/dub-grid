import { StyleSheet } from "react-native";
import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { useMobileColors, useThemeMode } from "../providers/ThemeModeProvider";
import type { SegmentedSwitchProps } from "./SegmentedSwitch.types";

export type { SegmentedSwitchOption, SegmentedSwitchProps } from "./SegmentedSwitch.types";

/** Material 3 segmented buttons, in DubGrid's brand colors rather than the wallpaper's. */
export function SegmentedSwitch<Value extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedSwitchProps<Value>) {
  const mobileColors = useMobileColors();
  const { resolvedTheme } = useThemeMode();
  const colors = {
    activeContainerColor: mobileColors.brandSoft,
    activeContentColor: mobileColors.brand,
    activeBorderColor: mobileColors.brandBorder,
    inactiveContainerColor: mobileColors.surface,
    inactiveContentColor: mobileColors.textPrimary,
    inactiveBorderColor: mobileColors.border,
  };

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={resolvedTheme}
      style={[styles.host, style]}
    >
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {options.map((option) => (
          <SegmentedButton
            key={option.value}
            selected={option.value === value}
            onClick={() => onChange(option.value)}
            colors={colors}
          >
            <SegmentedButton.Label>
              <Text>{option.label}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    alignSelf: "stretch",
    // Material's segmented buttons are 40dp. Laid out at that height from the start, a header holding it
    // doesn't grow after its first measurement, which left the page under it
    // padded for the shorter header.
    minHeight: 40,
  },
});
