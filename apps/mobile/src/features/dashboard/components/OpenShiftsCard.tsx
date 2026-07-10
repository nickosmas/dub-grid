import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import { formatUsDate, formatUsTime, type DashboardPeriodMode } from "../../../shared/lib/dates";
import { CountBadge } from "./CountBadge";
import { ExpandableList } from "./ExpandableList";
import { PeriodToggle } from "./PeriodToggle";

export function OpenShiftsCard({
  openShifts,
  periodMode,
  onPeriodModeChange,
}: {
  openShifts: MobileDashboardResponse["openShifts"];
  periodMode: DashboardPeriodMode;
  onPeriodModeChange: (mode: DashboardPeriodMode) => void;
}) {
  return (
    <Card
      title="Open shifts"
      icon="calendar-outline"
      iconTone="brand"
      headerAccessory={
        openShifts.length > 0 ? <CountBadge label={String(openShifts.length)} tone="brand" /> : undefined
      }
      detail={
        <View style={styles.wrapper}>
          <PeriodToggle mode={periodMode} onChange={onPeriodModeChange} />
          {openShifts.length > 0 ? (
            <ExpandableList
              title="Open shifts"
              items={openShifts}
              keyExtractor={(shift) => shift.id}
              renderItem={(shift) => (
                <View style={styles.row}>
                  <View style={styles.copy}>
                    <Text style={styles.label}>{shift.focusAreaName ?? "Unassigned"}</Text>
                    <Text style={styles.meta}>
                      {formatUsDate(shift.date)}
                      {shift.presentation.shiftName ? ` · ${shift.presentation.shiftName}` : ""}
                      {shift.presentation.startTime && shift.presentation.endTime
                        ? ` · ${formatUsTime(shift.presentation.startTime)}–${formatUsTime(shift.presentation.endTime)}`
                        : ""}
                    </Text>
                  </View>
                  <CountBadge label={`${shift.needed} needed`} tone="brand" />
                </View>
              )}
            />
          ) : (
            <EmptyStateCard compact iconName="checkmark-circle-outline" title="No open shifts right now" />
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
    flexShrink: 1,
    gap: 2,
  },
  label: {
    ...mobileText.body,
    color: mobileColors.textPrimary,
  },
  meta: {
    ...mobileText.caption,
    color: mobileColors.textMuted,
  },
});
