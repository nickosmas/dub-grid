import type { EmployeeStatus, PlannedStatus } from "./staff";

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

export const NOT_SUSPENDABLE_CODE = "NOT_SUSPENDABLE";

export const NOT_SUSPENDABLE_MESSAGE = "Only someone who is active can be suspended.";

export const NOT_SUSPENDED_CODE = "NOT_SUSPENDED";

export const NOT_SUSPENDED_MESSAGE = "They aren't suspended.";

export const AWAY_ABSENCE_INVALID_CODE = "AWAY_ABSENCE_INVALID";

export const AWAY_ABSENCE_NEEDS_DATE_MESSAGE =
  "Set a return date to fill their days with an absence.";

export const AWAY_ABSENCE_UNKNOWN_MESSAGE = "Choose an absence your organization uses.";

/** Whether a database error is migration 100 refusing an absence from elsewhere. */
export function isAwayAbsenceRefusal(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.includes("Absence type not found");
}

/**
 * A return date is the first day back, so it must be a real day after the
 * organization's `today` (both YYYY-MM-DD).
 */
export const PLANNED_START_INVALID_CODE = "PLANNED_START_INVALID";

export const PLANNED_START_INVALID_MESSAGE = "Choose a start date after today and within a year.";

export const PLANNED_RETURN_INVALID_MESSAGE = "Choose a return date after the start date.";

export const NOT_PLANNABLE_CODE = "NOT_PLANNABLE";

export const NOT_PLANNABLE_MESSAGE = "Only someone who is active can have time away planned.";

export const NO_PLANNED_CHANGE_CODE = "NO_PLANNED_CHANGE";

export const NO_PLANNED_CHANGE_MESSAGE = "They have no time away planned.";

/** How far ahead a status change can be planned, in days. */
export const PLANNED_START_MAX_DAYS = 365;

/** A planned start (YYYY-MM-DD): after `today` and no more than a year ahead. */
export function isValidPlannedStart(startDate: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate <= today) return false;
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + PLANNED_START_MAX_DAYS);
  return startDate <= latest.toISOString().slice(0, 10);
}

export function isValidReturnDate(returnDate: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return false;
  const parsed = new Date(`${returnDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== returnDate) {
    return false;
  }
  return returnDate > today;
}

/** A status change set for a later date (51g). */
export interface PlannedChangeState {
  plannedStatus?: PlannedStatus | null;
  plannedFrom?: string | null;
  plannedUntil?: string | null;
}

export interface SchedulableState extends PlannedChangeState {
  status: EmployeeStatus;
  archivedAt?: string | null;
  awayUntil?: string | null;
}

/** Whether a planned Away covers `dateKey`: from its first day up to the day they're back. */
export function isPlannedAwayOn(person: PlannedChangeState, dateKey: string): boolean {
  return (
    person.plannedStatus === "away" &&
    !!person.plannedFrom &&
    person.plannedFrom <= dateKey &&
    (!person.plannedUntil || dateKey < person.plannedUntil)
  );
}

/**
 * The database's `employee_schedulable_on`: active outside any planned Away,
 * or Away with a return date on or before `dateKey` (YYYY-MM-DD).
 */
export function isSchedulableOn(person: SchedulableState, dateKey: string): boolean {
  if (person.archivedAt) return false;
  if (person.status === "active") return !isPlannedAwayOn(person, dateKey);
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
export const SUSPENDED_LABEL = "Suspended";

/** Wherever someone schedules a suspended person, who can't sign in to see it (51d). */
export const SUSPENDED_SCHEDULE_NOTE = "Suspended: won't see this in the app";

/**
 * A suspended person (51c) is stored `active`, so suspension wins over the
 * stored status when it is set.
 */
export function describeEmploymentStatus(
  status: string | null | undefined,
  awayUntil?: string | null,
  suspendedAt?: string | null,
): string {
  if (suspendedAt && (status === "active" || status == null)) return SUSPENDED_LABEL;
  const label =
    EMPLOYMENT_STATUS_LABELS[status as EmployeeStatus] ?? EMPLOYMENT_STATUS_LABELS.active;
  return status === "inactive" && awayUntil
    ? `${label} until ${formatReturnDate(awayUntil)}`
    : label;
}

export type StatusAction =
  | "markAway"
  | "archive"
  | "markActive"
  | "restore"
  | "setReturnDate"
  | "reinstate"
  | "suspend"
  | "setPlannedChange"
  | "cancelPlannedChange";

export interface StatusActionCopy {
  /** The button, and the confirmation's primary action. */
  label: string;
  title: string;
  /** A short message under the title, only when it adds to the title; else empty. */
  message: string;
  /**
   * Two or more extra things the manager should know, one full sentence each;
   * a single fact goes in `message` instead. Only what changes; what stays
   * as it is goes in `unchanged`.
   */
  points: string[];
  /** What stays as it is, one full sentence each, shown apart from `points`. */
  unchanged: string[];
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
  /** With a return date: the absence their away days hold (51f), by name. */
  absenceName?: string | null;
  /**
   * Mark away or Save changes: a first day after today (YYYY-MM-DD) plans the
   * Away for then instead of starting it (51g1).
   */
  startDate?: string | null;
  /** The first day of an Away they already have planned, which this action cancels. */
  plannedFrom?: string | null;
}

/** The absence filling the away days, as one full sentence. */
function awayAbsenceSentence(returnDate: string, absenceName: string): string {
  return `Every day until ${formatReturnDate(returnDate)} shows ${absenceName} in the draft, in place of any shift.`;
}

/** What a return date changes before and after it, one full sentence each. */
function returnDatePoints(returnDate: string, absenceName: string | null = null): string[] {
  const day = formatReturnDate(returnDate);
  return [
    absenceName
      ? awayAbsenceSentence(returnDate, absenceName)
      : `Shifts before ${day} come off the schedule in the draft.`,
    `Recurring schedules pause and fill again from ${day}.`,
  ];
}

function describeSetReturnDate(
  name: string,
  returnDate: string | null,
  currentReturnDate: string | null,
  absenceName: string | null,
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
      unchanged: [],
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
        points: returnDatePoints(returnDate, absenceName),
        unchanged: [],
        done: "Return date changed",
      }
    : {
        ...base,
        message: absenceName
          ? `They're back to Active on ${day}, and can be scheduled from then. ${awayAbsenceSentence(returnDate, absenceName)}`
          : `They're back to Active on ${day}, and can be scheduled from then.`,
        points: [],
        unchanged: [],
        done: "Return date set",
      };
}

/** What a planned Away does to the draft, one full sentence each. */
function plannedAwayPoints(
  startDate: string,
  returnDate: string | null,
  absenceName: string | null,
): string[] {
  const from = formatReturnDate(startDate);
  if (!returnDate) {
    return [
      `Shifts from ${from} on come off the schedule in the draft.`,
      `Recurring schedules set up for them are removed on ${from}.`,
      `Open requests for days from ${from} are closed.`,
    ];
  }
  const back = formatReturnDate(returnDate);
  return [
    absenceName
      ? `Every day from ${from} until ${back} shows ${absenceName} in the draft, in place of any shift.`
      : `Shifts from ${from} until ${back} come off the schedule in the draft.`,
    `Recurring schedules pause from ${from} and fill again from ${back}.`,
    `Open requests for those days are closed.`,
  ];
}

/** Says when a planned Away starts and ends: "Away from Mon, Nov 10, back Mon, Jan 4." */
function plannedAwaySentence(startDate: string, returnDate: string | null): string {
  const from = formatReturnDate(startDate, { weekday: true });
  return returnDate
    ? `Away from ${from}, back ${formatReturnDate(returnDate, { weekday: true })}.`
    : `Away from ${from}.`;
}

/**
 * `name` is the person, or a count such as "3 people" with `group` set. Only
 * the title names them: the message and points say "they", and the points
 * open with what each one is about rather than all with "Their".
 */
export function describeStatusAction(
  action: StatusAction,
  name: string,
  {
    group = false,
    returnDate = null,
    currentReturnDate = null,
    absenceName = null,
    startDate = null,
    plannedFrom = null,
  }: StatusActionOptions = {},
): StatusActionCopy {
  // Any other change today replaces an Away they have planned.
  const cancelsPlan = plannedFrom
    ? [`The away planned from ${formatReturnDate(plannedFrom)} is cancelled.`]
    : [];
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
      if (startDate) {
        return {
          label: "Schedule away",
          title: `Mark ${name} away?`,
          message: `They stay Active until ${formatReturnDate(startDate, { weekday: true })}.`,
          points: plannedAwayPoints(startDate, returnDate, absenceName),
          unchanged: [],
          done: "Away scheduled",
        };
      }
      if (returnDate) {
        return {
          label: "Mark away",
          title: `Mark ${name} away?`,
          message: `They won't be scheduled before ${formatReturnDate(returnDate, { weekday: true })}, when they're back to Active.`,
          points: [
            ...returnDatePoints(returnDate, absenceName),
            `Open requests for days before ${formatReturnDate(returnDate)} are closed.`,
            ...cancelsPlan,
          ],
          unchanged: [keepsAccess],
          done: "Marked away",
        };
      }
      return {
        label: "Mark away",
        title: `Mark ${name} away?`,
        message: "",
        points: [...leavingSchedule, ...cancelsPlan],
        unchanged: [keepsAccess],
        done: "Marked away",
      };
    case "setPlannedChange":
      return {
        label: "Save changes",
        title: `Change ${name}'s planned away?`,
        message: startDate ? plannedAwaySentence(startDate, returnDate) : "",
        points: startDate ? plannedAwayPoints(startDate, returnDate, absenceName) : [],
        unchanged: [],
        done: "Planned away changed",
      };
    case "cancelPlannedChange":
      return {
        label: "Cancel planned away",
        title: `Cancel ${name}'s planned away?`,
        message: "",
        points: [
          "They stay Active and can be scheduled on those days again.",
          ...(absenceName
            ? [`Those days go back to what was published, without ${absenceName}.`]
            : []),
        ],
        unchanged: absenceName ? [] : ["Shifts already taken off those days stay off."],
        done: "Planned away cancelled",
      };
    case "setReturnDate":
      return describeSetReturnDate(name, returnDate, currentReturnDate, absenceName);
    case "archive":
      return {
        label: "Archive",
        title: `Archive ${name}?`,
        message: "",
        points: ["They can no longer sign in.", ...leavingSchedule, ...cancelsPlan],
        unchanged: ["Past records stay, and you can restore them later."],
        done: "Archived",
      };
    case "markActive":
      return {
        label: "Mark active",
        title: `Mark ${name} active?`,
        message: "",
        points: [],
        unchanged: [],
        done: "Marked active",
      };
    case "suspend":
      return {
        label: "Suspend",
        title: `Suspend ${name}?`,
        message: "",
        points: [
          "They're signed out on every device and can't sign in.",
          "Open requests they're part of are closed, and pickups they claimed go back up for others.",
          ...cancelsPlan,
        ],
        unchanged: ["Their shifts stay, and you can keep scheduling them."],
        done: "Suspended",
      };
    case "reinstate":
      return {
        label: "Reinstate",
        title: `Reinstate ${name}?`,
        message: "",
        points: [],
        unchanged: [],
        done: "Reinstated",
      };
    case "restore":
      return {
        label: "Restore",
        title: `Restore ${name}?`,
        message: "",
        points: [],
        unchanged: [],
        done: "Restored",
      };
  }
}

/** The four statuses a person can be in, as people see them (51d). */
export type StatusChoiceKind = "active" | "away" | "suspended" | "archived";

export interface StatusChoice {
  kind: StatusChoiceKind;
  /** What picking it does. */
  action: StatusAction;
  label: string;
  /** What being in it means, in one short sentence. */
  detail: string;
  /** What picking it does, as one sentence, for a dialog where it's the only choice. */
  outcome: string;
}

export interface StatusState extends PlannedChangeState {
  status: EmployeeStatus;
  awayUntil?: string | null;
  suspendedAt?: string | null;
  archivedAt?: string | null;
}

export interface CurrentStatusState extends StatusState {
  focusAreaIds: readonly number[];
}

const AWAY_DETAIL = "Keeps sign-in. Not scheduled while away.";
const SUSPENDED_DETAIL = "Can't sign in. Stays on the schedule.";
const ARCHIVED_DETAIL = "Off staff. Can't sign in or be scheduled.";
const ACTIVE_DETAIL = "Can sign in and be scheduled.";

function currentKind(state: StatusState): StatusChoiceKind {
  if (state.status === "removed" || state.archivedAt) return "archived";
  if (state.status === "inactive") return "away";
  return state.suspendedAt ? "suspended" : "active";
}

/**
 * The statuses someone can move to from where they are, in the order the
 * Change status dialog lists them. Their current status is never one.
 */
export function statusChoices(state: CurrentStatusState): StatusChoice[] {
  const away: StatusChoice = {
    kind: "away",
    action: "markAway",
    label: EMPLOYMENT_STATUS_LABELS.inactive,
    detail: AWAY_DETAIL,
    outcome: "They'll be Away: they keep sign-in, and they aren't scheduled.",
  };
  const archived: StatusChoice = {
    kind: "archived",
    action: "archive",
    label: EMPLOYMENT_STATUS_LABELS.removed,
    detail: ARCHIVED_DETAIL,
    outcome: "They'll be Archived: off staff, and they can't sign in or be scheduled.",
  };
  // A planned away is edited through its own dates, so Away isn't offered twice.
  const canBeAway =
    canMarkInactive(state.focusAreaIds) && !(state.plannedStatus === "away" && state.plannedFrom);
  switch (currentKind(state)) {
    case "active":
      return [
        ...(canBeAway ? [away] : []),
        {
          kind: "suspended",
          action: "suspend",
          label: SUSPENDED_LABEL,
          detail: SUSPENDED_DETAIL,
          outcome: "They'll be Suspended: they can't sign in, and they stay on the schedule.",
        },
        archived,
      ];
    case "suspended":
      return [
        {
          kind: "active",
          action: "reinstate",
          label: EMPLOYMENT_STATUS_LABELS.active,
          detail: "Can sign in again on the web and in the app.",
          outcome: "They'll be Active again and can sign in on the web and in the app.",
        },
        ...(canBeAway ? [away] : []),
        archived,
      ];
    case "away":
      return [
        {
          kind: "active",
          action: "markActive",
          label: EMPLOYMENT_STATUS_LABELS.active,
          detail: "Back on the schedule from today.",
          outcome: "They'll be Active again and back on the schedule from today.",
        },
        archived,
      ];
    case "archived":
      return [
        {
          kind: "active",
          action: "restore",
          label: EMPLOYMENT_STATUS_LABELS.active,
          detail: "Back on staff. Can sign in and be scheduled.",
          outcome: "They'll be Active again: back on staff, and they can sign in and be scheduled.",
        },
      ];
  }
}

/**
 * The change most people in this status want next, offered as the status
 * card's main button: Reinstate, Mark active or Restore. Active has none, so
 * its card offers Change status alone.
 */
export function suggestedStatusChoice(state: CurrentStatusState): StatusChoice | null {
  if (currentKind(state) === "active") return null;
  return statusChoices(state).find((choice) => choice.kind === "active") ?? null;
}

export type StatusTone = "success" | "warning" | "danger" | "neutral";

const SINCE_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * Where someone stands, for the box at the top of Change status: "Away until
 * Fri, Oct 30" and what that means. The tone is their pill's.
 */
export function describeCurrentStatus(state: StatusState | CurrentStatusState): {
  text: string;
  detail: string;
  tone: StatusTone;
} {
  switch (currentKind(state)) {
    case "away":
      return {
        text: state.awayUntil
          ? `${EMPLOYMENT_STATUS_LABELS.inactive} until ${formatReturnDate(state.awayUntil, { weekday: true })}`
          : EMPLOYMENT_STATUS_LABELS.inactive,
        detail: AWAY_DETAIL,
        tone: "warning",
      };
    case "suspended":
      return {
        text: `${SUSPENDED_LABEL} since ${SINCE_DAY.format(new Date(state.suspendedAt as string))}`,
        detail: SUSPENDED_DETAIL,
        tone: "danger",
      };
    case "archived":
      return { text: EMPLOYMENT_STATUS_LABELS.removed, detail: ARCHIVED_DETAIL, tone: "neutral" };
    case "active":
      return {
        text: EMPLOYMENT_STATUS_LABELS.active,
        detail:
          state.plannedStatus === "away" && state.plannedFrom
            ? plannedAwaySentence(state.plannedFrom, state.plannedUntil ?? null)
            : ACTIVE_DETAIL,
        tone: "success",
      };
  }
}

/** A planned change in full, for a record: "Away from Nov 10, back Jan 4". */
export function describePlannedChangeInFull(state: PlannedChangeState): string | null {
  const short = describePlannedChange(state);
  if (!short) return null;
  return state.plannedUntil ? `${short}, back ${formatReturnDate(state.plannedUntil)}` : short;
}

/** The muted text beside an Active pill when a change is planned: "Away from Nov 10". */
export function describePlannedChange(state: PlannedChangeState): string | null {
  if (state.plannedStatus !== "away" || !state.plannedFrom) return null;
  return `${EMPLOYMENT_STATUS_LABELS.inactive} from ${formatReturnDate(state.plannedFrom)}`;
}

/** The icon beside a person's name; Active with nothing planned has none. */
export type StatusMarkKind = "suspended" | "away" | "planned" | "archived";

export interface StatusMark {
  kind: StatusMarkKind;
  /** Its hover text and accessible name. */
  label: string;
  tone: StatusTone;
}

/** Which status icon sits after someone's name, and what it says. */
export function statusMark(state: StatusState): StatusMark | null {
  switch (currentKind(state)) {
    case "archived":
      return { kind: "archived", label: EMPLOYMENT_STATUS_LABELS.removed, tone: "neutral" };
    case "suspended":
      return { kind: "suspended", label: SUSPENDED_SCHEDULE_NOTE, tone: "danger" };
    case "away":
      return { kind: "away", label: describeCurrentStatus(state).text, tone: "warning" };
    case "active": {
      const planned = describePlannedChangeInFull(state);
      return planned ? { kind: "planned", label: planned, tone: "warning" } : null;
    }
  }
}

export interface StatusCardCopy {
  /** The status card: where they stand now. */
  current: { kind: StatusChoiceKind; title: string; detail: string; tone: StatusTone };
  /** A second, dashed card for an Away planned for later. */
  planned: { title: string; detail: string } | null;
}

/**
 * The status card at the top of a person's profile, in the same words as the
 * Change status dialog. `absenceName` is the absence their away days hold.
 */
export function describeStatusCard(
  state: StatusState,
  { absenceName = null }: { absenceName?: string | null } = {},
): StatusCardCopy {
  const kind = currentKind(state);
  const current = describeCurrentStatus(state);
  const holds = absenceName ? ` ${absenceName} on those days.` : "";
  const plannedFrom = state.plannedStatus === "away" ? state.plannedFrom : null;
  return {
    current: {
      kind,
      title: current.text,
      detail:
        kind === "active"
          ? ACTIVE_DETAIL
          : kind === "away" && state.awayUntil
            ? `${current.detail}${holds}`
            : current.detail,
      tone: current.tone,
    },
    planned:
      kind === "active" && plannedFrom
        ? {
            title: `${EMPLOYMENT_STATUS_LABELS.inactive} from ${formatReturnDate(plannedFrom, { weekday: true })}`,
            detail: state.plannedUntil
              ? `Back ${formatReturnDate(state.plannedUntil, { weekday: true })}.${holds}`
              : "No return date.",
          }
        : null,
  };
}
