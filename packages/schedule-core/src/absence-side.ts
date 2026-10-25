import { formatScheduleTimeValue } from "./dates";
import { getMinutesSinceMidnight } from "./schedule-time";

/** Which part of the work an absence beside it covers (item 50). */
export type AbsenceSide = "left-early" | "arrived-late";

const DAY = 1440;

function clock(time: string): number {
  return getMinutesSinceMidnight(time) ?? 0;
}

/**
 * Which side a stored absence is on, from the work's span (the first shift's
 * start to the last one's end): left early when it starts within that span or
 * nearer its end, arrived late when it ends nearer its start. An untimed
 * absence is left early.
 */
export function absenceSideOf(
  absence: { start: string; end: string } | null,
  work: { start: string; end: string } | null,
): AbsenceSide {
  if (!absence || !work) return "left-early";
  const start = clock(work.start);
  const workMinutes = (clock(work.end) - start + DAY) % DAY || DAY;
  const startsAfter = (clock(absence.start) - start + DAY) % DAY;
  if (startsAfter <= workMinutes) return "left-early";
  const endsBefore = (start - clock(absence.end) + DAY) % DAY;
  return endsBefore < startsAfter - workMinutes ? "arrived-late" : "left-early";
}

/**
 * A worked cell as one line of text with its absence beside it (item 50):
 * "Day / Sick 11:00 AM - 3:00 PM", or "Sick 7:00 AM - 11:00 AM / Day" when
 * they arrived late. An untimed absence reads as before, "Day / Sick".
 */
export function joinAbsenceBesideShifts(
  shiftText: string,
  absenceName: string,
  absence: { start: string; end: string } | null,
  work: { start: string; end: string } | null,
): string {
  if (!absence) return `${shiftText} / ${absenceName}`;
  const label = `${absenceName} ${formatScheduleTimeValue(absence.start)} - ${formatScheduleTimeValue(absence.end)}`;
  return absenceSideOf(absence, work) === "arrived-late"
    ? `${label} / ${shiftText}`
    : `${shiftText} / ${label}`;
}

/**
 * Why a worked cell's absence keeps its person from taking work at `ranges`
 * that day, if it does (owner decisions, 2026-10-24): after leaving early (or
 * an absence saved without a time) they take no more work that day; an
 * arrived-late absence blocks only work that overlaps it.
 */
export function absenceBlocksWork(
  absence: { start: string; end: string } | null,
  work: { start: string; end: string } | null,
  ranges: ReadonlyArray<{ start: string; end: string }>,
): "rest-of-day" | "overlap" | null {
  if (!absence || absenceSideOf(absence, work) === "left-early") return "rest-of-day";
  const interval = (range: { start: string; end: string }) => {
    const from = clock(range.start);
    return { from, to: from + ((clock(range.end) - from + DAY) % DAY || DAY) };
  };
  const away = interval(absence);
  const overlaps = ranges.some((range) => {
    const taken = interval(range);
    return [-DAY, 0, DAY].some(
      (shift) => taken.from + shift < away.to && away.from < taken.to + shift,
    );
  });
  return overlaps ? "overlap" : null;
}
