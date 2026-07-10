import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import { formatUsDate, formatUsTime } from "../../../shared/lib/dates";
import { getMySchedule } from "../../../shared/lib/api";

export function MyScheduleCard({ accessToken }: { accessToken: string | null }) {
  const query = useQuery({
    queryKey: ["mobile", "dashboard", "my-schedule", accessToken],
    queryFn: () => getMySchedule(accessToken!),
    enabled: Boolean(accessToken),
  });

  const workedEntries = (query.data?.entries ?? []).filter((entry) => entry.state.kind === "worked");

  if (query.isLoading) {
    return null;
  }

  return (
    <Card
      title="Your schedule"
      icon="calendar-outline"
      iconTone="brand"
      detail={
        workedEntries.length > 0 ? (
          <View style={styles.list}>
            {workedEntries.map((entry) => (
              <View key={`${entry.date}-${entry.employeeId}`} style={styles.row}>
                <Text style={styles.label}>{formatUsDate(entry.date)}</Text>
                <Text style={styles.value}>
                  {entry.presentation.label}
                  {entry.presentation.startTime && entry.presentation.endTime
                    ? ` · ${formatUsTime(entry.presentation.startTime)}–${formatUsTime(entry.presentation.endTime)}`
                    : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <EmptyStateCard compact iconName="calendar-outline" title="You're not scheduled this week" />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
