import type { ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Platform, StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileRadii, mobileSpace } from "../theme/tokens";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

const IS_ANDROID = Platform.OS === "android";

/**
 * A section's title over its content. When the section opens a fuller screen
 * the title itself is the way in, as each platform draws it (owner,
 * 2026-10-31): iOS follows the title with a chevron, as Health and the App
 * Store do; Material puts an arrow at the trailing edge of the row. Neither
 * spells out "See all", which screen readers still hear.
 */
export function SectionHeading({
  title,
  titleStyle,
  onOpen,
  accessory,
}: {
  title: string;
  titleStyle: StyleProp<TextStyle>;
  onOpen?: () => void;
  /** Sits at the trailing edge, after the title. */
  accessory?: ReactNode;
}) {
  const mobileColors = useMobileColors();

  if (!onOpen) {
    return (
      <View style={styles.row}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={1}
          style={[titleStyle, styles.titleFill]}
        >
          {title}
        </Text>
        {accessory}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`See all: ${title}`}
        accessibilityRole="button"
        android_ripple={{ color: mobileColors.rippleNeutral }}
        hitSlop={{ top: 8, bottom: 8 }}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.link,
          IS_ANDROID && styles.linkFill,
          pressed && !IS_ANDROID && styles.linkPressed,
        ]}
      >
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={1}
          style={[titleStyle, styles.titleShrink]}
        >
          {title}
        </Text>
        {IS_ANDROID ? (
          <MaterialIcons color={mobileColors.textSecondary} name="arrow-forward" size={22} />
        ) : (
          <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={18} />
        )}
      </Pressable>
      {accessory}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.md,
  },
  titleFill: {
    flex: 1,
  },
  titleShrink: {
    flexShrink: 1,
  },
  // The title and its chevron press as one, with the row's rounded highlight
  // bleeding past them; the inset is given back so the title stays on the
  // gutter line.
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.xs,
    flexShrink: 1,
    borderRadius: mobileRadii.control,
    marginHorizontal: -mobileSpace.sm,
    paddingHorizontal: mobileSpace.sm,
    paddingVertical: mobileSpace.xs,
    overflow: "hidden",
  },
  linkFill: {
    flex: 1,
    justifyContent: "space-between",
    gap: mobileSpace.md,
  },
  linkPressed: {
    opacity: 0.55,
  },
});
