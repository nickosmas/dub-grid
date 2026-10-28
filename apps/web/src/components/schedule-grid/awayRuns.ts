import {
  describeFirstDay,
  EMPLOYMENT_STATUS_LABELS,
  formatReturnDate,
  isPlannedAwayOn,
  plannedLastDay,
} from "@dubgrid/domain";
import { buildAbsenceRuns, type AbsenceRunDay } from "@dubgrid/schedule-core";
import type { Employee } from "@/types";

export const AWAY_RUN_LABEL = "Away";

/** The bar over the days after a last day (51g2), when they're offboarded. */
export const LEAVING_RUN_LABEL = EMPLOYMENT_STATUS_LABELS.removed;

/** The away bar's label, naming the absence their days hold (51f) when there is one. */
export function awayRunLabel(absenceName: string | null): string {
  return absenceName ? `${AWAY_RUN_LABEL} · ${absenceName}` : AWAY_RUN_LABEL;
}

/** The bar over the days before someone's first day (51g4): "Starts Nov 10". */
export function startsRunLabel(firstDay: string): string {
  return describeFirstDay(firstDay);
}

/**
 * The days someone is away and can't be scheduled: from `from` (or always,
 * when null) up to the day before `until` (or onward, when null). With
 * `lastDay`, they're the days after someone's last day (51g2) instead. With
 * `firstDay`, every day before it is locked too (51g4); a range with only a
 * first day has `from` equal to `until`, which holds no day of its own.
 */
export interface AwayRange {
  from: string | null;
  until: string | null;
  lastDay?: string | null;
  firstDay?: string | null;
}

/** Whether `dateKey` is before the range's first day (51g4). */
export function isBeforeRangeFirstDay(range: AwayRange, dateKey: string): boolean {
  return !!range.firstDay && dateKey < range.firstDay;
}

export function isInAwayRange(range: AwayRange, dateKey: string): boolean {
  return (
    isBeforeRangeFirstDay(range, dateKey) ||
    ((range.from === null || dateKey >= range.from) &&
      (range.until === null || dateKey < range.until))
  );
}

/**
 * Why a locked away day can't be selected, and where to change it. A day
 * before their first day says so; give `dateKey` to tell which.
 */
export function awayLockedHint(range: AwayRange, dateKey?: string): string {
  const beforeFirstDay =
    dateKey === undefined ? range.from === range.until : isBeforeRangeFirstDay(range, dateKey);
  if (range.firstDay && beforeFirstDay) {
    return `${describeFirstDay(range.firstDay, { weekday: true })}. Change their first day on their record to change these days.`;
  }
  if (range.lastDay) {
    return `Last day ${formatReturnDate(range.lastDay, { weekday: true })}. Change the last day on their record to change these days.`;
  }
  if (range.from !== null) {
    const from = formatReturnDate(range.from, { weekday: true });
    return range.until
      ? `Away from ${from} until ${formatReturnDate(range.until, { weekday: true })}. Change the planned away on their record to change these days.`
      : `Away from ${from}. Change the planned away on their record to change these days.`;
  }
  return `Away until ${formatReturnDate(range.until ?? "", { weekday: true })}. Change the return date on their record to change these days.`;
}

type AwayFields = Pick<Employee, "status" | "awayUntil" | "archivedAt">;

type RangeFields = AwayFields &
  Pick<Employee, "plannedStatus" | "plannedFrom" | "plannedUntil" | "firstDay">;

/**
 * Someone's locked days: until their return date when Away until a date
 * (51e), from the start of a planned Away (51g1), after a planned last day
 * (51g2), and before their first day (51g4). Null for anyone else.
 */
export function awayRangeOf(employee: RangeFields): AwayRange | null {
  const range = statusRangeOf(employee);
  const firstDay = employee.archivedAt ? null : (employee.firstDay ?? null);
  if (!firstDay) return range;
  return range ? { ...range, firstDay } : { from: firstDay, until: firstDay, firstDay };
}

function statusRangeOf(employee: RangeFields): AwayRange | null {
  const until = awayReturnDate(employee);
  if (until) return { from: null, until };
  const lastDay = plannedLastDay(employee);
  if (employee.status === "active" && !employee.archivedAt && lastDay) {
    return { from: employee.plannedFrom ?? null, until: null, lastDay };
  }
  if (
    employee.status === "active" &&
    !employee.archivedAt &&
    employee.plannedFrom &&
    isPlannedAwayOn(employee, employee.plannedFrom)
  ) {
    return { from: employee.plannedFrom, until: employee.plannedUntil ?? null };
  }
  return null;
}

/** An Away person's first day back (YYYY-MM-DD), or null for anyone else. */
export function awayReturnDate(employee: AwayFields): string | null {
  return employee.status === "inactive" && !employee.archivedAt && employee.awayUntil
    ? employee.awayUntil
    : null;
}

/**
 * Who has a row in the Week and 2 Weeks grid: everyone active, and someone
 * Away with a return date while the period reaches today or later (51e).
 * Someone Away with no return date stays off it, and a past period keeps the
 * rows it always had.
 */
export function isOnScheduleGrid(
  employee: AwayFields,
  period: { lastDateKey: string; todayKey: string },
): boolean {
  if (employee.status === "active") return true;
  return awayReturnDate(employee) != null && period.lastDateKey >= period.todayKey;
}

export interface RowAwayDays {
  /** Days before the return date, on which nothing can be scheduled for them. */
  locked: boolean[];
  /**
   * Locked days from today on, each in one run per stretch and week; null
   * elsewhere. Earlier days keep what they held before they went away.
   */
  runs: (AbsenceRunDay | null)[];
}

// Any id no absence type has: the run builder only compares ids.
const AWAY_RUN_ID = -1;

/** A row's away days, or null when the row has none in the period. */
export function buildRowAwayDays(
  range: AwayRange | null,
  dateKeys: readonly string[],
  todayKey: string,
  splitAt?: number,
): RowAwayDays | null {
  if (!range) return null;
  const locked = dateKeys.map((dateKey) => isInAwayRange(range, dateKey));
  if (!locked.includes(true)) return null;
  const isAway = dateKeys.map((dateKey, index) => locked[index] && dateKey >= todayKey);
  const built = buildAbsenceRuns(
    isAway.map((away) => ({
      absenceTypeId: away ? AWAY_RUN_ID : null,
      hasShift: false,
      changed: false,
    })),
    { splitAt },
  );
  // The run builder leaves a single day alone; one away day is still a bar.
  let nextRunIndex = built.runs.length;
  const runs = built.days.map((day, index): AbsenceRunDay | null => {
    if (day) return day;
    if (!isAway[index]) return null;
    return { runIndex: nextRunIndex++, start: index, length: 1, position: "start" };
  });
  return { locked, runs };
}
