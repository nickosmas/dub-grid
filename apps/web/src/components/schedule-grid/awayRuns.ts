import { buildAbsenceRuns, type AbsenceRunDay } from "@dubgrid/schedule-core";
import type { Employee } from "@/types";

export const AWAY_RUN_LABEL = "Away";

type AwayFields = Pick<Employee, "status" | "awayUntil" | "archivedAt">;

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
  awayUntil: string | null,
  dateKeys: readonly string[],
  todayKey: string,
  splitAt?: number,
): RowAwayDays | null {
  if (!awayUntil) return null;
  const locked = dateKeys.map((dateKey) => dateKey < awayUntil);
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
