import Ionicons from "@expo/vector-icons/Ionicons";
import { Fragment, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadius, mobileSpace, mobileText, type MobileColors } from "../theme/tokens";

export type BannerTone = "info" | "success" | "warning" | "danger";
export type BannerIconName = keyof typeof Ionicons.glyphMap;

const DEFAULT_ICONS: Record<BannerTone, BannerIconName> = {
  info: "information-circle-outline",
  success: "checkmark-circle-outline",
  warning: "warning-outline",
  danger: "alert-circle-outline",
};

const ICON_SIZE = 18;

export const getBannerToneColors = (mobileColors: MobileColors, tone: BannerTone) => {
  switch (tone) {
    case "info":
      return {
        backgroundColor: mobileColors.bannerInfoBg,
        borderColor: mobileColors.bannerInfoBorder,
        color: mobileColors.bannerInfoText,
      };
    case "success":
      return {
        backgroundColor: mobileColors.bannerSuccessBg,
        borderColor: mobileColors.bannerSuccessBorder,
        color: mobileColors.bannerSuccessText,
      };
    case "warning":
      return {
        backgroundColor: mobileColors.bannerWarningBg,
        borderColor: mobileColors.bannerWarningBorder,
        color: mobileColors.bannerWarningText,
      };
    case "danger":
      return {
        backgroundColor: mobileColors.bannerDangerBg,
        borderColor: mobileColors.bannerDangerBorder,
        color: mobileColors.bannerDangerText,
      };
  }
};

/**
 * Every banner and notice in the app, matching web's `Banner`: a tinted fill,
 * a deeper border and dark text and icon of one hue.
 */
export function Banner({
  tone,
  icon,
  title,
  children,
  actionLabel,
  onAction,
  accessibilityRole = "summary",
}: {
  tone: BannerTone;
  /** A glyph that fits the meaning, such as `alarm-outline` for a time limit. Defaults per tone. */
  icon?: BannerIconName;
  title?: string;
  /** Message text; strings render as body copy, so a list of sentences can be passed as siblings. */
  children?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  accessibilityRole?: "summary" | "alert";
}) {
  const mobileColors = useMobileColors();
  const palette = useMemo(() => getBannerToneColors(mobileColors, tone), [mobileColors, tone]);
  const textStyle = { color: palette.color };

  return (
    <View
      accessibilityRole={accessibilityRole}
      style={[
        styles.banner,
        { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor },
      ]}
    >
      <View style={styles.row}>
        <Ionicons
          color={palette.color}
          name={icon ?? DEFAULT_ICONS[tone]}
          size={ICON_SIZE}
          style={styles.icon}
        />
        <View style={styles.copy}>
          {title ? (
            <AppText style={textStyle} variant="bodyStrong">
              {title}
            </AppText>
          ) : null}
          {renderMessage(children, textStyle)}
        </View>
      </View>
      {actionLabel && onAction ? (
        <View style={styles.actionRow}>
          <Button compact label={actionLabel} onPress={onAction} tone="secondary" />
        </View>
      ) : null}
    </View>
  );
}

function renderMessage(children: ReactNode, textStyle: { color: string }) {
  if (children == null || children === false) return null;
  const items = Array.isArray(children) ? children : [children];
  return items.map((child, index) =>
    typeof child === "string" || typeof child === "number" ? (
      <AppText key={`${index}-${String(child)}`} style={textStyle} variant="body">
        {child}
      </AppText>
    ) : (
      <Fragment key={index}>{child}</Fragment>
    ),
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: mobileRadius.lg,
    borderWidth: 1,
    gap: mobileSpace.md,
    paddingHorizontal: mobileSpace.md,
    paddingVertical: mobileSpace.md,
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: mobileSpace.sm,
  },
  // Centres the glyph on the first line of body text, however many follow.
  icon: {
    flexShrink: 0,
    marginTop: (mobileText.body.lineHeight - ICON_SIZE) / 2,
  },
  copy: {
    flex: 1,
    gap: mobileSpace.xs,
  },
  actionRow: {
    alignItems: "flex-start",
  },
});
