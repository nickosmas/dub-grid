import { StyleSheet } from "react-native";
import { HStack, Host, Image, Menu, Picker, Text } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  environment,
  frame,
  imageScale,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { useThemeMode } from "../providers/ThemeModeProvider";
import type { SegmentedSwitchProps } from "./SegmentedSwitch.types";

/**
 * Calendar's view choice: a glass button naming the chosen view with up and
 * down chevrons, opening a native menu that ticks it. A menu rather than a
 * menu-style picker, whose button ignores the control size, so it can stand
 * as tall as a segmented control beside it.
 */
export function DropdownPicker<Value extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
  size = "regular",
}: SegmentedSwitchProps<Value>) {
  const { resolvedTheme } = useThemeMode();
  const chosen = options.find((option) => option.value === value)?.label ?? value;

  return (
    <Host matchContents ignoreSafeArea="all" style={[styles.host, style]}>
      <Menu
        label={
          <HStack
            modifiers={size === "large" ? [frame({ height: LARGE_LABEL_HEIGHT })] : []}
            spacing={6}
          >
            <Text>{chosen}</Text>
            <Image modifiers={[imageScale("small")]} systemName="chevron.up.chevron.down" />
          </HStack>
        }
        modifiers={[
          buttonStyle("glass"),
          controlSize("regular"),
          environment("colorScheme", resolvedTheme),
        ]}
      >
        <Picker
          label={accessibilityLabel}
          selection={value}
          onSelectionChange={(next) => onChange(next as Value)}
        >
          {options.map((option) => (
            <Text key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </Text>
          ))}
        </Picker>
      </Menu>
    </Host>
  );
}

// A glass button's own size steps miss a large segmented control's height (37
// and 57pt against its 49), so a large one stands its label to that height.
const LARGE_LABEL_HEIGHT = 34;

const styles = StyleSheet.create({
  host: {
    alignSelf: "center",
  },
});
