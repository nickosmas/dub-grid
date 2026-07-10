import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import type { DashboardPeriodMode } from "../../../shared/lib/dates";
import { CountBadge } from "./CountBadge";
import { ExpandableList } from "./ExpandableList";
import { PeriodToggle } from "./PeriodToggle";

export function StaffHoursCard({
  entries,
  thresholdHours,
  periodMode,
  onPeriodModeChange,
}: {
  entries: MobileDashboardResponse["staffHours"];
  thresholdHours: number;
  periodMode: DashboardPeriodMode;
  onPeriodModeChange: (mode: DashboardPeriodMode) => void;
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
        <View style={styles.wrapper}>
          <PeriodToggle mode={periodMode} onChange={onPeriodModeChange} />
          {entries.length > 0 ? (
            <ExpandableList
              title="Overtime watch"
              items={entries}
              keyExtractor={(entry) => entry.employeeId}
              renderItem={(entry) => (
                <View style={styles.row}>
                  <View style={styles.copy}>
                    <Text style={styles.label}>{entry.employeeName}</Text>
                    <Text style={styles.value}>{entry.totalHours}h total</Text>
                  </View>
                  <CountBadge label={`+${entry.overtimeHours}h OT`} tone="danger" />
                </View>
              )}
            />
          ) : (
            <EmptyStateCard
              compact
              iconName="checkmark-circle-outline"
              title={`No one is over ${thresholdHours}h this period`}
            />
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
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
