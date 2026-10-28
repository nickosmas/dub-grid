import {
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

/**
 * The days someone is away and can't be scheduled: from `from` (or always,
 * when null) up to the day before `until` (or onward, when null). With
 * `lastDay`, they're the days after someone's last day (51g2) instead.
 */
export interface AwayRange {
  from: string | null;
  until: string | null;
  lastDay?: string | null;
}

export function isInAwayRange(range: AwayRange, dateKey: string): boolean {
  return (
    (range.from === null || dateKey >= range.from) &&
    (range.until === null || dateKey < range.until)
  );
}

/** Why a locked away day can't be selected, and where to change it. */
export function awayLockedHint(range: AwayRange): string {
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

type RangeFields = AwayFields & Pick<Employee, "plannedStatus" | "plannedFrom" | "plannedUntil">;

/**
 * Someone's away days: until their return date when Away until a date (51e),
 * from the start of a planned Away (51g1), or after a planned last day (51g2).
 * Null for anyone else.
 */
export function awayRangeOf(employee: RangeFields): AwayRange | null {
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
