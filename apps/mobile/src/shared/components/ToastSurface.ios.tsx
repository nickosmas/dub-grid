import { TOAST_ICON_FILL } from "@dubgrid/design-tokens";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hapticNotify } from "../lib/haptics";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileSpace, mobileText, type MobileColors } from "../theme/tokens";
import { Text } from "./Text";
import { ToneSymbol } from "./ToneSymbol";
import { useToastSwipe } from "./toast-swipe";
import type { ToastSurfaceProps } from "./ToastSurface.types";

export type { ToastSurfaceProps } from "./ToastSurface.types";

const HAS_LIQUID_GLASS = isLiquidGlassAvailable();
const TOAST_HOST_GUTTER = 20;
const TOAST_BOX_RADIUS = 24;

/**
 * A toast as an iOS 26 Liquid Glass capsule under the Dynamic Island, like the
 * system's own banners: clear glass with no tone fill, the tone carried by a
 * large filled symbol. One line hugs its content as a capsule; with a second line it
 * becomes a rounded box. Before iOS 26 it is a translucent surface with a
 * hairline.
 */
export function ToastSurface({
  testID,
  tone,
  title,
  message,
  isOfflineNotice = false,
  onDismiss,
}: ToastSurfaceProps) {
  const mobileColors = useMobileColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(mobileColors, insets.left, insets.right),
    [mobileColors, insets.left, insets.right],
  );
  const swipe = useToastSwipe(onDismiss, "top");
  const isTwoLine = Boolean(title);
  const symbolTone = tone === "error" ? "danger" : tone;

  useEffect(() => {
    if (tone !== "info") hapticNotify(tone);
  }, [tone]);

  const content = (
    <>
      <ToneSymbol
        color={TOAST_ICON_FILL[symbolTone]}
        markColor="#FFFFFF"
        offline={isOfflineNotice}
        size={28}
        tone={symbolTone}
      />
      <View style={styles.copy}>
        {title ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.title}>
            {title}
          </Text>
        ) : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={title ? styles.message : styles.title}>
          {message}
        </Text>
      </View>
    </>
  );
  const shape = [styles.toast, isTwoLine ? styles.box : styles.capsule];

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingTop: insets.top + 6 }]}>
      <View testID={testID} {...swipe}>
        {HAS_LIQUID_GLASS ? (
          <GlassView glassEffectStyle="regular" isInteractive style={shape}>
            {content}
          </GlassView>
        ) : (
          <View style={[shape, styles.fallback]}>{content}</View>
        )}
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, insetLeft: number, insetRight: number) =>
  StyleSheet.create({
    host: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      // The side insets matter in landscape on a notched device, where a fixed
      // gutter runs the toast under the sensor housing.
      paddingLeft: TOAST_HOST_GUTTER + insetLeft,
      paddingRight: TOAST_HOST_GUTTER + insetRight,
      zIndex: 100,
    },
    toast: {
      maxWidth: 520,
      flexDirection: "row",
      gap: mobileSpace.md,
      paddingHorizontal: mobileSpace.lg,
    },
    capsule: {
      alignItems: "center",
      borderRadius: 999,
      minHeight: 48,
      paddingLeft: mobileSpace.md,
      paddingVertical: mobileSpace.md,
    },
    box: {
      alignItems: "center",
      borderRadius: TOAST_BOX_RADIUS,
      paddingVertical: mobileSpace.md,
    },
    fallback: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.border,
      borderWidth: StyleSheet.hairlineWidth,
    },
    copy: {
      flexShrink: 1,
      gap: mobileSpace.xs,
    },
    title: {
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
    },
    message: {
      ...mobileText.meta,
      color: mobileColors.textSecondary,
    },
  });
