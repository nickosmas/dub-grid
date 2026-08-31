import type { TimeRange, MobileScheduleRange } from "./types";

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Canonical local-calendar "YYYY-MM-DD" key <-> Date pair. Round-trips
 * exactly regardless of server timezone because both directions use LOCAL
 * getters/constructor args throughout — never mixed with `.toISOString()`
 * (UTC). That mixing is a real bug class: `new Date(key + "T00:00:00")`
 * (local midnight) formatted back via `.toISOString().slice(0, 10)` (UTC)
 * silently shifts the date back one day on any server whose local timezone
 * is ahead of UTC — it round-tripped "2026-08-23" to "2026-08-22" on a
 * UTC+3 host, which is exactly what caused mobile's coverage/gap totals to
 * drop the first day of a published week's requirements (see
 * `apps/web/src/features/mobile/server/data.ts`'s old `formatMobileIsoDate`
 * and `packages/mobile-api-core/src/dashboard.ts`'s old
 * `getDateKeysInRange`, both since migrated to this pair). Use these two
 * functions — not a local re-implementation — anywhere a Date needs to
 * round-trip through a calendar-day string key.
 */
export function parseLocalDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  if (a.start > a.end) {
    return (
      rangesOverlap({ start: a.start, end: "24:00" }, b) ||
      rangesOverlap({ start: "00:00", end: a.end }, b)
    );
  }
  if (b.start > b.end) {
    return (
      rangesOverlap(a, { start: b.start, end: "24:00" }) ||
      rangesOverlap(a, { start: "00:00", end: b.end })
    );
  }
  return a.start < b.end && b.start < a.end;
}

export function timesOverlap(a: TimeRange[], b: TimeRange[]): boolean {
  return a.some((r1) => b.some((r2) => rangesOverlap(r1, r2)));
}

function formatIsoDateUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function formatCompactScheduleDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function getCompactScheduleDateParts(value: string): {
  weekdayLabel: string;
  dayLabel: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(`${value}T00:00:00.000Z`));

  return {
    weekdayLabel: (parts.find((part) => part.type === "weekday")?.value ?? "").toUpperCase(),
    dayLabel: parts.find((part) => part.type === "day")?.value ?? "",
  };
}

export function getScheduleWeekStartDate(value: string): string {
  const date = parseIsoDate(value);
  return addDaysToIsoDate(value, -date.getUTCDay());
}

export function getScheduleMonthStartDate(value: string): string {
  const date = parseIsoDate(value);
  date.setUTCDate(1);
  return formatIsoDateUtc(date);
}

export function getScheduleMonthEndDate(value: string): string {
  const date = parseIsoDate(getScheduleMonthStartDate(value));
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return formatIsoDateUtc(date);
}

export function addMonthsToIsoDate(value: string, months: number): string {
  const date = parseIsoDate(value);
  const originalDay = date.getUTCDate();

  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);

  const daysInTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();

  date.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return formatIsoDateUtc(date);
}

export function getDaysBetweenIsoDates(startDate: string, endDate: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (parseIsoDate(endDate).getTime() - parseIsoDate(startDate).getTime()) / millisecondsPerDay,
  );
}

function getDatePartsInTimeZone(
  value: Date,
  timeZone?: string | null,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  return {
    year,
    month,
    day,
  };
}

export function getIsoDateInTimeZone(value: Date, timeZone?: string | null): string {
  const parts = getDatePartsInTimeZone(value, timeZone);
  return `${parts.year}-${`${parts.month}`.padStart(2, "0")}-${`${parts.day}`.padStart(2, "0")}`;
}

export function getCurrentTimeValueInTimeZone(value: Date, timeZone?: string | null): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(value);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function addDaysToIsoDate(value: string, days: number): string {
  const next = parseIsoDate(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * Formats a publish_history `publishedAt` timestamptz as "Aug 23, 2026, 2:30
 * PM" in the org's timezone — date AND time, not just date. Canonical so web
 * and mobile render publish info identically instead of each formatting it
 * separately (mobile's shiftDetailHelpers.ts used to have its own copy).
 */
export function formatPublishedAt(
  value: string | null | undefined,
  timeZone?: string | null,
): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? "UTC",
  }).format(new Date(value));
}

/** "Published <when> by <who>" — omits either half when its value is null. */
export function formatPublishedSummary(
  publishedByName: string | null | undefined,
  publishedAtLabel: string | null | undefined,
): string | null {
  if (publishedByName && publishedAtLabel) {
    return `Published ${publishedAtLabel} by ${publishedByName}`;
  }
  if (publishedAtLabel) {
    return `Published ${publishedAtLabel}`;
  }
  if (publishedByName) {
    return `Published by ${publishedByName}`;
  }
  return null;
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
  _timeZone?: string | null,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(parseIsoDate(value));
}

export function getScheduleRange(
  offsetWeeks: number,
  timeZone?: string | null,
  baseDate = new Date(),
): MobileScheduleRange {
  const anchorDate = addDaysToIsoDate(getIsoDateInTimeZone(baseDate, timeZone), offsetWeeks * 7);
  const startDate = getScheduleWeekStartDate(anchorDate);

  return {
    startDate,
    endDate: addDaysToIsoDate(startDate, 6),
  };
}

export function getScheduleRangeForDate(date: string): MobileScheduleRange {
  const startDate = getScheduleWeekStartDate(date);

  return {
    startDate,
    endDate: addDaysToIsoDate(startDate, 6),
  };
}

export function formatScheduleRange(range: MobileScheduleRange, timeZone?: string | null): string {
  const start = formatDate(range.startDate, { month: "short", day: "numeric" }, timeZone);
  const end = formatDate(range.endDate, { month: "short", day: "numeric" }, timeZone);
  return `${start} - ${end}`;
}

export function formatScheduleDayLabel(
  date: string,
  today = new Date(),
  timeZone?: string | null,
): string {
  const isoToday = getIsoDateInTimeZone(today, timeZone);
  if (date === isoToday) {
    return `Today, ${formatDate(date, { month: "short", day: "numeric" }, timeZone)}`;
  }

  if (date === addDaysToIsoDate(isoToday, -1)) {
    return `Yesterday, ${formatDate(date, { month: "short", day: "numeric" }, timeZone)}`;
  }

  if (date === addDaysToIsoDate(isoToday, 1)) {
    return `Tomorrow, ${formatDate(date, { month: "short", day: "numeric" }, timeZone)}`;
  }

  return formatDate(date, { weekday: "short", month: "short", day: "numeric" }, timeZone);
}

export function formatScheduleSectionSubtitle(entryCount: number, scope: "mine" | "team"): string {
  if (scope === "team") {
    return `${entryCount} ${entryCount === 1 ? "assignment" : "assignments"}`;
  }
  return `${entryCount} ${entryCount === 1 ? "shift" : "shifts"}`;
}

export function formatScheduleTimeRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;

  return `${formatScheduleTimeValue(start)} - ${formatScheduleTimeValue(end)}`;
}

export function formatScheduleTimeValue(value: string): string {
  const [rawHours, minutes] = value.split(":");
  const hours = Number(rawHours);
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${minutes} ${suffix}`;
}
