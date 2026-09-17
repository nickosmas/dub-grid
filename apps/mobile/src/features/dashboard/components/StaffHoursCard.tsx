import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileSpace,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { DashboardRowList } from "./DashboardRowList";

export type StaffHoursEntry = MobileDashboardResponse["staffHours"][number];

// Shared with the full-page expanded staff-hours screen
// (apps/mobile/app/(tabs)/home/staff-hours.tsx). Opens the person, whose
// schedule is where an overtime week gets rebalanced.
export function StaffHoursRow({ entry }: { entry: StaffHoursEntry }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <PressableRow
      accessibilityLabel={`${entry.employeeName}, ${entry.overtimeHours} hours overtime`}
      onPress={() => router.push({ pathname: "/person/[id]", params: { id: entry.employeeId } })}
      style={styles.row}
    >
      <View style={styles.copy}>
        <Text style={styles.label}>{entry.employeeName}</Text>
        <Text style={styles.value}>
          {entry.totalHours}h total{entry.focusAreaName ? ` · ${entry.focusAreaName}` : ""}
        </Text>
      </View>
      <View style={styles.figure}>
        <Text style={styles.overtime}>+{entry.overtimeHours}h</Text>
        <Text style={styles.overtimeLabel}>overtime</Text>
      </View>
      <Ionicons color={mobileColors.textMuted} name="chevron-forward" size={16} />
    </PressableRow>
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
      onSeeAll={onSeeAll}
      detail={
        entries.length > 0 ? (
          <DashboardRowList
            items={entries}
            keyExtractor={(entry) => entry.employeeId}
            limit={3}
            renderItem={(entry) => <StaffHoursRow entry={entry} />}
          />
        ) : (
          <EmptyStateCard
            compact
            iconName="checkmark-circle"
            title={`No one is over ${thresholdHours}h this period`}
          />
        )
      }
    />
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
    copy: {
      flex: 1,
      gap: mobileListRow.titleGap,
    },
    // The overtime as a figure in the danger colour, no pill around it.
    figure: {
      alignItems: "flex-end",
      flexShrink: 0,
    },
    overtime: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.dangerText,
    },
    overtimeLabel: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
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
