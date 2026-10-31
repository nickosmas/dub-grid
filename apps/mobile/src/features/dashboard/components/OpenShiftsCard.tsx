import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import type { MobileCoverageWindow, MobileDashboardResponse } from "@dubgrid/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Button } from "../../../shared/components/Button";
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
import {
  DASHBOARD_CARD_PREVIEW_LIMIT,
  DashboardRowList,
  hasMoreDashboardRows,
} from "./DashboardRowList";

export type OpenShiftUrgency = NonNullable<
  MobileDashboardResponse["openShifts"][number]["urgency"]
>;
export type OpenShift = MobileDashboardResponse["openShifts"][number];

/**
 * Claiming from the card, for a viewer who can work some of these shifts.
 * `shiftFor` names the shift they can take for a row, or null.
 */
export type OpenShiftClaim = {
  shiftFor: (row: OpenShift) => OpenShift | null;
  isClaiming: (shift: OpenShift) => boolean;
  isBusy: boolean;
  onClaim: (shift: OpenShift) => void;
};

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
export function OpenShiftRow({ shift, claim }: { shift: OpenShift; claim?: OpenShiftClaim }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const toneColor = useMemo(() => createToneTextColors(mobileColors), [mobileColors]);
  const urgency = shift.urgency != null ? URGENCY_BADGE[shift.urgency] : null;
  const claimable = claim?.shiftFor(shift) ?? null;

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
            ? ` · ${formatUsTime(shift.presentation.startTime)} - ${formatUsTime(shift.presentation.endTime)}`
            : ""}
        </Text>
      </View>
      <View style={styles.figure}>
        <Text style={styles.needed}>{shift.needed}</Text>
        <Text style={[styles.neededLabel, urgency ? { color: toneColor[urgency.tone] } : null]}>
          {urgency?.tone === "danger" ? "urgent" : "needed"}
        </Text>
      </View>
      {claimable && claim ? (
        <Button
          disabled={claim.isBusy}
          label="Claim"
          loading={claim.isClaiming(claimable)}
          onPress={() => claim.onClaim(claimable)}
          size="sm"
          tone="secondary"
        />
      ) : (
        <Ionicons color={mobileColors.textMuted} name="chevron-forward" size={16} />
      )}
    </PressableRow>
  );
}

// Open shifts count published dates only, so an empty list says which kind
// of empty it is, in web's words (OpenShiftsCard.tsx).
export function getOpenShiftsEmptyCopy(coverageWindow: MobileCoverageWindow = "published"): {
  title: string;
  body?: string;
} {
  if (coverageWindow === "unpublished") {
    return {
      title: "Not published yet",
      body: "Open shifts will appear after this period is published.",
    };
  }
  if (coverageWindow === "partial") {
    return {
      title: "No open shifts on published dates",
      body: "Only published dates are counted here.",
    };
  }
  return { title: "No open shifts right now" };
}

export function OpenShiftsCard({
  openShifts,
  coverageWindow,
  claim,
  onSeeAll,
}: {
  openShifts: MobileDashboardResponse["openShifts"];
  coverageWindow?: MobileCoverageWindow;
  claim?: OpenShiftClaim;
  onSeeAll?: () => void;
}) {
  const emptyCopy = getOpenShiftsEmptyCopy(coverageWindow);
  return (
    <DashboardCard
      title="Open shifts"
      onOpen={hasMoreDashboardRows(openShifts.length) ? onSeeAll : undefined}
    >
      {openShifts.length > 0 ? (
        <DashboardRowList
          items={openShifts}
          keyExtractor={(shift) => shift.id}
          limit={DASHBOARD_CARD_PREVIEW_LIMIT}
          renderItem={(shift) => <OpenShiftRow claim={claim} shift={shift} />}
        />
      ) : (
        <EmptyStateCard
          body={emptyCopy.body}
          compact
          iconName={coverageWindow === "unpublished" ? "calendar-outline" : "checkmark-circle"}
          title={emptyCopy.title}
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
