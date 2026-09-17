import { useMemo } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { buildStatusGradient, type GradientStop } from "../lib/status-gradient";

/**
 * The dashboard's page wash: one vertical gradient the height of the
 * viewport, fixed behind everything from the status bar to the bottom edge,
 * its stops following the sections in order. The sticky header renders the
 * same gradient at the same height inside its own clipped shell, so it
 * paints exactly the slice the page shows behind it and content sliding
 * under the header stays legible. Renders nothing on a healthy day. See
 * `buildStatusGradient` for how the stops are placed.
 */
export function StatusGradient({
  sections,
  height,
  style,
}: {
  sections: readonly GradientStop[];
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const gradient = useMemo(
    () =>
      buildStatusGradient(
        sections,
        { warning: mobileColors.warning, danger: mobileColors.danger },
        isDark ? 0.18 : 0.1,
      ),
    [isDark, mobileColors.danger, mobileColors.warning, sections],
  );

  if (!gradient || height <= 0) return null;

  return (
    <LinearGradient
      colors={gradient.colors as [string, string, ...string[]]}
      locations={gradient.locations as [number, number, ...number[]]}
      pointerEvents="none"
      style={[styles.wash, { height }, style]}
    />
  );
}

const styles = StyleSheet.create({
  wash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
