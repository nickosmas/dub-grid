import {
  currentStatusKind,
  describeStatusAction,
  EMPLOYMENT_STATUS_LABELS,
  statusChoices,
  SUSPENDED_LABEL,
  UNNAMED_ABSENCE,
  type CurrentStatusState,
  type StatusAction,
  type StatusActionCopy,
  type StatusChoiceKind,
} from "./employment-status";

/** A status change the People list's bulk bar can make for several people at once (51h). */
export type BulkStatusAction =
  "markActive" | "reinstate" | "restore" | "markAway" | "suspend" | "archive";

/** The bar's order: the ways back to Active first, then the ways out. */
export const BULK_STATUS_ACTIONS: readonly BulkStatusAction[] = [
  "markActive",
  "reinstate",
  "restore",
  "markAway",
  "suspend",
  "archive",
];

export const BULK_STATUS_MAX_PEOPLE = 100;

export const SELF_STATUS_SKIP_REASON = "You can't change your own status.";

export const STATUS_NOT_APPLICABLE_CODE = "STATUS_NOT_APPLICABLE";

const KIND_LABELS: Readonly<Record<StatusChoiceKind, string>> = {
  active: EMPLOYMENT_STATUS_LABELS.active,
  away: EMPLOYMENT_STATUS_LABELS.inactive,
  suspended: SUSPENDED_LABEL,
  archived: EMPLOYMENT_STATUS_LABELS.removed,
};

/** The status each change leads to; Mark active, Reinstate and Restore all lead back to Active. */
const TARGET_KIND: Readonly<Record<BulkStatusAction, StatusChoiceKind>> = {
  markActive: "active",
  reinstate: "active",
  restore: "active",
  markAway: "away",
  suspend: "suspended",
  archive: "archived",
};

/** The one status each way back to Active starts from, and why it skips anyone else. */
const BACK_TO_ACTIVE: Partial<Record<BulkStatusAction, { from: StatusChoiceKind; only: string }>> =
  {
    markActive: { from: "away", only: "Only someone who is away can be marked active." },
    reinstate: { from: "suspended", only: "Only someone who is suspended can be reinstated." },
    restore: { from: "archived", only: "Only someone offboarded can be restored." },
  };

export interface BulkStatusOptions {
  /** True when the person is the manager making the change. */
  isSelf?: boolean;
  /** False when the manager may not change this person's access (`canOffboardAtTier`). */
  canOffboard?: boolean;
}

/**
 * Why this change can't be made for this person, or null when it can. Uses
 * the same reasons as Change status (`statusChoices`), so the bar's counts,
 * the confirmation's Skipped list and the server's refusals agree.
 */
export function bulkStatusSkipReason(
  action: BulkStatusAction,
  person: CurrentStatusState,
  { isSelf = false, canOffboard = true }: BulkStatusOptions = {},
): string | null {
  if (isSelf) return SELF_STATUS_SKIP_REASON;
  const kind = currentStatusKind(person);
  if (kind === TARGET_KIND[action]) return `Already ${KIND_LABELS[kind]}.`;
  const backToActive = BACK_TO_ACTIVE[action];
  if (backToActive && kind !== backToActive.from) return backToActive.only;
  // Mark active needs nothing more; Restore and Reinstate can be out of the manager's tier.
  if (backToActive && action === "markActive") return null;
  const option = statusChoices(person, { canOffboard }).find((choice) => choice.action === action);
  return option?.unavailableReason ?? null;
}

export interface BulkStatusSkip<P> {
  person: P;
  reason: string;
}

export interface BulkStatusPlan<P> {
  action: BulkStatusAction;
  /** Everyone the change applies to, in the order given. */
  eligible: P[];
  /** Everyone it leaves alone, with why. */
  skipped: BulkStatusSkip<P>[];
}

/** Splits a selection into the people a change applies to and the ones it skips. */
export function planBulkStatusChange<P extends CurrentStatusState>(
  action: BulkStatusAction,
  people: readonly P[],
  isSelf: (person: P) => boolean = () => false,
  canOffboard: (person: P) => boolean = () => true,
): BulkStatusPlan<P> {
  const plan: BulkStatusPlan<P> = { action, eligible: [], skipped: [] };
  for (const person of people) {
    const reason = bulkStatusSkipReason(action, person, {
      isSelf: isSelf(person),
      canOffboard: canOffboard(person),
    });
    if (reason === null) plan.eligible.push(person);
    else plan.skipped.push({ person, reason });
  }
  return plan;
}

/** "1 person", "3 people". */
export function countPeople(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}

/** "3 people marked away", "1 person offboarded". */
export function bulkStatusDone(action: BulkStatusAction, count: number): string {
  const done = describeStatusAction(action, "").done;
  return `${countPeople(count)} ${done.charAt(0).toLowerCase()}${done.slice(1)}`;
}

/** Ways out of Active replace a planned change, as they do on the person page. */
const REPLACES_PLAN: ReadonlySet<BulkStatusAction> = new Set(["markAway", "suspend", "archive"]);

export interface BulkStatusPerson extends CurrentStatusState {
  /** Their name, used only when the change reaches them alone. */
  name: string;
}

export interface BulkStatusCopyOptions {
  /** Mark away: the first day back, the same for everyone. */
  returnDate?: string | null;
}

/**
 * The confirmation for a change reaching these people. One person reads as
 * the person page does (their name and planned change); several are counted,
 * and the planned changes it cancels are counted too.
 */
export function describeBulkStatusAction(
  action: BulkStatusAction,
  people: readonly BulkStatusPerson[],
  { returnDate = null }: BulkStatusCopyOptions = {},
): StatusActionCopy {
  const statusAction: StatusAction = action;
  const withReturnDate = action === "markAway" ? { returnDate } : {};
  const [only] = people;
  if (people.length === 1 && only) {
    // The bar has no absence names, so the person's absence is named generically.
    const absence =
      action === "markActive"
        ? holdsAwayAbsence(only)
        : only.plannedStatus === "away" && only.plannedAbsenceTypeId != null;
    return describeStatusAction(statusAction, only.name, {
      ...withReturnDate,
      hasAccount: !("userId" in only) || Boolean(only.userId),
      plannedFrom: only.plannedFrom ?? null,
      plannedStatus: only.plannedStatus ?? null,
      currentAbsenceName: absence ? UNNAMED_ABSENCE : null,
    });
  }
  const groupCopy = describeStatusAction(statusAction, countPeople(people.length), {
    ...withReturnDate,
    group: true,
    hasAccount: people.some((person) => !("userId" in person) || Boolean(person.userId)),
  });
  const copy = {
    ...groupCopy,
    ...(action === "markActive" ? { message: markActiveGroupMessage(people) } : {}),
    done: bulkStatusDone(action, people.length),
  };
  const plans = REPLACES_PLAN.has(action)
    ? people.filter((person) => person.plannedStatus && person.plannedFrom)
    : [];
  if (plans.length === 0) return copy;
  const left = groupPlanLeftovers(action, plans, returnDate);
  return {
    ...copy,
    points: [
      ...copy.points,
      plans.length === 1
        ? "The change planned for 1 of them is canceled."
        : `Changes planned for ${plans.length} of them are canceled.`,
      ...left.points,
    ],
    unchanged: [...copy.unchanged, ...left.unchanged],
  };
}

/** An Away person whose days ahead hold an absence until their return date (51f). */
function holdsAwayAbsence(person: CurrentStatusState): boolean {
  return person.awayAbsenceTypeId != null && Boolean(person.awayUntil);
}

/** Mark active for several: their away absence comes off the days ahead, nothing else comes back. */
function markActiveGroupMessage(people: readonly BulkStatusPerson[]): string {
  const withAbsence = people.filter(holdsAwayAbsence).length;
  if (withAbsence === 0) return "Shifts taken off while they were away stay off.";
  if (withAbsence === people.length) {
    return `Days left in their time away go back to what was published, without ${UNNAMED_ABSENCE}.`;
  }
  return "Days an away absence held go back to what was published. Other shifts taken off while they were away stay off.";
}

/**
 * What the replaced plans leave behind, as `describeStatusAction` says it for
 * one person: an absence comes off the days it filled, and nothing else they
 * cleared comes back. Taking them off the schedule now clears it all anyway.
 */
function groupPlanLeftovers(
  action: BulkStatusAction,
  plans: readonly BulkStatusPerson[],
  returnDate: string | null,
): { points: string[]; unchanged: string[] } {
  if (action === "archive" || (action === "markAway" && !returnDate)) {
    return { points: [], unchanged: [] };
  }
  const clearing = plans.filter(
    (person) => person.plannedStatus === "away" || person.plannedStatus === "removed",
  );
  if (clearing.length === 0) return { points: [], unchanged: [] };
  const withAbsence = clearing.some(
    (person) => person.plannedStatus === "away" && person.plannedAbsenceTypeId != null,
  );
  const withoutAbsence = clearing.some(
    (person) => !(person.plannedStatus === "away" && person.plannedAbsenceTypeId != null),
  );
  return {
    points: withAbsence
      ? ["Days a canceled plan filled with an absence go back to what was published."]
      : [],
    unchanged: [
      ...(withoutAbsence ? ["Shifts their plans already took off stay off."] : []),
      // Suspending closes every open request anyway.
      ...(action === "suspend" ? [] : ["Requests their plans closed stay closed."]),
    ],
  };
}
