import type { ScheduleCellState } from "@dubgrid/contracts";
import type { ShiftRequestType } from "@dubgrid/domain";
import { addDaysToIsoDate, parseIsoDate, parseLocalDateKey } from "./dates";
import { workLimitBreaks, type WorkLimitBreak } from "./work-limits";

/** A person's work on a day: how many shifts and their hours. */
export interface DayWork {
  shifts: number;
  hours: number;
}

/** What an approval does to one person's day: shifts and hours gained (positive) or given up (negative). */
export interface RequestDayChange extends DayWork {
  employeeId: string;
  dateKey: string;
}

/** Everyone a shift request's approval leaves over a work limit (60c). */
export interface RequestWorkLimitPerson {
  employeeId: string;
  breaks: WorkLimitBreak[];
}

/** The same, with the person's name, as the server sends it to a warning. */
export interface NamedRequestWorkLimitPerson extends RequestWorkLimitPerson {
  name: string;
}

/**
 * The work limits an approval leaves each person who gains a shift over,
 * counted on the published schedule with the approval's changes written.
 * Only the days a person gains are checked: giving up a shift never adds a
 * day or an hour.
 */
export function requestWorkLimitBreaks({
  changes,
  published,
}: {
  changes: ReadonlyArray<RequestDayChange>;
  /** The published work on a day; an empty day is no shifts and no hours. */
  published: (employeeId: string, dateKey: string) => DayWork;
}): RequestWorkLimitPerson[] {
  const changed = new Map<string, DayWork>();
  for (const change of changes) {
    const key = `${change.employeeId}|${change.dateKey}`;
    const before = changed.get(key) ?? { shifts: 0, hours: 0 };
    changed.set(key, {
      shifts: before.shifts + change.shifts,
      hours: before.hours + change.hours,
    });
  }
  const after = (employeeId: string, dateKey: string): DayWork => {
    const day = published(employeeId, dateKey);
    const change = changed.get(`${employeeId}|${dateKey}`);
    if (!change) return day;
    return {
      shifts: Math.max(0, day.shifts + change.shifts),
      hours: Math.max(0, day.hours + change.hours),
    };
  };

  const people = new Map<string, Map<string, WorkLimitBreak>>();
  for (const change of changes) {
    if (change.shifts <= 0) continue;
    const { employeeId, dateKey } = change;
    const sunday = addDaysToIsoDate(dateKey, -parseIsoDate(dateKey).getUTCDay());
    let weekHours = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      weekHours += after(employeeId, addDaysToIsoDate(sunday, offset)).hours;
    }
    const found = people.get(employeeId) ?? new Map<string, WorkLimitBreak>();
    for (const limit of workLimitBreaks({
      worked: (key) => after(employeeId, key).shifts > 0,
      weekHours: Math.round(weekHours * 100) / 100,
      dateKey,
    })) {
      found.set(`${limit.limit}|${limit.start}`, limit);
    }
    people.set(employeeId, found);
  }

  const order = { row: 0, week: 1, hours: 2 };
  return [...people]
    .filter(([, found]) => found.size > 0)
    .map(([employeeId, found]) => ({
      employeeId,
      breaks: [...found.values()].sort(
        (a, b) => a.start.localeCompare(b.start) || order[a.limit] - order[b.limit],
      ),
    }));
}

/** The request fields that say who gains and gives up which shift. */
export interface RequestWorkLimitSubject {
  type: ShiftRequestType;
  requesterEmpId: string;
  requesterShiftDate: string;
  requesterState: ScheduleCellState | null;
  targetEmpId: string | null;
  targetShiftDate: string | null;
  targetState?: ScheduleCellState | null;
}

function dayChange(
  employeeId: string,
  dateKey: string,
  state: ScheduleCellState | null | undefined,
  hoursOf: (state: ScheduleCellState) => number,
  sign: 1 | -1,
): RequestDayChange[] {
  if (!state || state.kind !== "worked" || state.segments.length === 0) return [];
  return [
    { employeeId, dateKey, shifts: sign * state.segments.length, hours: sign * hoursOf(state) },
  ];
}

/**
 * What approving a request does to each person's days. A volunteer takes an
 * open shift; a pickup gives the asker's shift to the person picking it up;
 * a swap trades the two shifts. A call-off gives nobody a shift.
 */
export function requestDayChanges(
  request: RequestWorkLimitSubject,
  hoursOf: (state: ScheduleCellState) => number,
): RequestDayChange[] {
  const asker = request.requesterEmpId;
  const askerDate = request.requesterShiftDate;
  if (request.type === "calloff") return [];
  if (request.type === "pickup") {
    if (request.targetEmpId == null) {
      return dayChange(asker, askerDate, request.requesterState, hoursOf, 1);
    }
    return [
      ...dayChange(request.targetEmpId, askerDate, request.requesterState, hoursOf, 1),
      ...dayChange(asker, askerDate, request.requesterState, hoursOf, -1),
    ];
  }
  if (request.targetEmpId == null) return [];
  const partnerDate = request.targetShiftDate ?? askerDate;
  return [
    ...dayChange(asker, partnerDate, request.targetState, hoursOf, 1),
    ...dayChange(asker, askerDate, request.requesterState, hoursOf, -1),
    ...dayChange(request.targetEmpId, askerDate, request.requesterState, hoursOf, 1),
    ...dayChange(request.targetEmpId, partnerDate, request.targetState, hoursOf, -1),
  ];
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function shortDate(dateKey: string): string {
  return SHORT_DATE.format(parseLocalDateKey(dateKey));
}

/** "6 days in a row, Wed, Nov 25 to Mon, Nov 30", "42.5 hours in the week of Sun, Nov 29". */
export function describeWorkLimit(limit: WorkLimitBreak): string {
  if (limit.limit === "row") {
    return `${limit.days} days in a row, ${shortDate(limit.start)} to ${shortDate(limit.end)}`;
  }
  const amount =
    limit.limit === "week" ? `${limit.days} days` : `${Number(limit.hours.toFixed(2))} hours`;
  return `${amount} in the week of ${shortDate(limit.start)}`;
}

/** "Approving gives Laura Marshall 6 days in a row, Wed, Nov 25 to Mon, Nov 30." */
export function describeApprovalWorkLimits(
  people: ReadonlyArray<RequestWorkLimitPerson>,
  nameOf: (employeeId: string) => string,
): string[] {
  return people.flatMap(({ employeeId, breaks }) =>
    breaks.map((limit) => `Approving gives ${nameOf(employeeId)} ${describeWorkLimit(limit)}.`),
  );
}
