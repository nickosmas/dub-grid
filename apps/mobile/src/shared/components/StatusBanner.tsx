import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { fillScreenAnchorStyles } from "./fill-screen-anchor";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileRadii, mobileText, type MobileColors } from "../theme/tokens";

type StatusBannerTone = "error" | "warning" | "info" | "success";
type StatusBannerVariant = "inline" | "centered";

const createStatusBannerTone = (mobileColors: MobileColors) =>
  ({
    error: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
      iconColor: mobileColors.dangerText,
      titleColor: mobileColors.textPrimary,
      bodyColor: mobileColors.textMuted,
      iconName: "alert-circle" as const,
      centeredIconName: "alert-circle-outline" as const,
      inlineActionTone: "danger" as const,
    },
    warning: {
      backgroundColor: mobileColors.warningSoft,
      borderColor: mobileColors.warningBorder,
      iconColor: mobileColors.warningText,
      titleColor: mobileColors.textPrimary,
      bodyColor: mobileColors.textMuted,
      iconName: "warning" as const,
      centeredIconName: "warning-outline" as const,
      inlineActionTone: "secondary" as const,
    },
    info: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      iconColor: mobileColors.brand,
      titleColor: mobileColors.textPrimary,
      bodyColor: mobileColors.textMuted,
      iconName: "information-circle" as const,
      centeredIconName: "information-circle-outline" as const,
      inlineActionTone: "secondary" as const,
    },
    success: {
      backgroundColor: mobileColors.successSoft,
      borderColor: mobileColors.successBorder,
      iconColor: mobileColors.successText,
      titleColor: mobileColors.textPrimary,
      bodyColor: mobileColors.textMuted,
      iconName: "checkmark-circle" as const,
      centeredIconName: "checkmark-circle-outline" as const,
      inlineActionTone: "secondary" as const,
    },
  }) as const;

export function StatusBanner({
  title,
  body,
  tone = "error",
  variant = "inline",
  actionLabel,
  onAction,
  fillScreen = false,
}: {
  title: string;
  body?: string;
  tone?: StatusBannerTone;
  variant?: StatusBannerVariant;
  actionLabel?: string;
  onAction?: () => void;
  fillScreen?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const statusBannerTone = useMemo(() => createStatusBannerTone(mobileColors), [mobileColors]);
  const palette = statusBannerTone[tone];

  if (variant === "centered") {
    return (
      <CenteredStatus
        actionLabel={actionLabel}
        body={body}
        fillScreen={fillScreen}
        iconColor={palette.iconColor}
        iconName={palette.centeredIconName}
        onAction={onAction}
        title={title}
      />
    );
  }

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}
    >
      <View style={styles.copyRow}>
        <Ionicons color={palette.iconColor} name={palette.iconName} size={24} style={styles.icon} />
        <View style={styles.copy}>
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.title, { color: palette.titleColor }]}
          >
            {title}
          </Text>
          {body ? (
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[styles.body, { color: palette.bodyColor }]}
            >
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {actionLabel && onAction ? (
        <View style={styles.actionRow}>
          <Button compact label={actionLabel} onPress={onAction} tone={palette.inlineActionTone} />
        </View>
      ) : null}
    </View>
  );
}

function CenteredStatus({
  title,
  body,
  iconName,
  iconColor,
  actionLabel,
  onAction,
  fillScreen,
}: {
  title: string;
  body?: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  actionLabel?: string;
  onAction?: () => void;
  fillScreen: boolean;
}) {
  const mobileColors = useMobileColors();
  const centeredStyles = useMemo(() => createCenteredStyles(mobileColors), [mobileColors]);
  // `Screen`'s `contentContainerStyle` carries `flexGrow: 1`, so `flex: 1` here
  // claims the viewport's leftover space even inside a scroll view, and the two
  // spacers place the message within it. See `fill-screen-anchor` for why not
  // dead centre.
  return (
    <View style={[centeredStyles.card, fillScreen ? fillScreenAnchorStyles.fill : null]}>
      {fillScreen ? <View style={fillScreenAnchorStyles.spacerAbove} /> : null}
      <Ionicons color={iconColor} name={iconName} size={32} />
      <View style={centeredStyles.copy}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={centeredStyles.title}>
          {title}
        </Text>
        {body ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={centeredStyles.body}>
            {body}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        // Wrapped, not placed directly: `fullWidth={false}` gives the button
        // `alignSelf: "flex-start"`, and that beats the `alignItems: "center"`
        // on the card around it — so the action sat hard left under centred
        // copy. The wrapper is the flex child that stretches, and the button
        // centres inside it. `EmptyStateCard` solves it the same way.
        <View style={centeredStyles.actionRow}>
          <Button compact fullWidth={false} label={actionLabel} onPress={onAction} tone="primary" />
        </View>
      ) : null}
      {fillScreen ? <View style={fillScreenAnchorStyles.spacerBelow} /> : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    banner: {
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      padding: 16,
      gap: 14,
    },
    copyRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    icon: {
      flexShrink: 0,
      marginTop: 1,
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    title: {
      ...mobileText.cardTitle,
    },
    body: {
      ...mobileText.body,
    },
    actionRow: {
      alignItems: "flex-start",
    },
  });

const createCenteredStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      paddingHorizontal: 4,
      paddingVertical: 32,
      gap: 16,
      alignItems: "center",
    },
    copy: {
      gap: 6,
      alignItems: "center",
    },
    actionRow: {
      alignSelf: "stretch",
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
  });
