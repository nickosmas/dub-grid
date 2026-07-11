import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import { CountBadge } from "./CountBadge";
import { ExpandableList } from "./ExpandableList";

export type StaffHoursEntry = MobileDashboardResponse["staffHours"][number];

// Shared with the full-page expanded staff-hours screen
// (apps/mobile/app/(tabs)/home/staff-hours.tsx).
export function StaffHoursRow({ entry }: { entry: StaffHoursEntry }) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{entry.employeeName}</Text>
        <Text style={styles.value}>
          {entry.totalHours}h total{entry.focusAreaName ? ` · ${entry.focusAreaName}` : ""}
        </Text>
      </View>
      <CountBadge label={`+${entry.overtimeHours}h OT`} tone="danger" />
    </View>
  );
}

export function StaffHoursCard({
  entries,
  thresholdHours,
  onSeeAll,
}: {
  entries: MobileDashboardResponse["staffHours"];
  thresholdHours: number;
  onSeeAll?: () => void;
}) {
  return (
    <Card
      title="Overtime watch"
      icon="warning-outline"
      iconTone={entries.length > 0 ? "danger" : "brand"}
      headerAccessory={
        entries.length > 0 ? <CountBadge label={String(entries.length)} tone="danger" /> : undefined
      }
      detail={
        entries.length > 0 ? (
          <ExpandableList
            title="Overtime watch"
            items={entries}
            keyExtractor={(entry) => entry.employeeId}
            onSeeAll={onSeeAll}
            renderItem={(entry) => <StaffHoursRow entry={entry} />}
          />
        ) : (
          <EmptyStateCard
            compact
            iconName="checkmark-circle-outline"
            title={`No one is over ${thresholdHours}h this period`}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  copy: {
    gap: 2,
  },
  label: {
    ...mobileText.body,
    color: mobileColors.textPrimary,
  },
  value: {
    ...mobileText.caption,
    color: mobileColors.textMuted,
  },
});
