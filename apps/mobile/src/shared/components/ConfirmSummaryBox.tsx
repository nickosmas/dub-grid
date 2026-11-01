import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { mobileRadii, mobileSpace, mobileTextWeighted, type MobileColors } from "../theme/tokens";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { IS_NATIVE_LIST } from "../lib/native-list";

/** Extra things the person should know before confirming, one short point each. */
export interface ConfirmSummary {
  /** A visible label above the box; none by default. */
  title?: string;
  points: string[];
}

/** Web's publish summary box, as a list of what a confirm does. */
export function ConfirmSummaryBox({ summary }: { summary: ConfirmSummary }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  if (summary.points.length === 0) return null;
  // A box with one item reads oddly; a lone fact reads as a sentence, unless
  // a title names the box, as Changes and Stays the same do.
  if (summary.points.length === 1 && !summary.title) {
    return (
      <AppText style={styles.lone} tone="secondary" variant="body">
        {summary.points[0]}
      </AppText>
    );
  }

  return (
    <View accessibilityLabel={summary.title ?? "Keep in mind"} style={styles.section}>
      {/* No visible label by default; the view keeps a name for screen readers. */}
      {summary.title ? (
        IS_NATIVE_LIST ? (
          <AppText style={styles.groupHeader}>{summary.title}</AppText>
        ) : (
          <AppText variant="bodyStrong">{summary.title}</AppText>
        )
      ) : null}
      <View style={styles.box}>
        {summary.points.map((point, index) => (
          <View key={point} style={[styles.point, index > 0 && styles.divided]}>
            <View style={styles.dot} />
            <AppText style={styles.pointText} variant="body">
              {point}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    // A phone's sheet is the grouped gray, so the points are a white grouped
    // card there, edged only in dark mode.
    box: {
      alignSelf: "stretch",
      borderWidth: IS_NATIVE_LIST && !isDark ? 0 : StyleSheet.hairlineWidth,
      borderColor: IS_NATIVE_LIST ? mobileColors.borderSubtle : mobileColors.border,
      borderRadius: mobileRadii.card,
      backgroundColor: IS_NATIVE_LIST ? mobileColors.surface : mobileColors.background,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.xs,
    },
    // A grouped list's header: 17pt semibold, over the card's text.
    groupHeader: {
      ...mobileTextWeighted("sectionTitle", "semibold"),
      paddingHorizontal: mobileSpace.lg,
    },
    lone: {
      alignSelf: "stretch",
    },
    section: {
      alignSelf: "stretch",
      gap: mobileSpace.sm,
    },
    point: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    divided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: mobileColors.textSubtle,
    },
    pointText: {
      flex: 1,
    },
  });
