import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";

const CLOCK_TICK_MS = 60_000;

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

function formatOrgTime(timezone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
      timeZone: timezone ?? "UTC",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  }
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
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const bucket = getBucket(now.getHours());
  const name = firstName?.trim() ?? null;
  // Recomputed only when the bucket (or name) changes, so the picked variant
  // stays stable across the 60s clock ticks instead of reshuffling every tick.
  const greeting = useMemo(() => pickGreeting(bucket, name), [bucket, name]);
  const orgTime = formatOrgTime(timezone);

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>{greeting}</Text>
      <Text style={styles.meta}>
        {orgName} · {orgTime}
        {periodLabel ? ` | ${periodLabel}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
