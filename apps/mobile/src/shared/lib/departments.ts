import type { MobileDepartment, MobileFocusArea } from "@dubgrid/contracts";

/** Names for a set of department ids, in the order Settings lists the departments. */
export function getDepartmentNames(
  departmentIds: number[],
  departments: MobileDepartment[] | undefined,
): string[] {
  return (departments ?? [])
    .filter((department) => departmentIds.includes(department.id))
    .map((department) => department.name)
    .filter(Boolean);
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
