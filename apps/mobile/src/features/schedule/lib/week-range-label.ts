import type { MobileScheduleRange } from "@dubgrid/contracts";
import { formatScheduleRange, getScheduleRangeForDate } from "@dubgrid/schedule-core";

/** "Nov 15 - Nov 21" as "Nov 15 - 21": a week inside one month needs its name once. */
export function compactSameMonthRange(label: string): string {
  return label.replace(/^(\S+) (\d+) - \1 (\d+)$/, "$1 $2 - $3");
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeekHeading = {
  /** This week, Next week or Last week; further out, the week's dates. */
  title: string;
  /** The week's dates under a relative title; null when the title is the dates. */
  dates: string | null;
  isThisWeek: boolean;
};

/**
 * Home's title for the week on screen. A week near today is named by where it
 * lies, with its dates under it; any other week is named by its dates alone,
 * so the page never says the same thing twice.
 */
export function getWeekHeading(
  range: MobileScheduleRange,
  todayDate: string,
  timeZone?: string | null,
): WeekHeading {
  const dates = compactSameMonthRange(formatScheduleRange(range, timeZone));
  const thisWeekStart = getScheduleRangeForDate(todayDate).startDate;
  const offset = Math.round((Date.parse(range.startDate) - Date.parse(thisWeekStart)) / WEEK_MS);
  const relative =
    offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : null;
  return relative
    ? { title: relative, dates, isThisWeek: offset === 0 }
    : { title: dates, dates: null, isThisWeek: false };
}

/** The day beside Home's week: "Today", or "Wednesday 25"; the week above names the month. */
export function formatSplitDayTitle(date: string, todayDate: string): string {
  if (date === todayDate) return "Today";
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday} ${day}`;
}
