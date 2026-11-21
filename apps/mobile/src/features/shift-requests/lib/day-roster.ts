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
  /** Its focus area, only when another shift that day has the same name. */
  focusArea: string | null;
  people: DayRosterPerson[];
};

export type DayRosterPerson = { employeeId: string; name: string };

/**
 * Who works each shift on one day, as scheduled now, in the schedule's shift
 * order. Given `onlyShifts`, just the shifts with those keys (a request's
 * shift; see `getScheduleEntryCategoryKey`). Absences are left out.
 */
export function buildDayRoster(
  entries: readonly MobileScheduleEntry[],
  date: string,
  onlyShifts?: ReadonlySet<string>,
): DayRosterShift[] {
  const worked = entries.filter(
    (entry) => entry.date === date && getScheduleEntryAbsenceTypeId(entry) == null,
  );
  const groups = buildScheduleShiftGroups(worked);
  const roster = groups.map((group) => {
    const first = group.entries[0];
    const sharesName = groups.some((other) => other !== group && other.title === group.title);
    const people = group.entries.map((entry) => ({
      employeeId: entry.employeeId,
      name: entry.employeeName,
    }));
    return {
      key: group.key,
      title: group.title,
      time: first ? getScheduleEntryTimeRange(first) : null,
      focusArea: sharesName
        ? (first?.presentation.displayFocusAreaName ?? first?.presentation.focusAreaName ?? null)
        : null,
      people,
    };
  });
  return onlyShifts ? roster.filter((shift) => onlyShifts.has(shift.key)) : roster;
}
