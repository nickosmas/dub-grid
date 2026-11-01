import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { ContentUnavailable } from "./ContentUnavailable";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../theme/tokens";

/**
 * Full-screen fallback for an unrecoverable render error or an unmatched route.
 *
 * Deliberately dependency-light: it may render *above* the provider tree when a
 * layout itself throws, so it leans only on `useMobileColors` (which has a
 * default context value) and never on navigation or safe-area context.
 */
export function RouteErrorScreen({
  title,
  body,
  detail,
  actionLabel,
  onAction,
  iconName = "alert-circle",
}: {
  title: string;
  body: string;
  /** Raw error text. Shown only in dev builds — never leak it to users. */
  detail?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  // `__DEV__` is a Metro/RN global that isn't defined outside the app runtime
  // (e.g. under vitest), so guard the lookup rather than reference it directly.
  const isDevBuild = typeof __DEV__ !== "undefined" && __DEV__;

  return (
    <View style={styles.container}>
      <ContentUnavailable
        body={body}
        iconName={iconName}
        primaryAction={
          actionLabel && onAction ? { label: actionLabel, onPress: onAction } : undefined
        }
        title={title}
      >
        {isDevBuild && detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </ContentUnavailable>
    </View>
  );
}

function createStyles(mobileColors: MobileColors) {
  return StyleSheet.create({
    container: {
      alignItems: "center",
      backgroundColor: mobileColors.background,
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    detail: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      textAlign: "center",
    },
  });
}
