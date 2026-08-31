import { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../theme/tokens";

export function getDeviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function formatTimeInZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
      timeZoneName: "short",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(now);
  }
}

/**
 * The organization's current clock — renders nothing when the device's
 * timezone matches the organization's, since there is nothing to clarify.
 * Deliberately shows only the facility's time, not the viewer's own: the
 * device's own clock is already visible in the OS status bar, so repeating
 * it here just doubled the text for no new information. Never dismissible:
 * for as long as the viewer is actually in a different timezone, this stays
 * visible as ambient orientation, not a one-time notice.
 */
export function TimeZoneClocks({
  now,
  orgTimezone,
  style,
}: {
  now: Date;
  orgTimezone: string | null;
  style?: StyleProp<TextStyle>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const deviceTimeZone = getDeviceTimeZone() ?? orgTimezone ?? "UTC";
  const effectiveOrgTimeZone = orgTimezone ?? "UTC";

  if (deviceTimeZone === effectiveOrgTimeZone) {
    return null;
  }

  const orgClock = formatTimeInZone(now, effectiveOrgTimeZone);

  return <Text style={style ?? styles.clock}>{`Facility time: ${orgClock}`}</Text>;
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    clock: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
  });
