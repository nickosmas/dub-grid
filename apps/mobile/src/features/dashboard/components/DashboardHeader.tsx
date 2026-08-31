import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertsHeaderButton } from "../../../shared/navigation/AlertsHeaderButton";
import { TimeZoneClocks } from "../../../shared/components/TimeZoneClocks";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../../../shared/theme/tokens";

type GreetingBucket = "morning" | "afternoon" | "evening";

// Several variations per time-of-day, one picked at random per bucket change
// — mirrors the varied-greeting-pool approach in web's DashboardGreeting.tsx
// (apps/web/src/components/dashboard/DashboardGreeting.tsx), scaled down for
// mobile (no first-visit/session-cache handling).
const GREETING_POOLS: Record<
  GreetingBucket,
  { withName: Array<(name: string) => string>; withoutName: string[] }
> = {
  morning: {
    withName: [
      (name) => `Good morning, ${name}!`,
      (name) => `Morning, ${name}!`,
      (name) => `Rise and shine, ${name}!`,
      (name) => `Let's get the day going, ${name}!`,
    ],
    withoutName: ["Good morning!", "Morning!", "Rise and shine!"],
  },
  afternoon: {
    withName: [
      (name) => `Good afternoon, ${name}!`,
      (name) => `Afternoon, ${name}!`,
      (name) => `Hope your day's going well, ${name}!`,
    ],
    withoutName: ["Good afternoon!", "Afternoon!"],
  },
  evening: {
    withName: [
      (name) => `Good evening, ${name}!`,
      (name) => `Evening, ${name}!`,
      (name) => `Wrapping up the day, ${name}!`,
    ],
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

export function DashboardHeader({
  firstName,
  orgName,
  timezone,
  periodLabel,
}: {
  firstName: string | null;
  orgName: string;
  timezone: string | null;
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
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.meta}>
          {orgName}
          {periodLabel ? ` | ${periodLabel}` : ""}
        </Text>
        <TimeZoneClocks now={now} orgTimezone={timezone} style={styles.timeZoneClock} />
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
      gap: 12,
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    greeting: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    meta: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    timeZoneClock: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
  });
