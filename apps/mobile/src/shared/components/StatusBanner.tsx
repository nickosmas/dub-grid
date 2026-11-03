import { bannerIconColor, type StatusIconTone } from "@dubgrid/design-tokens";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { ToneSymbol } from "./ToneSymbol";
import { Button } from "./Button";
import { CONTENT_UNAVAILABLE_ICON_SIZE } from "./ContentUnavailable";
import { fillScreenAnchorStyles } from "./fill-screen-anchor";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileRadii,
  mobileText,
  type MobileColors,
  mobileSpace,
} from "../theme/tokens";

type StatusBannerTone = "error" | "warning" | "info" | "success";
type StatusBannerVariant = "inline" | "centered";

// The fill is the tone's border colour. The soft tints are a step off white,
// which was enough behind an outline; with the outline gone (a flat tint, as
// the platforms draw a notice) the fill alone separates the banner from the
// page, so it steps up the same hue's ramp.
const createStatusBannerTone = (mobileColors: MobileColors) =>
  ({
    error: {
      symbolTone: "danger" as StatusIconTone,
      backgroundColor: mobileColors.dangerBorder,
      titleColor: mobileColors.textPrimary,
      bodyColor: mobileColors.textMuted,
      inlineActionTone: "danger" as const,
    },
    warning: {
      symbolTone: "warning" as StatusIconTone,
      backgroundColor: mobileColors.warningBorder,
      titleColor: mobileColors.textPrimary,
      bodyColor: mobileColors.textMuted,
      inlineActionTone: "secondary" as const,
    },
    info: {
      symbolTone: "info" as StatusIconTone,
      backgroundColor: mobileColors.brandBorder,
      titleColor: mobileColors.textPrimary,
      bodyColor: mobileColors.textMuted,
      inlineActionTone: "secondary" as const,
    },
    success: {
      symbolTone: "success" as StatusIconTone,
      backgroundColor: mobileColors.successBorder,
      titleColor: mobileColors.textPrimary,
      bodyColor: mobileColors.textMuted,
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
  /** @deprecated The banner is always a flat tint without an outline. */
  bordered?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const statusBannerTone = useMemo(() => createStatusBannerTone(mobileColors), [mobileColors]);
  const palette = statusBannerTone[tone];
  const iconColor = bannerIconColor(palette.symbolTone, useIsDarkMode() ? "dark" : "light");

  if (variant === "centered") {
    return (
      <CenteredStatus
        actionLabel={actionLabel}
        body={body}
        fillScreen={fillScreen}
        iconColor={iconColor}
        symbolTone={palette.symbolTone}
        onAction={onAction}
        title={title}
      />
    );
  }

  return (
    <View style={[styles.banner, { backgroundColor: palette.backgroundColor }]}>
      <View style={styles.copyRow}>
        <View style={styles.icon}>
          <ToneSymbol
            color={iconColor}
            markColor={palette.backgroundColor}
            size={24}
            tone={palette.symbolTone}
          />
        </View>
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
  symbolTone,
  iconColor,
  actionLabel,
  onAction,
  fillScreen,
}: {
  title: string;
  body?: string;
  symbolTone: StatusIconTone;
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
      <ToneSymbol
        color={iconColor}
        markColor="#FFFFFF"
        size={CONTENT_UNAVAILABLE_ICON_SIZE}
        tone={symbolTone}
      />
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
        // `fullWidth={false}` gives the button `alignSelf: "flex-start"`.
        // Centre it on the wrapper's main axis so that child-level cross-axis
        // override cannot pull it back to the left.
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
      padding: 16,
      gap: mobileSpace.md,
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
      gap: mobileSpace.sm,
      alignItems: "center",
    },
    actionRow: {
      alignSelf: "stretch",
      flexDirection: "row",
      justifyContent: "center",
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
  });
