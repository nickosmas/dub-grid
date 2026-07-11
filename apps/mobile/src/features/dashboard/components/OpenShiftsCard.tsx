import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import { formatUsDate, formatUsTime } from "../../../shared/lib/dates";
import { CountBadge, type CountBadgeTone } from "./CountBadge";
import { ExpandableList } from "./ExpandableList";

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
// (apps/mobile/app/(tabs)/home/open-shifts.tsx).
export function OpenShiftRow({ shift }: { shift: OpenShift }) {
  return (
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
      <View style={styles.badges}>
        {shift.urgency != null ? (
          <CountBadge label={URGENCY_BADGE[shift.urgency].label} tone={URGENCY_BADGE[shift.urgency].tone} />
        ) : null}
        <CountBadge label={`${shift.needed} needed`} tone="brand" />
      </View>
    </View>
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
    <Card
      title="Open shifts"
      icon="calendar-outline"
      iconTone="brand"
      headerAccessory={
        openShifts.length > 0 ? <CountBadge label={String(openShifts.length)} tone="brand" /> : undefined
      }
      detail={
        openShifts.length > 0 ? (
          <ExpandableList
            title="Open shifts"
            items={openShifts}
            keyExtractor={(shift) => shift.id}
            onSeeAll={onSeeAll}
            renderItem={(shift) => <OpenShiftRow shift={shift} />}
          />
        ) : (
          <EmptyStateCard compact iconName="checkmark-circle-outline" title="No open shifts right now" />
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
    flexShrink: 1,
    gap: 2,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
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
