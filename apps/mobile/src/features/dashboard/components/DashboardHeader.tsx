import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertsHeaderButton } from "../../../shared/navigation/AlertsHeaderButton";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileSpace,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

type GreetingBucket = "morning" | "afternoon" | "evening";

// Two words, always. The web dashboard's longer greetings ("Wrapping up the
// day, Nic!") wrapped the mobile headline to two lines at `display` size and
// made the header the busiest thing on the page. A couple of variants per
// time of day keep it from reading as a fixed label; one is picked per
// bucket change.
const GREETING_POOLS: Record<
  GreetingBucket,
  { withName: Array<(name: string) => string>; withoutName: string[] }
> = {
  morning: {
    withName: [(name) => `Morning, ${name}!`, (name) => `Hi, ${name}!`],
    withoutName: ["Good morning!", "Morning!"],
  },
  afternoon: {
    withName: [(name) => `Afternoon, ${name}!`, (name) => `Hi, ${name}!`],
    withoutName: ["Good afternoon!", "Afternoon!"],
  },
  evening: {
    withName: [(name) => `Evening, ${name}!`, (name) => `Hi, ${name}!`],
    withoutName: ["Good evening!", "Evening!"],
  },
};

function getBucket(hour: number): GreetingBucket {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

function pickGreeting(bucket: GreetingBucket, name: string | null): string {
  const pool = GREETING_POOLS[bucket];
  if (name) {
    const templates = pool.withName;
    return templates[Math.floor(Math.random() * templates.length)](name);
  }
  const templates = pool.withoutName;
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * The dashboard's headline: a two-word greeting, the period beneath it, the
 * alerts bell beside it. Nothing else: the organization's name is a fact the
 * Profile tab already carries, and the facility clock lives on the Schedule
 * tab, where the time actually matters.
 */
export function DashboardHeader({
  firstName,
  periodLabel,
}: {
  firstName: string | null;
  periodLabel?: string;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const now = useRealtimeNow();

  const bucket = getBucket(now.getHours());
  const name = firstName?.trim() ?? null;
  // Recomputed only when the bucket (or name) changes, so the picked variant
  // stays stable across the 60s clock ticks instead of reshuffling every tick.
  const greeting = useMemo(() => pickGreeting(bucket, name), [bucket, name]);

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.greeting}>
          {greeting}
        </Text>
        {periodLabel ? <Text style={styles.meta}>{periodLabel}</Text> : null}
      </View>
      <AlertsHeaderButton />
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: mobileSpace.md,
    },
    copy: {
      flex: 1,
      gap: mobileSpace.xs,
    },
    // The one headline on a headerless screen, a step above the card titles
    // beneath it so the page reads top-down rather than as a column of equals.
    greeting: {
      ...mobileText.display,
      color: mobileColors.textPrimary,
    },
    // The period is a date range, so it takes tabular figures like every
    // other schedule date.
    meta: {
      ...mobileText.meta,
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
  });
