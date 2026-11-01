import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileSpace, mobileText, type MobileColors } from "../theme/tokens";
import { Button } from "./Button";
import { Text } from "./Text";

/** SwiftUI's ContentUnavailableView draws its symbol at about this size. */
export const CONTENT_UNAVAILABLE_ICON_SIZE = 48;

type ContentUnavailableAction = {
  label: string;
  onPress: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
};

/**
 * A page that has nothing to show, drawn the way iOS's ContentUnavailableView
 * and Material's empty state do: a plain symbol in the secondary colour (no
 * disc behind it), a title, a description, then at most one prominent action
 * with a plain text action under it.
 */
export function ContentUnavailable({
  iconName,
  title,
  body,
  children,
  primaryAction,
  secondaryAction,
  style,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  /** Extra description lines, under the body. */
  children?: ReactNode;
  primaryAction?: ContentUnavailableAction;
  secondaryAction?: ContentUnavailableAction;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createContentUnavailableStyles(mobileColors), [mobileColors]);

  return (
    <View style={[styles.root, style]}>
      <Ionicons
        color={mobileColors.textSubtle}
        name={iconName}
        size={CONTENT_UNAVAILABLE_ICON_SIZE}
      />
      <View style={styles.copy}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.title}>
          {title}
        </Text>
        {body ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.body}>
            {body}
          </Text>
        ) : null}
        {children}
      </View>
      {primaryAction || secondaryAction ? (
        <View style={styles.actions}>
          {primaryAction ? (
            <Button
              disabled={primaryAction.disabled}
              fullWidth={false}
              label={primaryAction.label}
              loading={primaryAction.loading}
              onPress={primaryAction.onPress}
              tone="primary"
            />
          ) : null}
          {secondaryAction ? (
            <Button
              disabled={secondaryAction.disabled}
              fullWidth={false}
              label={secondaryAction.label}
              loading={secondaryAction.loading}
              onPress={secondaryAction.onPress}
              tone="link"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const createContentUnavailableStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      alignItems: "center",
      gap: mobileSpace.lg,
    },
    copy: {
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    title: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
      textAlign: "center",
    },
    body: {
      ...mobileText.body,
      color: mobileColors.textSubtle,
      textAlign: "center",
      maxWidth: 320,
    },
    actions: {
      alignItems: "center",
      gap: mobileSpace.sm,
      marginTop: mobileSpace.sm,
    },
  });
