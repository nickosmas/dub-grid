import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import { ExpandableList } from "./ExpandableList";

function formatRelativeTime(isoTimestamp: string): string {
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

export function ActivityFeedCard({ items }: { items: MobileDashboardResponse["activity"] }) {
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
            renderDivider={() => <View style={styles.divider} />}
            renderItem={(item) => (
              <View style={styles.row}>
                <Text style={styles.label}>{item.description}</Text>
                <Text style={styles.value}>{formatRelativeTime(item.timestamp)}</Text>
              </View>
            )}
          />
        ) : (
          <EmptyStateCard compact iconName="sparkles-outline" title="No recent activity" />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: mobileColors.borderSubtle,
  },
  row: {
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
