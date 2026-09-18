import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileListRow,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { coverageColor } from "../lib/coverage";

export type CoverageSection = MobileDashboardResponse["coverageBySection"][number];

// One focus area's coverage: its name, filled over required, the percentage
// in its tone, a 6pt meter. Shared by the Coverage card's breakdown and the
// full-page coverage screen (apps/mobile/app/(tabs)/home/coverage.tsx) so
// the two never drift. Opens the team schedule on this focus area, where the
// gap can be filled.
export function CoverageSectionRow({ section }: { section: CoverageSection }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const pctColor = coverageColor(mobileColors, section.pct);
  return (
    <PressableRow
      accessibilityLabel={`${section.focusAreaName}, ${section.pct} percent covered`}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/team",
          params: { focusAreaId: String(section.focusAreaId) },
        })
      }
      style={styles.row}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.label}>
            {section.focusAreaName}
          </Text>
          <View style={styles.rowNumbers}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.filledText}>
              {section.filledTotal} / {section.requiredTotal} filled
            </Text>
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[styles.pctText, { color: pctColor }]}
            >
              {section.pct}%
            </Text>
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { backgroundColor: pctColor, width: `${section.pct}%` }]} />
        </View>
      </View>
      <Ionicons color={mobileColors.textMuted} name="chevron-forward" size={16} />
    </PressableRow>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      paddingVertical: mobileListRow.paddingVertical,
    },
    rowBody: {
      flex: 1,
      gap: mobileSpace.sm,
    },
    // Wraps so that at the larger text sizes the figures drop under the
    // name instead of squeezing it to its first letter.
    rowHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: mobileSpace.sm,
    },
    rowNumbers: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: mobileSpace.sm,
      flexShrink: 0,
    },
    label: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
      flexShrink: 1,
    },
    filledText: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    pctText: {
      ...mobileText.bodyStrong,
    },
    track: {
      height: 6,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.borderSubtle,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: mobileRadii.pill,
    },
  });
