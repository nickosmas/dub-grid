"use client";

import { getBrowserTimezone } from "@/lib/timezones";

function formatTimeInZone(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
      timeZoneName: "short",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now);
  }
}

function formatDateInZone(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: tz,
    }).format(now);
  } catch {
    return "";
  }
}

export interface TimeZoneClocksProps {
  now: Date;
  /** Organization-configured timezone (organizations.timezone). Defaults to UTC when null. */
  orgTimezone?: string | null;
  /** Omits the date, showing only the clock time(s) — for tighter spots that already show a date elsewhere (e.g. the schedule toolbar). */
  compact?: boolean;
}

/**
 * "Local time" / "Organization time" clocks — renders nothing when the
 * viewer's browser timezone matches the organization's, since there is
 * nothing to clarify. Never dismissible: for as long as the viewer is
 * actually in a different timezone, this stays visible as ambient
 * orientation, not a one-time notice.
 */
export default function TimeZoneClocks({
  now,
  orgTimezone = null,
  compact = false,
}: TimeZoneClocksProps) {
  const userTz = getBrowserTimezone() ?? orgTimezone ?? "UTC";
  const effectiveOrgTz = orgTimezone ?? "UTC";
  if (userTz === effectiveOrgTz) {
    return null;
  }
  const userClock = formatTimeInZone(now, userTz);
  const orgClock = formatTimeInZone(now, effectiveOrgTz);
  const userDate = compact ? null : formatDateInZone(now, userTz);
  const orgDate = compact ? null : formatDateInZone(now, effectiveOrgTz);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "2px 14px",
        fontSize: "var(--dg-fs-body-sm, 14px)",
        color: "var(--dg-color-text-muted)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span>
        <span style={{ color: "var(--dg-color-text-faint)" }}>Local time</span> ·{" "}
        {compact ? userClock : `${userDate} · ${userClock}`}
      </span>
      <span>
        <span style={{ color: "var(--dg-color-text-faint)" }}>Organization time</span> ·{" "}
        {compact ? orgClock : `${orgDate} · ${orgClock}`}
      </span>
    </div>
  );
}
