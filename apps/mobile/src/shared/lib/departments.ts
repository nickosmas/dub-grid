import type { MobileDepartment, MobileFocusArea } from "@dubgrid/contracts";

/**
 * What management departments are called — in every org, whatever that org
 * calls the other kind.
 *
 * `labels.department` renames the *scheduled* kind, so composing
 * `Management ${label}` gave an org that calls them "Scheduled Departments"
 * the row label "Management Scheduled Departments". Web draws the same line:
 * its department-label prop feeds the scheduled list while management sits
 * beside it as a fixed string.
 */
export const MANAGEMENT_DEPARTMENT_LABELS = {
  plural: "Management Departments",
  pluralLower: "management departments",
  singularLower: "management department",
} as const;

/** Names for a set of department ids, in the order the ids were given. */
export function getDepartmentNames(
  departmentIds: number[],
  departments: MobileDepartment[] | undefined,
): string[] {
  return departmentIds
    .map((departmentId) => (departments ?? []).find((item) => item.id === departmentId)?.name)
    .filter((value): value is string => Boolean(value));
}

/**
 * The scheduled departments a set of focus areas places someone in.
 *
 * Derived from the focus areas rather than read off a department column: a
 * focus area is what puts a person in a department, so the two can never
 * disagree. Deduped, because several focus areas commonly share one.
 *
 * Shared by the staff profile and both halves of the personal profile, which
 * all print the same row from their own copy of this until now.
 */
export function getScheduledDepartmentNames(
  focusAreaIds: number[],
  focusAreas: MobileFocusArea[] | undefined,
  departments: MobileDepartment[] | undefined,
): string[] {
  const assigned = new Set(focusAreaIds);
  const seen = new Set<number>();
  const departmentIds: number[] = [];

  for (const focusArea of focusAreas ?? []) {
    const departmentId = focusArea.departmentId;
    if (!assigned.has(focusArea.id) || departmentId == null || seen.has(departmentId)) continue;
    seen.add(departmentId);
    departmentIds.push(departmentId);
  }

  return getDepartmentNames(departmentIds, departments);
}
