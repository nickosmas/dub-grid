import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { getScheduleEntryAbsenceTypeId, isDeletedScheduleHistory } from "@dubgrid/schedule-core";

/** Everyone working that day but the viewer, once each. */
export function workingThatDay(
  teamEntries: MobileScheduleEntry[],
  date: string,
  viewerId: string | undefined,
): MobileScheduleEntry[] {
  const seen = new Set<string>();
  return teamEntries.filter((entry) => {
    if (entry.date !== date || entry.employeeId === viewerId || seen.has(entry.employeeId)) {
      return false;
    }
    if (isDeletedScheduleHistory(entry) || getScheduleEntryAbsenceTypeId(entry) != null) {
      return false;
    }
    seen.add(entry.employeeId);
    return true;
  });
}

/**
 * Nothing on either side of Home's split: no shift of yours all week, and
 * nobody working the day beside it. Home then shows one empty state across the
 * page rather than an empty week beside an empty day.
 */
export function isHomeWeekEmpty({
  entries,
  teamEntries,
  day,
  viewerId,
}: {
  entries: readonly MobileScheduleEntry[];
  teamEntries: MobileScheduleEntry[];
  day: string;
  viewerId: string | null;
}): boolean {
  if (entries.some((entry) => !isDeletedScheduleHistory(entry))) return false;
  return workingThatDay(teamEntries, day, viewerId ?? undefined).length === 0;
}
