import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Banner, type BannerTone } from "./Banner";
import { Button } from "./Button";
import { fillScreenAnchorStyles } from "./fill-screen-anchor";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileText, type MobileColors, mobileSpace } from "../theme/tokens";

type StatusBannerTone = "error" | "warning" | "info" | "success";
type StatusBannerVariant = "inline" | "centered";

const BANNER_TONE = {
  error: "danger",
  warning: "warning",
  info: "info",
  success: "success",
} as const satisfies Record<StatusBannerTone, BannerTone>;

const CENTERED_ICON = {
  error: "alert-circle",
  warning: "warning",
  info: "information-circle",
  success: "checkmark-circle",
} as const satisfies Record<StatusBannerTone, keyof typeof Ionicons.glyphMap>;

const createCenteredIconColor = (mobileColors: MobileColors) =>
  ({
    error: mobileColors.dangerText,
    warning: mobileColors.warningText,
    info: mobileColors.brand,
    success: mobileColors.successText,
  }) as const satisfies Record<StatusBannerTone, string>;

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
  const centeredIconColor = useMemo(() => createCenteredIconColor(mobileColors), [mobileColors]);

  if (variant === "centered") {
    return (
      <CenteredStatus
        actionLabel={actionLabel}
        body={body}
        fillScreen={fillScreen}
        iconColor={centeredIconColor[tone]}
        iconName={CENTERED_ICON[tone]}
        onAction={onAction}
        title={title}
      />
    );
  }

  return (
    <Banner actionLabel={actionLabel} onAction={onAction} title={title} tone={BANNER_TONE[tone]}>
      {body}
    </Banner>
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
