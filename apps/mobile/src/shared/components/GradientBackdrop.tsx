import { useMemo } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsDarkMode } from "../providers/ThemeModeProvider";
import {
  mobileSoftGradient,
  mobileSoftGradientStops,
  type SoftGradientKind,
} from "../theme/tokens";

/** Height the `aurora` halo runs to when the caller doesn't say. */
const DEFAULT_AURORA_HEIGHT = 320;

export function GradientBackdrop({
  kind = "brandWash",
  height,
  style,
}: {
  kind?: SoftGradientKind;
  /** A pixel height, or `"100%"` to fill the parent. Defaults per kind. */
  height?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  const isDark = useIsDarkMode();
  const colors = useMemo(() => mobileSoftGradientStops(kind, isDark), [kind, isDark]);
  const resolvedHeight = height ?? (kind === "aurora" ? DEFAULT_AURORA_HEIGHT : "100%");

  return (
    <LinearGradient
      // Purely decorative, and it sits under real content, so it must never
      // intercept a touch or show up in the accessibility tree.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      colors={colors}
      locations={mobileSoftGradient.locations}
      start={mobileSoftGradient.start}
      end={mobileSoftGradient.end}
      style={[styles.backdrop, { height: resolvedHeight }, style]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
