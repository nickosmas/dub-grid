import type { EmployeeStatus } from "./staff";

/**
 * Where a person sits in the org, derived from their assignments.
 *
 * Focus areas put someone *on the schedule*; management departments make them a
 * *management user*. Someone can be both. The interesting case is management
 * with no focus area — they have no personal schedule at all, so web hides the
 * Dashboard for them and mobile hides the Home tab.
 *
 * Shared because web derives this server-side (`/api/account/permissions`) and
 * mobile derives it client-side from bootstrap; the rule must not drift.
 */

export function isOnSchedule(focusAreaIds: readonly number[]): boolean {
  return focusAreaIds.length > 0;
}

export function isManagementUser(departmentIds: readonly number[]): boolean {
  return departmentIds.length > 0;
}

/** Management-only: in a management department with no scheduled focus area. */
export function isManagementOnly(
  focusAreaIds: readonly number[],
  departmentIds: readonly number[],
): boolean {
  return isManagementUser(departmentIds) && !isOnSchedule(focusAreaIds);
}

export const NOT_ON_SCHEDULE_CODE = "NOT_ON_SCHEDULE";

export const NOT_ON_SCHEDULE_MESSAGE = "Only someone on the schedule can be marked away.";

/**
 * Away (`inactive`) only takes someone off the schedule, so it means nothing for
 * a person who isn't on it.
 */
export function canMarkInactive(focusAreaIds: readonly number[]): boolean {
  return isOnSchedule(focusAreaIds);
}

export const RETURN_DATE_INVALID_CODE = "RETURN_DATE_INVALID";

export const RETURN_DATE_INVALID_MESSAGE = "Choose a return date after today.";

export const NOT_AWAY_CODE = "NOT_AWAY";

export const NOT_AWAY_MESSAGE = "Only someone who is away can have a return date.";

/**
 * A return date is the first day back, so it must be a real day after the
 * organization's `today` (both YYYY-MM-DD).
 */
export function isValidReturnDate(returnDate: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return false;
  const parsed = new Date(`${returnDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== returnDate) {
    return false;
  }
  return returnDate > today;
}

export interface SchedulableState {
  status: EmployeeStatus;
  archivedAt?: string | null;
  awayUntil?: string | null;
}

/**
 * The database's `employee_schedulable_on`: active, or Away with a return date
 * on or before `dateKey` (YYYY-MM-DD).
 */
export function isSchedulableOn(person: SchedulableState, dateKey: string): boolean {
  if (person.archivedAt) return false;
  if (person.status === "active") return true;
  return person.status === "inactive" && !!person.awayUntil && person.awayUntil <= dateKey;
}

/** What people see for each stored status. Code and data keep `inactive` and `removed`. */
export const EMPLOYMENT_STATUS_LABELS: Readonly<Record<EmployeeStatus, string>> = {
  active: "Active",
  inactive: "Away",
  removed: "Archived",
};

const RETURN_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const RETURN_DAY_WITH_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** A return date (YYYY-MM-DD) as "Jan 4", or "Mon, Jan 4" with `weekday`. */
export function formatReturnDate(isoDate: string, { weekday = false } = {}): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return (weekday ? RETURN_DAY_WITH_WEEKDAY : RETURN_DAY).format(date);
}

/** The status as people see it, with an Away person's return date: "Away until Jan 4". */
export function describeEmploymentStatus(
  status: string | null | undefined,
  awayUntil?: string | null,
): string {
  const label =
    EMPLOYMENT_STATUS_LABELS[status as EmployeeStatus] ?? EMPLOYMENT_STATUS_LABELS.active;
  return status === "inactive" && awayUntil
    ? `${label} until ${formatReturnDate(awayUntil)}`
    : label;
}

export type StatusAction = "markAway" | "archive" | "markActive" | "restore" | "setReturnDate";

export interface StatusActionCopy {
  /** The button, and the confirmation's primary action. */
  label: string;
  title: string;
  /** A short message under the title, only when it adds to the title; else empty. */
  message: string;
  /**
   * Two or more extra things the manager should know, one full sentence each;
   * a single fact goes in `message` instead.
   */
  points: string[];
  /** The toast once it's done. */
  done: string;
}

/** The action that brings someone back from a status. */
export function statusUndoAction(status: EmployeeStatus): StatusAction | null {
  if (status === "inactive") return "markActive";
  if (status === "removed") return "restore";
  return null;
}

export interface StatusActionOptions {
  /** `name` is a count such as "3 people". */
  group?: boolean;
  /** Mark away or Set return date: the first day back chosen (YYYY-MM-DD), if any. */
  returnDate?: string | null;
  /** Set return date: the person's current one, if any. */
  currentReturnDate?: string | null;
}

/** What a return date changes before and after it, one full sentence each. */
function returnDatePoints(returnDate: string): string[] {
  const day = formatReturnDate(returnDate);
  return [
    `Shifts before ${day} come off the schedule in the draft.`,
    `Recurring schedules pause and fill again from ${day}.`,
  ];
}

function describeSetReturnDate(
  name: string,
  returnDate: string | null,
  currentReturnDate: string | null,
): StatusActionCopy {
  const changing = currentReturnDate !== null;
  const base = {
    label: changing ? "Change return date" : "Set return date",
    title: changing ? `Change ${name}'s return date?` : `Set a return date for ${name}?`,
  };
  if (!returnDate) {
    return {
      ...base,
      message: "They stay away until someone marks them active.",
      points: changing
        ? [
            "Any upcoming shifts come off the schedule in the draft.",
            "Recurring schedules set up for them are removed.",
          ]
        : [],
      done: "Return date cleared",
    };
  }
  const day = formatReturnDate(returnDate, { weekday: true });
  // Someone away with no date already has nothing scheduled and no recurring
  // schedule left, so the date only decides when they're back.
  return changing
    ? {
        ...base,
        message: `They're back to Active on ${day}.`,
        points: returnDatePoints(returnDate),
        done: "Return date changed",
      }
    : {
        ...base,
        message: `They're back to Active on ${day}, and can be scheduled from then.`,
        points: [],
        done: "Return date set",
      };
}

/**
 * `name` is the person, or a count such as "3 people" with `group` set. Only
 * the title names them: the message and points say "they", and the points
 * open with what each one is about rather than all with "Their".
 */
export function describeStatusAction(
  action: StatusAction,
  name: string,
  { group = false, returnDate = null, currentReturnDate = null }: StatusActionOptions = {},
): StatusActionCopy {
  const leavingSchedule = [
    "Any upcoming shifts come off the schedule in the draft.",
    "Recurring schedules set up for them are removed.",
    "Open requests they're part of are closed.",
  ];
  const keepsAccess = group
    ? "They can still sign in and keep their roles."
    : "They can still sign in and keep their role.";
  switch (action) {
    case "markAway":
      if (returnDate) {
        return {
          label: "Mark away",
          title: `Mark ${name} away?`,
          message: `They won't be scheduled before ${formatReturnDate(returnDate, { weekday: true })}, when they're back to Active.`,
          points: [
            keepsAccess,
            ...returnDatePoints(returnDate),
            `Open requests for days before ${formatReturnDate(returnDate)} are closed.`,
          ],
          done: "Marked away",
        };
      }
      return {
        label: "Mark away",
        title: `Mark ${name} away?`,
        message: "They won't be scheduled while they're away.",
        points: [keepsAccess, ...leavingSchedule],
        done: "Marked away",
      };
    case "setReturnDate":
      return describeSetReturnDate(name, returnDate, currentReturnDate);
    case "archive":
      return {
        label: "Archive",
        title: `Archive ${name}?`,
        message: "",
        points: [
          "They can no longer sign in.",
          ...leavingSchedule,
          "Past records stay, and you can restore them later.",
        ],
        done: "Archived",
      };
    case "markActive":
      return {
        label: "Mark active",
        title: `Mark ${name} active?`,
        message: "Shifts that came off when they were marked away don't come back.",
        points: [],
        done: "Marked active",
      };
    case "restore":
      return {
        label: "Restore",
        title: `Restore ${name}?`,
        message: "Shifts that came off when they were archived don't come back.",
        points: [],
        done: "Restored",
      };
  }
}
