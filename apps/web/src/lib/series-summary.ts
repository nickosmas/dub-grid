import type { SeriesFrequency } from "@/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const MAX_CALENDAR_WEEKS = 6;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function partsOf(date: string): DateParts {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function toUtc(date: string): Date {
  const { year, month, day } = partsOf(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function toKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = toUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return toKey(value);
}

function weekdayIndex(date: string): number {
  return toUtc(date).getUTCDay();
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Every day", "Every week on Mon and Wed", "Every 2 weeks on Tue". */
export function describeSeriesPattern(pattern: {
  frequency: SeriesFrequency;
  daysOfWeek: number[] | null;
  startDate: string;
}): string {
  if (pattern.frequency === "daily") return "Every day";
  const days =
    pattern.daysOfWeek && pattern.daysOfWeek.length > 0
      ? [...pattern.daysOfWeek].sort((a, b) => a - b)
      : [weekdayIndex(pattern.startDate)];
  const dayText = joinWithAnd(days.map((day) => WEEKDAYS[day]));
  return pattern.frequency === "biweekly"
    ? `Every 2 weeks on ${dayText}`
    : `Every week on ${dayText}`;
}

function monthDay(date: string): string {
  const { month, day } = partsOf(date);
  return `${MONTHS[month - 1]} ${day}`;
}

/** "Oct 26 to Nov 4, 2026 · 4 days", from the days the series holds. */
export function formatSeriesSpan(occurrenceDates: string[]): string | null {
  if (occurrenceDates.length === 0) return null;
  const sorted = [...occurrenceDates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const count = `${sorted.length} ${sorted.length === 1 ? "day" : "days"}`;
  const firstYear = partsOf(first).year;
  const lastYear = partsOf(last).year;
  if (first === last) return `${monthDay(first)}, ${firstYear} · ${count}`;
  const range =
    firstYear === lastYear
      ? `${monthDay(first)} to ${monthDay(last)}, ${lastYear}`
      : `${monthDay(first)}, ${firstYear} to ${monthDay(last)}, ${lastYear}`;
  return `${range} · ${count}`;
}

/** Which day of the series `date` is, counting from 1, or null when it isn't one. */
export function seriesDayPosition(
  occurrenceDates: string[],
  date: string,
): { index: number; total: number } | null {
  const sorted = [...occurrenceDates].sort();
  const position = sorted.indexOf(date);
  return position === -1 ? null : { index: position + 1, total: sorted.length };
}

export interface SeriesCalendarDay {
  date: string;
  day: number;
  /** "Nov" on the first of a month, so a calendar crossing months stays readable. */
  monthLabel: string | null;
  inSeries: boolean;
  isThisDay: boolean;
  changedOnItsOwn: boolean;
}

export interface SeriesCalendar {
  weeks: SeriesCalendarDay[][];
  /** True when the series runs past the weeks shown. */
  clipped: boolean;
}

/**
 * Sunday-to-Saturday weeks covering the series, at most six, centred on `date`
 * when the series runs longer.
 */
export function buildSeriesCalendar(
  occurrenceDates: string[],
  date: string,
  changedDates: string[] = [],
): SeriesCalendar {
  const sorted = [...occurrenceDates].sort();
  if (sorted.length === 0) return { weeks: [], clipped: false };
  const inSeries = new Set(sorted);
  const changed = new Set(changedDates);

  const firstWeek = addDays(sorted[0], -weekdayIndex(sorted[0]));
  const last = sorted[sorted.length - 1];
  const lastWeek = addDays(last, -weekdayIndex(last));
  const totalWeeks =
    Math.round((toUtc(lastWeek).getTime() - toUtc(firstWeek).getTime()) / (7 * 86_400_000)) + 1;

  let start = firstWeek;
  const clipped = totalWeeks > MAX_CALENDAR_WEEKS;
  if (clipped) {
    const thisWeek = addDays(date, -weekdayIndex(date));
    const latestStart = addDays(lastWeek, -7 * (MAX_CALENDAR_WEEKS - 1));
    const preferred = addDays(thisWeek, -14);
    start = preferred < firstWeek ? firstWeek : preferred > latestStart ? latestStart : preferred;
  }

  const weeks: SeriesCalendarDay[][] = [];
  for (let week = 0; week < Math.min(totalWeeks, MAX_CALENDAR_WEEKS); week += 1) {
    const days: SeriesCalendarDay[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const key = addDays(start, week * 7 + offset);
      const { month, day } = partsOf(key);
      days.push({
        date: key,
        day,
        monthLabel: day === 1 ? MONTHS[month - 1] : null,
        inSeries: inSeries.has(key),
        isThisDay: key === date,
        changedOnItsOwn: inSeries.has(key) && changed.has(key),
      });
    }
    weeks.push(days);
  }
  return { weeks, clipped };
}

export interface SeriesStateLike {
  kind?: string | null;
  absenceTypeId?: number | null;
  segments?: Array<{
    shiftId: number | null;
    jobId: number;
    position?: number | null;
    isMentored?: boolean | null;
  }> | null;
}

export interface SeriesSnapshotLike {
  state_kind: string;
  absence_type_id: number | null;
  custom_start_time: string | null;
  custom_end_time: string | null;
  segments?: Array<{
    position: number;
    shift_id: number | null;
    job_id: number;
    is_mentored: boolean | null;
  }> | null;
}

// JSON state and BIGINT columns may arrive as strings or numbers.
function idOf(value: number | string | null | undefined): number | null {
  return value == null ? null : Number(value);
}

/** Whether a day of the series no longer holds the series' own shift or absence. */
export function seriesDayDiffers(state: SeriesStateLike, snapshot: SeriesSnapshotLike): boolean {
  if (snapshot.state_kind !== state.kind) return true;
  if (idOf(snapshot.absence_type_id) !== idOf(state.absenceTypeId)) return true;
  // Series days are written without custom times, so any custom time is a change.
  if (snapshot.custom_start_time != null || snapshot.custom_end_time != null) return true;

  const expected = [...(state.segments ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const actual = [...(snapshot.segments ?? [])].sort((a, b) => a.position - b.position);
  if (expected.length !== actual.length) return true;
  return expected.some((segment, index) => {
    const other = actual[index];
    return (
      idOf(segment.shiftId) !== idOf(other.shift_id) ||
      idOf(segment.jobId) !== idOf(other.job_id) ||
      Boolean(segment.isMentored) !== Boolean(other.is_mentored)
    );
  });
}

export type SeriesScopeChoice = "this" | "following" | "previous" | "all";

export interface SeriesScopeOption {
  scope: SeriesScopeChoice;
  label: string;
  /** "Oct 28 to Nov 4, 2026 · 3 days", or null when the series' days are unknown. */
  detail: string | null;
  /** Days the choice reaches, or null when unknown. */
  count: number | null;
}

function longDay(date: string): string {
  return `${WEEKDAYS[weekdayIndex(date)]}, ${monthDay(date)}`;
}

/** The four ways an edit or removal can reach a repeating item's days. */
export function seriesScopeOptions(
  occurrenceDates: string[] | null,
  date: string,
): SeriesScopeOption[] {
  const sorted = occurrenceDates ? [...occurrenceDates].sort() : null;
  const reach = (dates: string[] | null) => ({
    detail: dates ? formatSeriesSpan(dates) : null,
    count: dates ? dates.length : null,
  });
  return [
    { scope: "this", label: "This day only", detail: longDay(date), count: 1 },
    {
      scope: "following",
      label: "This and later days",
      ...reach(sorted ? sorted.filter((day) => day >= date) : null),
    },
    {
      scope: "previous",
      label: "This and earlier days",
      ...reach(sorted ? sorted.filter((day) => day <= date) : null),
    },
    { scope: "all", label: "All days in the series", ...reach(sorted) },
  ];
}
