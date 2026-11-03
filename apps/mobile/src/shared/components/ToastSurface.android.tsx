import { TOAST_ICON_FILL } from "@dubgrid/design-tokens";
import { useSegments } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileSpace, mobileText, type MobileColors } from "../theme/tokens";
import { Text } from "./Text";
import { ToneSymbol } from "./ToneSymbol";
import { useToastSwipe } from "./toast-swipe";
import type { ToastSurfaceProps } from "./ToastSurface.types";

export type { ToastSurfaceProps } from "./ToastSurface.types";

// Material 3 navigation bar height, above which a snackbar sits on a tab screen.
const NAVIGATION_BAR_HEIGHT = 80;
const SNACKBAR_MARGIN = 12;

/**
 * A toast as a snackbar at the bottom, above the navigation bar on a tab
 * screen. It takes iOS's colours rather than Material's inverse surface (light
 * in light mode, dark in dark), a large filled tone icon, and the title above
 * the message.
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
  const segments = useSegments();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const swipe = useToastSwipe(onDismiss, "bottom");
  const isOnTabScreen = segments[0] === "(tabs)";
  const bottom = insets.bottom + (isOnTabScreen ? NAVIGATION_BAR_HEIGHT : 0) + SNACKBAR_MARGIN;
  const symbolTone = tone === "error" ? "danger" : tone;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          bottom,
          paddingLeft: SNACKBAR_MARGIN + insets.left,
          paddingRight: SNACKBAR_MARGIN + insets.right,
        },
      ]}
    >
      <View accessibilityLiveRegion="polite" testID={testID} {...swipe} style={styles.snackbar}>
        <ToneSymbol
          color={TOAST_ICON_FILL[symbolTone]}
          markColor="#FFFFFF"
          offline={isOfflineNotice}
          size={28}
          tone={symbolTone}
        />
        <View style={styles.copy}>
          {title ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          ) : null}
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            numberOfLines={2}
            style={title ? styles.message : styles.title}
          >
            {message}
          </Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    host: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: 100,
      elevation: 100,
    },
    snackbar: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.border,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 6,
      flexDirection: "row",
      gap: mobileSpace.md,
      maxWidth: 560,
      minHeight: 56,
      paddingLeft: mobileSpace.md,
      paddingRight: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
      width: "100%",
    },
    copy: {
      flex: 1,
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
