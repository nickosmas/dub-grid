/**
 * The period an activity log is showing, as calendar-day keys in the
 * organization's timezone. Kept as "YYYY-MM-DD" strings rather than Dates so
 * nothing can silently reinterpret a boundary in the browser's zone; the UTC
 * instants a query needs come from `getZonedDayRangeUtc` at the edge.
 */

import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  formatDate,
  getScheduleMonthEndDate,
  getScheduleMonthStartDate,
  getScheduleWeekStartDate,
} from "@dubgrid/schedule-core";

export type ActivityPeriodUnit = "day" | "week" | "month";

export interface ActivityPeriod {
  unit: ActivityPeriodUnit;
  startDate: string;
  endDate: string;
}

export const ACTIVITY_PERIOD_UNITS: ActivityPeriodUnit[] = ["day", "week", "month"];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function getActivityPeriod(unit: ActivityPeriodUnit, anchorDate: string): ActivityPeriod {
  if (unit === "day") {
    return { unit, startDate: anchorDate, endDate: anchorDate };
  }
  if (unit === "week") {
    const startDate = getScheduleWeekStartDate(anchorDate);
    return { unit, startDate, endDate: addDaysToIsoDate(startDate, 6) };
  }
  return {
    unit,
    startDate: getScheduleMonthStartDate(anchorDate),
    endDate: getScheduleMonthEndDate(anchorDate),
  };
}

export function shiftActivityPeriod(period: ActivityPeriod, delta: -1 | 1): ActivityPeriod {
  if (period.unit === "day") {
    return getActivityPeriod("day", addDaysToIsoDate(period.startDate, delta));
  }
  if (period.unit === "week") {
    return getActivityPeriod("week", addDaysToIsoDate(period.startDate, delta * 7));
  }
  return getActivityPeriod("month", addMonthsToIsoDate(period.startDate, delta));
}

export function isDateInPeriod(period: ActivityPeriod, isoDate: string): boolean {
  return isoDate >= period.startDate && isoDate <= period.endDate;
}

/** "Saturday, September 6, 2026" | "Aug 31 - Sep 6, 2026" | "September 2026" */
export function formatActivityPeriodLabel(period: ActivityPeriod): string {
  if (period.unit === "day") {
    return formatDate(period.startDate, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (period.unit === "month") {
    return formatDate(period.startDate, { month: "long", year: "numeric" });
  }

  const start = formatDate(period.startDate, { month: "short", day: "numeric" });
  const endYear = formatDate(period.endDate, { year: "numeric" });
  const sameMonth = period.startDate.slice(0, 7) === period.endDate.slice(0, 7);
  const end = sameMonth
    ? formatDate(period.endDate, { day: "numeric" })
    : formatDate(period.endDate, { month: "short", day: "numeric" });

  const startYear = formatDate(period.startDate, { year: "numeric" });
  if (startYear !== endYear) {
    return `${start}, ${startYear} - ${end}, ${endYear}`;
  }
  return `${start} - ${end}, ${endYear}`;
}

/**
 * The period as a sentence fragment, so a summary can read "14 events this
 * week" or "3 events in August 2026".
 */
export function formatActivityPeriodPhrase(period: ActivityPeriod, todayDate: string): string {
  const current = getActivityPeriod(period.unit, todayDate);
  const isCurrent = current.startDate === period.startDate;

  if (period.unit === "day") {
    if (isCurrent) return "today";
    if (period.startDate === addDaysToIsoDate(todayDate, -1)) return "yesterday";
    return `on ${formatDate(period.startDate, { month: "short", day: "numeric", year: "numeric" })}`;
  }

  if (period.unit === "week") {
    if (isCurrent) return "this week";
    return `the week of ${formatDate(period.startDate, { month: "short", day: "numeric" })}`;
  }

  if (isCurrent) return "this month";
  return `in ${formatDate(period.startDate, { month: "long", year: "numeric" })}`;
}

/** The Today button's label, which names the period it returns to. */
export function formatActivityTodayLabel(unit: ActivityPeriodUnit): string {
  if (unit === "day") return "Today";
  if (unit === "week") return "This week";
  return "This month";
}

export function isCurrentActivityPeriod(period: ActivityPeriod, todayDate: string): boolean {
  return isDateInPeriod(period, todayDate);
}

/**
 * Reads the period out of the URL, falling back to the current week whenever
 * either value is missing or malformed. A shared link should never render an
 * error; the worst case is that it shows this week.
 */
export function parseActivityPeriodParams(
  params: { period?: string | null; date?: string | null },
  todayDate: string,
): { unit: ActivityPeriodUnit; anchorDate: string } {
  const unit = ACTIVITY_PERIOD_UNITS.find((value) => value === params.period);
  const date = params.date && isValidDateKey(params.date) ? params.date : null;

  if (!unit) {
    return { unit: "week", anchorDate: date ?? todayDate };
  }
  return { unit, anchorDate: date ?? todayDate };
}
