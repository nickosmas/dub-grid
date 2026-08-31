import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../../../shared/theme/tokens";
import { CountBadge } from "./CountBadge";
import { ExpandableList } from "./ExpandableList";

// Same thresholds as web's CoverageBySectionCard
// (apps/web/src/components/dashboard/CoverageBySectionCard.tsx).
export function coverageColor(mobileColors: MobileColors, pct: number): string {
  if (pct >= 90) return mobileColors.success;
  if (pct >= 70) return mobileColors.warning;
  return mobileColors.danger;
}

export type CoverageSection = MobileDashboardResponse["coverageBySection"][number];

// Shared with the full-page expanded coverage screen
// (apps/mobile/app/(tabs)/home/coverage.tsx) so the row layout never drifts
// between the compact card preview and the full list.
export function CoverageSectionRow({ section }: { section: CoverageSection }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const pctColor = coverageColor(mobileColors, section.pct);
  return (
    <View style={styles.row}>
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
  const totalOpenSlots = sections.reduce((sum, section) => sum + section.openSlots, 0);
  const title = `Coverage by ${focusAreaLabel.toLowerCase()}`;

  return (
    <Card
      title={title}
      headerAccessory={
        totalOpenSlots > 0 ? (
          <CountBadge label={`${totalOpenSlots} open`} tone="warning" />
        ) : undefined
      }
      detail={
        sections.length > 0 ? (
          <ExpandableList
            title={title}
            items={sections}
            keyExtractor={(section) => String(section.focusAreaId)}
            onSeeAll={onSeeAll}
            renderItem={(section) => <CoverageSectionRow section={section} />}
          />
        ) : (
          <EmptyStateCard
            compact
            body="Coverage appears here once staffing requirements are configured and the period is published."
            iconName="stats-chart-outline"
            title="No coverage to track yet"
          />
        )
      }
    />
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    row: {
      gap: 6,
    },
    rowHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 8,
    },
    rowNumbers: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
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
      borderRadius: 3,
      backgroundColor: mobileColors.borderSubtle,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: 3,
    },
  });
