import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../../../shared/theme/tokens";
import { CountBadge, type CountBadgeTone } from "./CountBadge";
import { ExpandableList } from "./ExpandableList";

export type ActivityItem = MobileDashboardResponse["activity"][number];
export type ActivityType = ActivityItem["type"];

// Same 4 event types as web's dashboard activity feed.
export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  publish: "Published",
  shift_change: "Shift change",
  request: "Request",
  user_signup: "Sign-up",
};

export const ACTIVITY_TYPE_TONE: Record<ActivityType, CountBadgeTone> = {
  publish: "brand",
  shift_change: "warning",
  request: "success",
  user_signup: "success",
};

export function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

// Shared with the full-page expanded activity screen
// (apps/mobile/app/(tabs)/home/activity.tsx).
export function ActivityRow({ item }: { item: ActivityItem }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <CountBadge label={ACTIVITY_TYPE_LABEL[item.type]} tone={ACTIVITY_TYPE_TONE[item.type]} />
        <Text style={styles.value}>{formatRelativeTime(item.timestamp)}</Text>
      </View>
      <Text style={styles.label}>{item.description}</Text>
    </View>
  );
}

export function ActivityFeedCard({
  items,
  onSeeAll,
}: {
  items: MobileDashboardResponse["activity"];
  onSeeAll?: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <Card
      title="Recent activity"
      icon="time-outline"
      iconTone="brand"
      detail={
        items.length > 0 ? (
          <ExpandableList
            title="Recent activity"
            items={items}
            keyExtractor={(item) => item.id}
            onSeeAll={onSeeAll}
            renderDivider={() => <View style={styles.divider} />}
            renderItem={(item) => <ActivityRow item={item} />}
          />
        ) : (
          <EmptyStateCard compact iconName="time-outline" title="No recent activity" />
        )
      }
    />
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    divider: {
      height: 1,
      backgroundColor: mobileColors.borderSubtle,
    },
    row: {
      gap: 4,
    },
    rowHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
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
