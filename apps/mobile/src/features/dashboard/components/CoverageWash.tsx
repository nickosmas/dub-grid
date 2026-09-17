import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSoftGradient } from "../../../shared/theme/tokens";
import { buildCoverageWash } from "../lib/coverage-wash";

/**
 * The login page's aurora, in the period's coverage colour, the viewport's
 * height and fixed behind everything from the status bar to the bottom edge.
 * The sticky header renders the same wash at the same size and origin inside
 * its own clipped shell, so it paints exactly the slice the page shows behind
 * it. Renders nothing when coverage is not configured.
 */
export function CoverageWash({ pct, height }: { pct: number | null; height: number }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const colors = useMemo(
    () => buildCoverageWash(pct, mobileColors, isDark),
    [isDark, mobileColors, pct],
  );

  if (!colors || height <= 0) return null;

  return (
    <LinearGradient
      accessibilityElementsHidden
      colors={colors}
      end={mobileSoftGradient.end}
      importantForAccessibility="no-hide-descendants"
      locations={mobileSoftGradient.locations}
      start={mobileSoftGradient.start}
      style={[styles.wash, { height }]}
    />
  );
}

const styles = StyleSheet.create({
  wash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: "none",
  },
});
