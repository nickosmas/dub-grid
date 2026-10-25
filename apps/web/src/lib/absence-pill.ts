import { absenceSideOf, clockSpanMinutes, type ClockRange } from "@/components/absence-span";
import { fmt12h } from "@/components/shiftEditTime";
import { fmt12hShort } from "@/lib/utils";

const DAY = 1440;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Where an absence beside the shifts sits in a cell, and the time it covers (item 50d). */
export interface AbsencePillLayout {
  /** It comes before the shifts: they arrived late. */
  first: boolean;
  /** It meets the shift beside it, so the two pills join. */
  joinsShift: boolean;
  /** A grid-short span, "11–3", with the weekday on a time past midnight ("Fri 3–7"). */
  shortTime: string | null;
  /** The 12-hour span, "11:00 AM - 3:00 PM", with the weekday past midnight. */
  time: string | null;
}

/**
 * Lays out the absence beside a cell's shifts (their effective times, in time
 * order) on `date`. An untimed absence, saved before item 50b, reads as before:
 * last, joined to the last shift, with no time of its own.
 */
export function layoutAbsencePill(args: {
  date: Date;
  shifts: ClockRange[];
  absence: ClockRange | null;
}): AbsencePillLayout {
  const { date, shifts, absence } = args;
  if (!absence || shifts.length === 0) {
    return { first: false, joinsShift: true, shortTime: null, time: null };
  }
  const first =
    absenceSideOf(absence, { start: shifts[0].start, end: shifts[shifts.length - 1].end }) ===
    "arrived-late";
  const joinsShift = first
    ? absence.end === shifts[0].start
    : absence.start === shifts[shifts.length - 1].end;

  // Minutes from midnight of the cell's day, following the day's order: an
  // absence that comes first starts the day; otherwise it starts within or
  // after the last shift, so a clock time before that shift's start has
  // crossed midnight.
  let start = minutesOf(absence.start);
  if (!first) {
    let lastStart = minutesOf(shifts[0].start);
    let cursor = lastStart;
    for (const shift of shifts) {
      lastStart = minutesOf(shift.start);
      while (lastStart < cursor) lastStart += DAY;
      cursor = lastStart + clockSpanMinutes(shift);
    }
    while (start < lastStart) start += DAY;
  }
  const end = start + clockSpanMinutes(absence);
  const nextDay = WEEKDAYS[(date.getDay() + 1) % 7];
  // The weekday is named once: on the start when it is already past
  // midnight, otherwise on an end that crosses it.
  const label = (
    minutes: number,
    format: (time: string) => string,
    time: string,
    isEnd: boolean,
  ) => (minutes >= DAY && !(isEnd && start >= DAY) ? `${nextDay} ${format(time)}` : format(time));
  const span = (format: (time: string) => string, separator: string) =>
    `${label(start, format, absence.start, false)}${separator}${label(end, format, absence.end, true)}`;

  return {
    first,
    joinsShift,
    shortTime: span(fmt12hShort, "–"),
    time: span(fmt12h, " - "),
  };
}

/** A shift's span with the weekday on an end past midnight, "11 PM - Fri 3 AM" short as "11–Fri 3". */
export function overnightShortRange(date: Date, range: ClockRange): string {
  const crosses = minutesOf(range.end) <= minutesOf(range.start);
  const nextDay = WEEKDAYS[(date.getDay() + 1) % 7];
  return `${fmt12hShort(range.start)}–${crosses ? `${nextDay} ` : ""}${fmt12hShort(range.end)}`;
}

/** The fields of a schedule entry the absence's layout reads, for its draft or published side. */
export interface AbsenceLayoutEntry {
  segments: ReadonlyArray<{ startTime?: string | null; endTime?: string | null }>;
  customStartTime?: string | null;
  customEndTime?: string | null;
  absenceStartTime?: string | null;
  absenceEndTime?: string | null;
}

/**
 * Lays out a worked cell's absence from its entry: each shift's custom time
 * or default, and the absence's stored span. A shift without a time (a
 * general shift) leaves the absence untimed and last, as before item 50.
 */
export function layoutEntryAbsence(entry: AbsenceLayoutEntry, date: Date): AbsencePillLayout {
  const count = entry.segments.length;
  const part = (time: string | null | undefined, index: number) =>
    (time ?? "").split("|")[index]?.trim().slice(0, 5) || null;
  const shifts = entry.segments.map((segment, index) => ({
    start: part(entry.customStartTime, count === 1 ? 0 : index) ?? segment.startTime?.slice(0, 5),
    end: part(entry.customEndTime, count === 1 ? 0 : index) ?? segment.endTime?.slice(0, 5),
  }));
  const timed = shifts.every((shift): shift is ClockRange => !!shift.start && !!shift.end);
  const absence =
    entry.absenceStartTime && entry.absenceEndTime
      ? { start: entry.absenceStartTime.slice(0, 5), end: entry.absenceEndTime.slice(0, 5) }
      : null;
  return layoutAbsencePill({ date, shifts: timed ? shifts : [], absence: timed ? absence : null });
}
