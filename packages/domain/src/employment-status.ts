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
