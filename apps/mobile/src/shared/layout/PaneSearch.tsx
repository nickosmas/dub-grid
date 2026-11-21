import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { NativeSearchField } from "../../../modules/search-field";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileInputText,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

/** UIKit's search field height. */
const NATIVE_SEARCH_HEIGHT = 36;

/**
 * A list pane's search in a split view, above the list: the navigation bar's
 * search would span both panes. On iOS it is UIKit's own search field; where
 * that isn't built in, a field drawn to match.
 */
export function PaneSearch({
  placeholder,
  onChange,
}: {
  placeholder: string;
  onChange: (text: string) => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  if (NativeSearchField) {
    return (
      <NativeSearchField
        accessibilityLabel={placeholder}
        onChangeText={(event) => onChange(event.nativeEvent.text)}
        placeholder={placeholder}
        style={styles.native}
      />
    );
  }

  return (
    <View style={styles.drawn}>
      <Ionicons color={mobileColors.textSubtle} name="search" size={18} />
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={mobileColors.textSubtle}
        returnKeyType="search"
        style={[styles.input, mobileInputText()]}
      />
    </View>
  );
}

function createStyles(mobileColors: MobileColors) {
  return StyleSheet.create({
    native: {
      height: NATIVE_SEARCH_HEIGHT,
    },
    drawn: {
      alignItems: "center",
      backgroundColor: mobileColors.surfaceMuted,
      borderRadius: mobileRadii.control,
      flexDirection: "row",
      gap: mobileSpace.sm,
      minHeight: 40,
      paddingHorizontal: mobileSpace.md,
    },
    input: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
      flex: 1,
      paddingVertical: mobileSpace.sm,
    },
  });
}
