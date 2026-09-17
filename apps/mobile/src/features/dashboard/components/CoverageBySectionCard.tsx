import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { PressableRow } from "../../../shared/components/PressableRow";
import { DashboardCard } from "./DashboardCard";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { DashboardRowList } from "./DashboardRowList";
import { coverageColor, coverageTone } from "../lib/coverage";

export { coverageColor } from "../lib/coverage";

export type CoverageSection = MobileDashboardResponse["coverageBySection"][number];

// Shared with the full-page expanded coverage screen
// (apps/mobile/app/(tabs)/home/coverage.tsx) so the row layout never drifts
// between the compact card preview and the full list. Opens the team
// schedule on this focus area, where the gap can be filled.
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
          <Text numberOfLines={1} style={styles.label}>
            {section.focusAreaName}
          </Text>
          <View style={styles.rowNumbers}>
            <Text style={styles.filledText}>
              {section.filledTotal} / {section.requiredTotal} filled
            </Text>
            <Text style={[styles.pctText, { color: pctColor }]}>{section.pct}%</Text>
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

export function CoverageBySectionCard({
  sections,
  focusAreaLabel,
  onSeeAll,
}: {
  sections: MobileDashboardResponse["coverageBySection"];
  focusAreaLabel: string;
  onSeeAll?: () => void;
}) {
  const title = `Coverage by ${focusAreaLabel.toLowerCase()}`;

  return (
    <DashboardCard title={title} tone={coverageTone(sections)} onOpen={onSeeAll}>
      {sections.length > 0 ? (
        <DashboardRowList
          items={sections}
          keyExtractor={(section) => String(section.focusAreaId)}
          limit={3}
          renderItem={(section) => <CoverageSectionRow section={section} />}
        />
      ) : (
        <EmptyStateCard
          compact
          body="Coverage appears here once staffing requirements are configured and the period is published."
          iconName="stats-chart-outline"
          title="No coverage to track yet"
        />
      )}
    </DashboardCard>
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
    rowHeader: {
      flexDirection: "row",
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
