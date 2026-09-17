import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { mobileSoftGradient } from "../theme/tokens";

/**
 * A page's wash: the login page's aurora geometry in whatever colour the page
 * has to say, the viewport's height, fixed behind everything from the status
 * bar to the bottom edge. A screen passes the same element to `Screen` as
 * `pageBackground` and `stickyHeaderBackground`, so the header paints exactly
 * the slice the page shows behind it.
 */
export function PageWash({
  colors,
  height,
}: {
  colors: readonly [string, string, string];
  height: number;
}) {
  if (height <= 0) return null;

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
