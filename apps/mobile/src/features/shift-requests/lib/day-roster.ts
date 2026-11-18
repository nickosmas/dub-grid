import type { MobileScheduleEntry } from "@dubgrid/contracts";
import {
  buildScheduleShiftGroups,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryTimeRange,
} from "@dubgrid/schedule-core";

export type DayRosterShift = {
  key: string;
  title: string;
  /** The shift's hours, from its first entry; null when it has none. */
  time: string | null;
  names: string[];
};

/** Who works each shift on one day, in the schedule's shift order. Absences are left out. */
export function buildDayRoster(
  entries: readonly MobileScheduleEntry[],
  date: string,
): DayRosterShift[] {
  const worked = entries.filter(
    (entry) => entry.date === date && getScheduleEntryAbsenceTypeId(entry) == null,
  );
  return buildScheduleShiftGroups(worked).map((group) => ({
    key: group.key,
    title: group.title,
    time: group.entries[0] ? getScheduleEntryTimeRange(group.entries[0]) : null,
    names: group.entries.map((entry) => entry.employeeName),
  }));
}
