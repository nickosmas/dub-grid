// One person's time off for a period (the staff page's Time off tab, item
// 55e): absences from the schedule, grouped into runs of days in a row, and
// time away from their status.

import { addDaysToIsoDate, formatScheduleTimeRange } from "@dubgrid/schedule-core";
import type { AbsenceType, ShiftMap } from "@/types";

export type TimeOffState = "planned" | "now" | "taken";

export interface TimeOffEntry {
  key: string;
  kind: "absence" | "away";
  /** "Vacation", or "Away" for time away. */
  name: string;
  /** "11:00 AM - 3:00 PM, not worked" for part of a day, or the absence while away. */
  detail: string | null;
  startDate: string;
  /** Inclusive. */
  endDate: string;
  /** Whole days, or null for part of a day. */
  days: number | null;
  state: TimeOffState;
}

export interface TimeOffPerson {
  id: string;
  status: string;
  statusChangedAt: string | null;
  awayUntil?: string | null;
  awayAbsenceTypeId?: number | null;
  plannedStatus?: string | null;
  plannedFrom?: string | null;
  plannedUntil?: string | null;
  plannedAbsenceTypeId?: number | null;
}

const AWAY = "inactive";

function stateOf(startDate: string, endDate: string, today: string): TimeOffState {
  if (endDate < today) return "taken";
  if (startDate > today) return "planned";
  return "now";
}

function daysBetween(startDate: string, endDate: string): number {
  return (
    Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
    ) + 1
  );
}

function awaySpans(person: TimeOffPerson, today: string) {
  const spans: Array<{
    key: string;
    start: string;
    end: string | null;
    absenceTypeId: number | null;
  }> = [];
  if (person.status === AWAY) {
    spans.push({
      key: "away-now",
      start: person.statusChangedAt?.slice(0, 10) ?? today,
      // The return date is their first day back.
      end: person.awayUntil ? addDaysToIsoDate(person.awayUntil, -1) : null,
      absenceTypeId: person.awayAbsenceTypeId ?? null,
    });
  }
  // A planned change names Away as "away"; the status itself stores "inactive".
  if (person.plannedStatus === "away" && person.plannedFrom) {
    spans.push({
      key: "away-planned",
      start: person.plannedFrom,
      end: person.plannedUntil ? addDaysToIsoDate(person.plannedUntil, -1) : null,
      absenceTypeId: person.plannedAbsenceTypeId ?? null,
    });
  }
  return spans;
}

/** Time off overlapping a period, newest first. */
export function buildTimeOff(
  person: TimeOffPerson,
  shifts: ShiftMap,
  range: { startDate: string; endDate: string },
  today: string,
  absenceById: Map<number, AbsenceType>,
  options: { dayOffAbsenceTypeId?: number | null; includeDayOff?: boolean } = {},
): TimeOffEntry[] {
  const nameOf = (id: number) =>
    absenceById.get(id)?.name || absenceById.get(id)?.label || "Absence";
  const entries: TimeOffEntry[] = [];

  const away = awaySpans(person, today).filter(
    (span) => span.start <= range.endDate && (span.end === null || span.end >= range.startDate),
  );
  for (const span of away) {
    const endDate = span.end ?? range.endDate;
    entries.push({
      key: span.key,
      kind: "away",
      name: "Away",
      detail: span.absenceTypeId != null ? nameOf(span.absenceTypeId) : null,
      startDate: span.start,
      endDate,
      days: span.end ? daysBetween(span.start, span.end) : null,
      state: stateOf(span.start, endDate, today),
    });
  }
  const coveredByAway = (date: string, absenceTypeId: number) =>
    away.some(
      (span) =>
        span.absenceTypeId === absenceTypeId &&
        date >= span.start &&
        (span.end === null || date <= span.end),
    );

  let run: { id: number; start: string; end: string } | null = null;
  const closeRun = () => {
    if (!run) return;
    entries.push({
      key: `absence-${run.start}`,
      kind: "absence",
      name: nameOf(run.id),
      detail: null,
      startDate: run.start,
      endDate: run.end,
      days: daysBetween(run.start, run.end),
      state: stateOf(run.start, run.end, today),
    });
    run = null;
  };

  for (let date = range.startDate; date <= range.endDate; date = addDaysToIsoDate(date, 1)) {
    const entry = shifts[`${person.id}_${date}`];
    const live = entry && !entry.isDelete ? entry : null;
    const wholeDay =
      live && live.assignmentIds.length === 0 && live.absenceTypeId != null
        ? live.absenceTypeId
        : null;
    const shown =
      wholeDay != null &&
      !coveredByAway(date, wholeDay) &&
      (options.includeDayOff || wholeDay !== options.dayOffAbsenceTypeId)
        ? wholeDay
        : null;
    if (shown !== null && run && run.id === shown && run.end === addDaysToIsoDate(date, -1)) {
      run.end = date;
    } else {
      closeRun();
      if (shown !== null) run = { id: shown, start: date, end: date };
    }

    const partDay = live?.restOfDayAbsenceTypeId ?? null;
    if (live && partDay != null && live.assignmentIds.length > 0) {
      const time = formatScheduleTimeRange(
        live.restOfDayAbsenceStartTime ?? null,
        live.restOfDayAbsenceEndTime ?? null,
      );
      entries.push({
        key: `part-${date}`,
        kind: "absence",
        name: nameOf(partDay),
        detail: time ? `${time}, not worked` : "Part of the day, not worked",
        startDate: date,
        endDate: date,
        days: null,
        state: stateOf(date, date, today),
      });
    }
  }
  closeRun();

  return entries.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** The first time off that starts after today, for the Overview. */
export function findNextTimeOff(entries: readonly TimeOffEntry[]): TimeOffEntry | null {
  return (
    [...entries]
      .filter((entry) => entry.state === "planned")
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}
