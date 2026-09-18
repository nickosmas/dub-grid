import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { PressableRow } from "../../../shared/components/PressableRow";
import { DashboardCard } from "./DashboardCard";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileSpace,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { formatUsDate, formatUsTime } from "../../../shared/lib/dates";
import type { CountBadgeTone } from "./CountBadge";
import { createToneTextColors } from "../lib/tone-text";
import { DashboardRowList } from "./DashboardRowList";

export type OpenShiftUrgency = NonNullable<
  MobileDashboardResponse["openShifts"][number]["urgency"]
>;
export type OpenShift = MobileDashboardResponse["openShifts"][number];

// Same tone/label mapping as web's ExpandedOpenShifts.tsx: only "high" reads
// as genuinely urgent, "medium"/"low" both just mean "still open".
export const URGENCY_BADGE: Record<OpenShiftUrgency, { label: string; tone: CountBadgeTone }> = {
  high: { label: "Urgent", tone: "danger" },
  medium: { label: "Open", tone: "warning" },
  low: { label: "Open", tone: "success" },
};

// Shared with the full-page expanded open-shifts screen
// (apps/mobile/app/(tabs)/home/open-shifts.tsx). Lands on the Requests tab's
// Available list, where an open shift can be claimed or offered; that screen
// selects by tab, not by shift, so only the tab travels.
export function OpenShiftRow({ shift }: { shift: OpenShift }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const toneColor = useMemo(() => createToneTextColors(mobileColors), [mobileColors]);
  const urgency = shift.urgency != null ? URGENCY_BADGE[shift.urgency] : null;

  return (
    <PressableRow
      accessibilityLabel={`${shift.focusAreaName ?? "Unassigned"} open shift, ${formatUsDate(shift.date)}`}
      onPress={() => router.push({ pathname: "/(tabs)/requests", params: { tab: "available" } })}
      style={styles.row}
    >
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
      <View style={styles.figure}>
        <Text style={styles.needed}>{shift.needed}</Text>
        <Text style={[styles.neededLabel, urgency ? { color: toneColor[urgency.tone] } : null]}>
          {urgency?.tone === "danger" ? "urgent" : "needed"}
        </Text>
      </View>
      <Ionicons color={mobileColors.textMuted} name="chevron-forward" size={16} />
    </PressableRow>
  );
}

export function OpenShiftsCard({
  openShifts,
  onSeeAll,
}: {
  openShifts: MobileDashboardResponse["openShifts"];
  onSeeAll?: () => void;
}) {
  return (
    <DashboardCard title="Open shifts" onOpen={onSeeAll}>
      {openShifts.length > 0 ? (
        <DashboardRowList
          items={openShifts}
          keyExtractor={(shift) => shift.id}
          limit={3}
          renderItem={(shift) => <OpenShiftRow shift={shift} />}
        />
      ) : (
        <EmptyStateCard compact iconName="checkmark-circle" title="No open shifts right now" />
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
    copy: {
      flex: 1,
      gap: mobileListRow.titleGap,
    },
    // The count as a figure with a word under it, in place of two pills.
    figure: {
      alignItems: "flex-end",
      flexShrink: 0,
    },
    needed: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textPrimary,
    },
    neededLabel: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
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
