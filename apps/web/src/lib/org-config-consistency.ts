import type { AssignmentDefinition, Department, Employee, FocusArea } from "@/types";

/**
 * Ways an organization's loaded settings can disagree with its own staff and
 * schedule. Each would otherwise render as a quiet, wrong page: staff with no
 * section to sit in reads as "Nobody assigned here yet", and a shift whose
 * code the settings don't know reads as "?".
 */
export type OrgConfigGap =
  "no-staff-loaded" | "no-scheduled-sections" | "no-shift-codes" | "unknown-shift-codes";

export interface OrgConfigGapReport {
  gaps: OrgConfigGap[];
  /** Counts only, for the error report: never names, ids or other content. */
  counts: {
    serverActiveStaff: number | null;
    activeStaff: number;
    staffWithAreas: number;
    focusAreas: number;
    scheduledDepartments: number;
    placedFocusAreas: number;
    shiftCodes: number;
    referencedShiftCodes: number;
    unknownShiftCodes: number;
  };
}

/**
 * Checks the settings a page loaded against what it is about to show. Empty
 * settings for an organization with no staff are fine (a new organization);
 * only a contradiction counts.
 */
export function findOrgConfigGaps({
  // A list a caller didn't provide reads as empty: the check must never be
  // what breaks a page.
  employees = [],
  focusAreas = [],
  departments = [],
  assignments = [],
  referencedAssignmentIds = [],
  serverActiveStaffCount = null,
}: {
  employees: readonly Pick<Employee, "status" | "focusAreaIds" | "archivedAt">[];
  focusAreas: readonly Pick<FocusArea, "id" | "departmentId" | "archivedAt">[];
  departments: readonly Pick<Department, "id" | "type" | "archivedAt">[];
  assignments: readonly Pick<AssignmentDefinition, "id">[];
  /** Shift codes the page's cells point at, when it has cells to show. */
  referencedAssignmentIds?: readonly number[];
  /** Active staff the server counted alongside the settings, when known. */
  serverActiveStaffCount?: number | null;
}): OrgConfigGapReport {
  const activeStaff = employees.filter((e) => e.status === "active" && !e.archivedAt);
  const staffWithAreas = activeStaff.filter((e) => e.focusAreaIds.length > 0);
  const scheduledDepartmentIds = new Set(
    departments.filter((d) => d.type === "scheduled" && !d.archivedAt).map((d) => d.id),
  );
  const liveFocusAreas = focusAreas.filter((f) => !f.archivedAt);
  const placedFocusAreas = liveFocusAreas.filter(
    (f) => f.departmentId != null && scheduledDepartmentIds.has(f.departmentId),
  );
  const knownCodes = new Set(assignments.map((a) => a.id));
  const referenced = [...new Set(referencedAssignmentIds)];
  const unknown = referenced.filter((id) => !knownCodes.has(id));

  const gaps: OrgConfigGap[] = [];
  if ((serverActiveStaffCount ?? 0) > 0 && activeStaff.length === 0) gaps.push("no-staff-loaded");
  if (staffWithAreas.length > 0 && placedFocusAreas.length === 0)
    gaps.push("no-scheduled-sections");
  if (activeStaff.length > 0 && assignments.length === 0 && referenced.length > 0) {
    gaps.push("no-shift-codes");
  } else if (unknown.length > 0 && unknown.length * 2 >= referenced.length) {
    // A retired code or two is ordinary history; half or more of what the
    // page shows being unknown means the settings, not the schedule, are wrong.
    gaps.push("unknown-shift-codes");
  }

  return {
    gaps,
    counts: {
      serverActiveStaff: serverActiveStaffCount,
      activeStaff: activeStaff.length,
      staffWithAreas: staffWithAreas.length,
      focusAreas: liveFocusAreas.length,
      scheduledDepartments: scheduledDepartmentIds.size,
      placedFocusAreas: placedFocusAreas.length,
      shiftCodes: assignments.length,
      referencedShiftCodes: referenced.length,
      unknownShiftCodes: unknown.length,
    },
  };
}
