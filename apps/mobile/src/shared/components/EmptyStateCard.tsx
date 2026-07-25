import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button } from "./Button";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../theme/tokens";

export function EmptyStateCard({
  iconName = "sparkles-outline",
  title,
  body,
  actionLabel,
  onAction,
  compact = false,
  fillScreen = false,
}: {
  iconName?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  fillScreen?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const compactStyles = useMemo(() => createCompactStyles(mobileColors), [mobileColors]);
  const variant = compact ? compactStyles : styles;
  const { height: windowHeight } = useWindowDimensions();
  const fillStyle =
    !compact && fillScreen
      ? {
          minHeight: Math.max(360, Math.min(520, windowHeight * 0.55)),
          justifyContent: "center" as const,
        }
      : null;
  return (
    <View style={[variant.card, fillStyle]}>
      <View style={variant.iconFrame}>
        <Ionicons color={mobileColors.brand} name={iconName} size={compact ? 20 : 24} />
      </View>
      <View style={variant.copy}>
        <Text style={variant.title}>{title}</Text>
        {body ? <Text style={variant.body}>{body}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <View style={variant.actionRow}>
          <Button compact label={actionLabel} onPress={onAction} tone="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      paddingHorizontal: 4,
      paddingVertical: 32,
      gap: 16,
      alignItems: "center",
    },
    iconFrame: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: mobileColors.brandSoft,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    copy: {
      gap: 6,
      alignItems: "center",
    },
    title: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
      textAlign: "center",
    },
    body: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      textAlign: "center",
      maxWidth: 320,
    },
    actionRow: {
      alignItems: "center",
    },
  });

const createCompactStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      paddingHorizontal: 4,
      paddingVertical: 12,
      gap: 10,
      alignItems: "center",
    },
    iconFrame: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: mobileColors.brandSoft,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    copy: {
      gap: 4,
      alignItems: "center",
    },
    title: {
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
      textAlign: "center",
    },
    body: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      textAlign: "center",
    },
    actionRow: {
      alignItems: "center",
    },
  });
