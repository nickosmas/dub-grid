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

/** What people see for each stored status. Code and data keep `inactive` and `removed`. */
export const EMPLOYMENT_STATUS_LABELS: Readonly<Record<EmployeeStatus, string>> = {
  active: "Active",
  inactive: "Away",
  removed: "Archived",
};

export function describeEmploymentStatus(status: string | null | undefined): string {
  return EMPLOYMENT_STATUS_LABELS[status as EmployeeStatus] ?? EMPLOYMENT_STATUS_LABELS.active;
}

export type StatusAction = "markAway" | "archive" | "markActive" | "restore";

export interface StatusActionCopy {
  /** The button, and the confirmation's primary action. */
  label: string;
  title: string;
  /** What happens, for the manager about to confirm. */
  body: string;
  /** The toast once it's done. */
  done: string;
}

const LEAVING_SCHEDULE =
  "Their upcoming shifts come off in the draft, their recurring schedule is removed, and their open requests close.";

/** The action that brings someone back from a status. */
export function statusUndoAction(status: EmployeeStatus): StatusAction | null {
  if (status === "inactive") return "markActive";
  if (status === "removed") return "restore";
  return null;
}

export function describeStatusAction(action: StatusAction, name: string): StatusActionCopy {
  switch (action) {
    case "markAway":
      return {
        label: "Mark away",
        title: `Mark ${name} away?`,
        body: `They can still sign in and keep their role, but they won't be scheduled while they're away. ${LEAVING_SCHEDULE}`,
        done: "Marked away",
      };
    case "archive":
      return {
        label: "Archive",
        title: `Archive ${name}?`,
        body: `They can't sign in and won't be scheduled. ${LEAVING_SCHEDULE} Their history stays, and you can restore them later.`,
        done: "Archived",
      };
    case "markActive":
      return {
        label: "Mark active",
        title: `Mark ${name} active?`,
        body: "They can be scheduled again.",
        done: "Marked active",
      };
    case "restore":
      return {
        label: "Restore",
        title: `Restore ${name}?`,
        body: "They're back on staff and can be scheduled again.",
        done: "Restored",
      };
  }
}
