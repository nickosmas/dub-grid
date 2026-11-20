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
  /** Someone the request touches works this shift. */
  affected: boolean;
};

export type DayRosterPerson = { employeeId: string; name: string; affected: boolean };

/**
 * Who works each shift on one day. Shifts someone in `affectedIds` works come
 * first, then the rest in the schedule's shift order. Absences are left out.
 */
export function buildDayRoster(
  entries: readonly MobileScheduleEntry[],
  date: string,
  affectedIds: ReadonlySet<string> = new Set(),
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
      affected: affectedIds.has(entry.employeeId),
    }));
    return {
      key: group.key,
      title: group.title,
      time: first ? getScheduleEntryTimeRange(first) : null,
      focusArea: sharesName
        ? (first?.presentation.displayFocusAreaName ?? first?.presentation.focusAreaName ?? null)
        : null,
      people,
      affected: people.some((person) => person.affected),
    };
  });
  return [
    ...roster.filter((shift) => shift.affected),
    ...roster.filter((shift) => !shift.affected),
  ];
}
