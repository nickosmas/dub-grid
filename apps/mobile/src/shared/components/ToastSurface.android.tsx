import { useSegments } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileSpace, mobileText, type MobileColors } from "../theme/tokens";
import { Text } from "./Text";
import { useToastSwipe } from "./toast-swipe";
import type { ToastSurfaceProps } from "./ToastSurface.types";

export type { ToastSurfaceProps } from "./ToastSurface.types";

// Material 3 navigation bar height, above which a snackbar sits on a tab screen.
const NAVIGATION_BAR_HEIGHT = 80;
const SNACKBAR_MARGIN = 12;

function joinTitleAndMessage(title: string | undefined, message: string): string {
  if (!title) return message;
  return /[.!?]$/.test(title) ? `${title} ${message}` : `${title}. ${message}`;
}

/**
 * A toast as a Material 3 snackbar: an inverse-surface bar at the bottom,
 * above the navigation bar on a tab screen, with one block of text and no
 * icon, as Android's own apps show one.
 */
export function ToastSurface({ testID, title, message, onDismiss }: ToastSurfaceProps) {
  const mobileColors = useMobileColors();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const swipe = useToastSwipe(onDismiss, "bottom");
  const isOnTabScreen = segments[0] === "(tabs)";
  const bottom = insets.bottom + (isOnTabScreen ? NAVIGATION_BAR_HEIGHT : 0) + SNACKBAR_MARGIN;

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
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2} style={styles.text}>
          {joinTitleAndMessage(title, message)}
        </Text>
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
    // Material's inverse surface: the primary text colour as the fill and the
    // surface colour as the text, so it is dark in light mode and light in dark.
    snackbar: {
      backgroundColor: mobileColors.textPrimary,
      borderRadius: 4,
      elevation: 6,
      justifyContent: "center",
      maxWidth: 560,
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
      width: "100%",
      alignSelf: "center",
    },
    text: {
      ...mobileText.body,
      color: mobileColors.surface,
    },
  });
