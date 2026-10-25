/**
 * Item 50c: what an absence beside a shift means for the cell. Someone either
 * left early (the absence covers the rest) or arrived late (it covers the
 * start), at one time. The shift that time falls in is cut there, and a shift
 * they missed entirely comes off for the absence to cover.
 */

import { absenceSideOf, type AbsenceSide } from "@dubgrid/schedule-core";

export { absenceSideOf, type AbsenceSide };

export type AbsenceSpanProblem = "unset" | "no-time-covered" | "never-started" | "outside-shift";

export interface ClockRange {
  start: string;
  end: string;
}

export interface AbsenceSpanPlan {
  problem: AbsenceSpanProblem | null;
  /** The shift the time falls inside, which now ends (or starts) there. */
  cutIndex: number | null;
  keptIndexes: number[];
  removedIndexes: number[];
  absence: ClockRange | null;
}

const DAY = 1440;

function clockMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function clockTime(minutes: number): string {
  const wrapped = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/** The shifts as minutes along the day from the first one's start, overnight aware. */
function timeline(shifts: ClockRange[]): Array<{ start: number; end: number }> {
  const base = clockMinutes(shifts[0].start);
  const along = (time: string) => (clockMinutes(time) - base + DAY) % DAY;
  const ranges: Array<{ start: number; end: number }> = [];
  for (const shift of shifts) {
    const previousEnd = ranges.at(-1)?.end ?? 0;
    let start = along(shift.start);
    while (start < previousEnd) start += DAY;
    let end = start + ((clockMinutes(shift.end) - clockMinutes(shift.start) + DAY) % DAY || DAY);
    if (end <= start) end += DAY;
    ranges.push({ start, end });
  }
  return ranges;
}

const unplanned = (problem: AbsenceSpanProblem): AbsenceSpanPlan => ({
  problem,
  cutIndex: null,
  keptIndexes: [],
  removedIndexes: [],
  absence: null,
});

/**
 * Plans the cell for an absence beside `shifts` (scheduled times, in time
 * order) at `at`. `extendTo` is the far edge of a stored absence that reaches
 * past the shifts, kept when a shift it covered came off earlier.
 */
export function planAbsenceSpan(args: {
  shifts: ClockRange[];
  side: AbsenceSide;
  at: string | null;
  extendTo?: string | null;
}): AbsenceSpanPlan {
  const { shifts, side, at } = args;
  if (shifts.length === 0) return unplanned("outside-shift");
  if (!at) return unplanned("unset");

  const ranges = timeline(shifts);
  const base = clockMinutes(shifts[0].start);
  const last = ranges[ranges.length - 1].end;
  const time = (clockMinutes(at) - base + DAY) % DAY;
  const indexes = ranges.map((_, index) => index);

  if (time > last) return unplanned("outside-shift");
  // A stored absence that reaches past the shifts still covers time when the
  // time sits on their outer edge.
  if (args.extendTo && (side === "left-early" ? time === last : time === 0)) {
    return {
      problem: null,
      cutIndex: null,
      keptIndexes: indexes,
      removedIndexes: [],
      absence:
        side === "left-early"
          ? { start: at, end: args.extendTo }
          : { start: args.extendTo, end: at },
    };
  }
  if (side === "left-early") {
    if (time === 0) return unplanned("never-started");
    if (time === last) return unplanned("no-time-covered");
    const cutIndex = ranges.findIndex((range) => range.start < time && time < range.end);
    const firstMissed =
      cutIndex >= 0 ? cutIndex + 1 : ranges.findIndex((range) => range.start >= time);
    const keptIndexes =
      cutIndex >= 0 ? indexes.slice(0, cutIndex + 1) : indexes.slice(0, firstMissed);
    return {
      problem: null,
      cutIndex: cutIndex >= 0 ? cutIndex : null,
      keptIndexes,
      removedIndexes: indexes.slice(firstMissed),
      absence: {
        start: cutIndex >= 0 ? at : clockTime(base + ranges[firstMissed].start),
        end: args.extendTo ?? clockTime(base + last),
      },
    };
  }

  if (time === last) return unplanned("never-started");
  if (time === 0) return unplanned("no-time-covered");
  const cutIndex = ranges.findIndex((range) => range.start < time && time < range.end);
  const lastMissed =
    cutIndex >= 0
      ? cutIndex - 1
      : ranges.length - 1 - [...ranges].reverse().findIndex((range) => range.end <= time);
  return {
    problem: null,
    cutIndex: cutIndex >= 0 ? cutIndex : null,
    keptIndexes: indexes.slice(lastMissed + 1),
    removedIndexes: indexes.slice(0, lastMissed + 1),
    absence: {
      start: args.extendTo ?? shifts[0].start,
      end: cutIndex >= 0 ? at : clockTime(base + ranges[lastMissed].end),
    },
  };
}

/** Minutes between two clock times, overnight aware. */
export function clockSpanMinutes(range: ClockRange): number {
  return (clockMinutes(range.end) - clockMinutes(range.start) + DAY) % DAY || DAY;
}

/** One of the cell's shifts as the panel session found it, before the absence cut it. */
export interface AbsenceBaseShift {
  scheduled: ClockRange;
  customStart: string | null;
  customEnd: string | null;
}

/** The cell's shifts before the absence changed them, and how far a stored absence reaches. */
export interface AbsenceBase {
  shifts: AbsenceBaseShift[];
  extendTo: string | null;
}

export function effectiveRange(shift: AbsenceBaseShift): ClockRange {
  return {
    start: shift.customStart ?? shift.scheduled.start,
    end: shift.customEnd ?? shift.scheduled.end,
  };
}

/** Clears a custom time pair that matches the scheduled times, so it reads as unchanged. */
function tidy(shift: AbsenceBaseShift): AbsenceBaseShift {
  const start = shift.customStart ?? shift.scheduled.start;
  const end = shift.customEnd ?? shift.scheduled.end;
  return start === shift.scheduled.start && end === shift.scheduled.end
    ? { ...shift, customStart: null, customEnd: null }
    : shift;
}

/** Minutes from the first shift's scheduled start, overnight aware. */
function alongDay(shifts: AbsenceBaseShift[], time: string): number {
  return (clockMinutes(time) - clockMinutes(shifts[0].scheduled.start) + DAY) % DAY;
}

/**
 * Rebuilds the base from a cell as stored: the edge the absence cut goes back
 * to its scheduled time, and a stored absence that reaches past the last (or
 * before the first) scheduled shift keeps that edge as `extendTo`. Returns the
 * time the absence was recorded at too.
 */
export function absenceBaseFromCell(args: {
  shifts: AbsenceBaseShift[];
  side: AbsenceSide;
  absence: ClockRange | null;
}): { base: AbsenceBase; at: string | null } {
  const { side, absence } = args;
  const shifts = args.shifts.map((shift) => ({ ...shift }));
  if (shifts.length === 0) return { base: { shifts, extendTo: null }, at: null };

  if (side === "left-early") {
    const cut = absence
      ? shifts.findIndex((shift) => effectiveRange(shift).end === absence.start)
      : shifts.length - 1;
    const at = absence?.start ?? (cut >= 0 ? shifts[cut].customEnd : null);
    if (cut >= 0) shifts[cut] = tidy({ ...shifts[cut], customEnd: null });
    const last = shifts[shifts.length - 1].scheduled;
    const lastEnd = alongDay(shifts, last.start) + clockSpanMinutes(last);
    const reaches = absence ? alongDay(shifts, absence.end) || DAY : 0;
    return {
      base: { shifts, extendTo: absence && reaches > lastEnd ? absence.end : null },
      at,
    };
  }

  const cut = absence
    ? shifts.findIndex((shift) => effectiveRange(shift).start === absence.end)
    : -1;
  if (cut >= 0) shifts[cut] = tidy({ ...shifts[cut], customStart: null });
  const startsBefore =
    absence != null &&
    absence.start !== shifts[0].scheduled.start &&
    (clockMinutes(shifts[0].scheduled.start) - clockMinutes(absence.start) + DAY) % DAY < DAY / 2;
  return {
    base: { shifts, extendTo: startsBefore ? absence.start : null },
    at: absence?.end ?? null,
  };
}

export interface AbsenceCell {
  plan: AbsenceSpanPlan;
  /** The shifts still worked, with their custom times, in base order; null with a problem. */
  kept: Array<{ index: number; customStart: string | null; customEnd: string | null }> | null;
}

/** Plans the cell from its base: which shifts stay, the cut shift's new edge, and the absence. */
export function planAbsenceCell(
  base: AbsenceBase,
  side: AbsenceSide,
  at: string | null,
): AbsenceCell {
  const plan = planAbsenceSpan({
    shifts: base.shifts.map(effectiveRange),
    side,
    at,
    extendTo: base.extendTo,
  });
  if (plan.problem || !at) return { plan, kept: null };
  const kept = plan.keptIndexes.map((index) => {
    const shift = base.shifts[index];
    if (index !== plan.cutIndex)
      return { index, customStart: shift.customStart, customEnd: shift.customEnd };
    const cut = tidy(
      side === "left-early"
        ? { ...shift, customStart: shift.customStart ?? shift.scheduled.start, customEnd: at }
        : { ...shift, customStart: at, customEnd: shift.customEnd ?? shift.scheduled.end },
    );
    return { index, customStart: cut.customStart, customEnd: cut.customEnd };
  });
  return { plan, kept };
}
