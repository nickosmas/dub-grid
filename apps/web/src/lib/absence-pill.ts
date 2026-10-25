import {
  absenceBaseFromCell,
  absenceSideOf,
  clockSpanMinutes,
  type ClockRange,
} from "@/components/absence-span";
import type { ScheduleCellInput } from "@/types";
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
  /** The stored span itself, for change records (item 50e). */
  range?: ClockRange | null;
  /** The published cell's span, for comparing a draft with it. */
  publishedRange?: ClockRange | null;
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
/** A worked entry's absence span and its work's span, first start to last end; null when unknown. */
export function entryAbsenceSpan(entry: AbsenceLayoutEntry): {
  absence: ClockRange | null;
  work: ClockRange | null;
} {
  const count = entry.segments.length;
  const part = (time: string | null | undefined, index: number) =>
    (time ?? "").split("|")[index]?.trim().slice(0, 5) || null;
  const shifts = entry.segments.map((segment, index) => ({
    start: part(entry.customStartTime, count === 1 ? 0 : index) ?? segment.startTime?.slice(0, 5),
    end: part(entry.customEndTime, count === 1 ? 0 : index) ?? segment.endTime?.slice(0, 5),
  }));
  const timed =
    count > 0 && shifts.every((shift): shift is ClockRange => !!shift.start && !!shift.end);
  return {
    absence:
      entry.absenceStartTime && entry.absenceEndTime
        ? { start: entry.absenceStartTime.slice(0, 5), end: entry.absenceEndTime.slice(0, 5) }
        : null,
    work: timed ? { start: shifts[0].start!, end: shifts[count - 1].end! } : null,
  };
}

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

/**
 * A worked cell's input without the absence beside its shifts (item 50g):
 * the shift the absence cut goes back to its scheduled edge, and the others
 * keep their own times. `segments` carry each shift's scheduled times.
 */
export function withoutAbsenceBesideShifts(
  input: ScheduleCellInput,
  segments: ReadonlyArray<{ startTime?: string | null; endTime?: string | null }>,
): ScheduleCellInput {
  if (input.kind !== "worked" || input.absenceTypeId == null) return input;
  const count = input.segments.length;
  const part = (time: string | null | undefined, index: number) =>
    (time ?? "").split("|")[index]?.trim().slice(0, 5) || null;
  const shifts = input.segments.map((_, index) => {
    const segment = segments[index];
    const scheduled =
      segment?.startTime && segment.endTime
        ? { start: segment.startTime.slice(0, 5), end: segment.endTime.slice(0, 5) }
        : null;
    return {
      scheduled,
      customStart: part(input.customStartTime, index),
      customEnd: part(input.customEndTime, index),
    };
  });
  const span =
    input.absenceStartTime && input.absenceEndTime
      ? { start: input.absenceStartTime.slice(0, 5), end: input.absenceEndTime.slice(0, 5) }
      : null;
  const timed = shifts.every((shift) => shift.scheduled != null);
  let starts = shifts.map((shift) => shift.customStart);
  let ends = shifts.map((shift) => shift.customEnd);
  if (timed && count > 0) {
    const baseShifts = shifts.map((shift) => ({
      scheduled: shift.scheduled!,
      customStart: shift.customStart,
      customEnd: shift.customEnd,
    }));
    const work = {
      start: baseShifts[0].customStart ?? baseShifts[0].scheduled.start,
      end: baseShifts[count - 1].customEnd ?? baseShifts[count - 1].scheduled.end,
    };
    const { base } = absenceBaseFromCell({
      shifts: baseShifts,
      side: absenceSideOf(span, work),
      absence: span,
    });
    starts = base.shifts.map((shift) => shift.customStart);
    ends = base.shifts.map((shift) => shift.customEnd);
  }
  const join = (times: Array<string | null>) =>
    times.every((time) => !time) ? null : times.map((time) => time ?? "").join("|");
  return {
    ...input,
    absenceTypeId: null,
    absenceStartTime: null,
    absenceEndTime: null,
    customStartTime: join(starts),
    customEndTime: join(ends),
  };
}
