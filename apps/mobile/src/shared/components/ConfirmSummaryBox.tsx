import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { mobileRadii, mobileSpace, type MobileColors } from "../theme/tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";

/** Extra things the person should know before confirming, one short point each. */
export interface ConfirmSummary {
  /** Defaults to "Keep in mind". */
  title?: string;
  points: string[];
}

/** Web's publish summary box, as a list of what a confirm does. */
export function ConfirmSummaryBox({ summary }: { summary: ConfirmSummary }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  if (summary.points.length === 0) return null;
  // A box with one item reads oddly; a lone fact reads as a sentence.
  if (summary.points.length === 1) {
    return (
      <AppText style={styles.lone} tone="secondary" variant="body">
        {summary.points[0]}
      </AppText>
    );
  }

  return (
    <View accessibilityLabel={summary.title ?? "Keep in mind"} style={styles.section}>
      {/* Above the box at reading size: inside the border it read as a cramped caption. */}
      <AppText variant="bodyStrong">{summary.title ?? "Keep in mind"}</AppText>
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

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    box: {
      alignSelf: "stretch",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.card,
      backgroundColor: mobileColors.background,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.xs,
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
