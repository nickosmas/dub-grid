import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { addDaysToIsoDate, getDaysBetweenIsoDates } from "@dubgrid/schedule-core";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileRadii, mobileText } from "../../../shared/theme/tokens";
import { formatUsTime } from "../../../shared/lib/dates";
import { getMySchedule } from "../../../shared/lib/api";
import { ExpandButton } from "./ExpandButton";

const DAY_CARD_WIDTH = 132;
const DAY_CARD_GAP = 10;

function formatDayHeader(dateIso: string): { weekday: string; dayNumber: string } {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date).toUpperCase();
  const dayNumber = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);
  return { weekday, dayNumber };
}

function buildDateList(startDate: string, endDate: string): string[] {
  const dayCount = getDaysBetweenIsoDates(startDate, endDate) + 1;
  return Array.from({ length: Math.max(dayCount, 0) }, (_, index) =>
    addDaysToIsoDate(startDate, index),
  );
}

// One card per day in the period, matching web's MyScheduleRow.tsx DayBox
// strip (apps/web/src/components/dashboard/MyScheduleRow.tsx) — spelled-out
// shift names, swipeable, empty days shown as their own placeholder card
// rather than dropped entirely.
export function MyScheduleCard({
  accessToken,
  onExpand,
}: {
  accessToken: string | null;
  onExpand?: () => void;
}) {
  const query = useQuery({
    queryKey: ["mobile", "dashboard", "my-schedule", accessToken],
    queryFn: () => getMySchedule(accessToken!),
    enabled: Boolean(accessToken),
  });

  if (query.isLoading) {
    return null;
  }

  const range = query.data?.range;
  const entries = query.data?.entries ?? [];
  const entryByDate = new Map<string, MobileScheduleEntry>(entries.map((entry) => [entry.date, entry]));
  const dates = range ? buildDateList(range.startDate, range.endDate) : [];

  return (
    <Card
      title="Your schedule"
      icon="calendar-outline"
      iconTone="brand"
      headerAccessory={
        onExpand ? (
          <ExpandButton accessibilityLabel="Expand your schedule" onPress={onExpand} />
        ) : undefined
      }
      detail={
        dates.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={DAY_CARD_WIDTH + DAY_CARD_GAP}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
          >
            {dates.map((dateIso) => {
              const entry = entryByDate.get(dateIso);
              const { weekday, dayNumber } = formatDayHeader(dateIso);
              const isWorked = entry?.state.kind === "worked";
              const isAbsence = entry?.state.kind === "absence";

              return (
                <View key={dateIso} style={styles.dayCard}>
                  <Text style={styles.dayHeader}>
                    {weekday} {dayNumber}
                  </Text>
                  {isWorked && entry ? (
                    <View style={styles.shiftPill}>
                      <Text numberOfLines={2} style={styles.shiftName}>
                        {entry.presentation.shiftName || entry.presentation.label}
                      </Text>
                      {entry.presentation.startTime && entry.presentation.endTime ? (
                        <Text style={styles.shiftTime}>
                          {formatUsTime(entry.presentation.startTime)}–
                          {formatUsTime(entry.presentation.endTime)}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.emptyPill}>
                      <Text style={styles.emptyText}>{isAbsence ? "Off" : "—"}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <EmptyStateCard compact iconName="calendar-outline" title="You're not scheduled this week" />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  // Cancels Card's own 18px horizontal padding (Screen.tsx's `card` style)
  // so the scroll track itself bleeds edge-to-edge instead of sitting inset —
  // everything else in the card (title, icon) keeps the normal padding. The
  // same 18px comes back as contentContainerStyle padding below, so the
  // first/last day cards still sit inset at rest; only the track between
  // them (visible while actively scrolling) is truly edge-to-edge.
  scrollView: {
    marginHorizontal: -18,
  },
  scrollContent: {
    gap: DAY_CARD_GAP,
    paddingHorizontal: 18,
  },
  dayCard: {
    width: DAY_CARD_WIDTH,
    gap: 8,
    backgroundColor: mobileColors.surfaceSecondary,
    borderRadius: mobileRadii.control,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 12,
  },
  dayHeader: {
    ...mobileText.label,
    color: mobileColors.textMuted,
  },
  shiftPill: {
    gap: 2,
  },
  shiftName: {
    ...mobileText.bodyStrong,
    color: mobileColors.textPrimary,
  },
  shiftTime: {
    ...mobileText.caption,
    color: mobileColors.textMuted,
  },
  emptyPill: {
    minHeight: 36,
    justifyContent: "center",
  },
  emptyText: {
    ...mobileText.body,
    color: mobileColors.textSubtle,
  },
});
