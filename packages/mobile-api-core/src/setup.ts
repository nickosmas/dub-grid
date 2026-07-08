import type { SupabaseClient } from "@supabase/supabase-js";

type SetupQueryResult = {
  data: unknown[] | null;
  error: unknown;
  count?: number | null;
};

function getSetupQueryError(results: SetupQueryResult[]): unknown {
  return results.find((result) => result.error)?.error ?? null;
}

export async function isMobileOrgSetupComplete(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<boolean> {
  const [
    focusAreasResult,
    shiftCategoriesResult,
    jobsResult,
    certificationsResult,
    orgRolesResult,
    departmentsResult,
    employeesResult,
  ] = await Promise.all([
    serviceClient.from("focus_areas").select("id, department_id, archived_at").eq("org_id", orgId),
    serviceClient
      .from("shift_categories")
      .select("id, focus_area_id, archived_at")
      .eq("org_id", orgId),
    serviceClient
      .from("jobs")
      .select(
        "id, assignment_mode, show_on_grid, focus_area_ids, department_ids, applicable_shift_ids, archived_at",
      )
      .eq("org_id", orgId),
    serviceClient.from("certifications").select("id, archived_at").eq("org_id", orgId),
    serviceClient.from("organization_roles").select("id, archived_at").eq("org_id", orgId),
    serviceClient.from("departments").select("id, type, archived_at").eq("org_id", orgId),
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("archived_at", null),
  ]);

  const error = getSetupQueryError([
    focusAreasResult,
    shiftCategoriesResult,
    jobsResult,
    certificationsResult,
    orgRolesResult,
    departmentsResult,
    employeesResult,
  ]);
  if (error) {
    throw error;
  }

  const departments = (departmentsResult.data ?? []) as {
    id: number;
    type: string | null;
    archived_at: string | null;
  }[];
  const scheduledDepartmentIds = new Set(
    departments
      .filter((department) => department.type === "scheduled" && !department.archived_at)
      .map((department) => department.id),
  );

  const focusAreas = (focusAreasResult.data ?? []) as {
    id: number;
    department_id: number | null;
    archived_at: string | null;
  }[];
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archived_at);
  const activeFocusAreaIds = new Set(activeFocusAreas.map((focusArea) => focusArea.id));
  const focusAreasPlaced =
    scheduledDepartmentIds.size > 0 &&
    activeFocusAreas.length > 0 &&
    activeFocusAreas.every(
      (focusArea) =>
        focusArea.department_id != null && scheduledDepartmentIds.has(focusArea.department_id),
    );

  const shiftCategories = (shiftCategoriesResult.data ?? []) as {
    id: number;
    focus_area_id: number | null;
    archived_at: string | null;
  }[];
  const activeShifts = shiftCategories.filter((shift) => !shift.archived_at);
  const shiftsPlaced =
    activeShifts.length > 0 &&
    activeShifts.every(
      (shift) => shift.focus_area_id != null && activeFocusAreaIds.has(shift.focus_area_id),
    );

  const jobs = (jobsResult.data ?? []) as {
    assignment_mode: string | null;
    show_on_grid: boolean | null;
    focus_area_ids: number[] | null;
    department_ids: number[] | null;
    applicable_shift_ids: number[] | null;
    archived_at: string | null;
  }[];
  const visibleJobs = jobs.filter((job) => !job.archived_at && job.show_on_grid !== false);
  const jobsPlaced =
    visibleJobs.length > 0 &&
    visibleJobs.every((job) => {
      if (job.assignment_mode === "shiftless") {
        return true;
      }

      const hasDepartmentPlacement = (job.department_ids ?? []).some((id) =>
        scheduledDepartmentIds.has(id),
      );
      const hasFocusAreaPlacement = (job.focus_area_ids ?? []).some((id) =>
        activeFocusAreaIds.has(id),
      );
      const shiftIds = job.applicable_shift_ids ?? [];
      const shiftsAreInScope =
        shiftIds.length > 0 &&
        shiftIds.every((id) => activeShifts.some((shift) => shift.id === id));

      return (hasDepartmentPlacement || hasFocusAreaPlacement) && shiftsAreInScope;
    });

  const certifications = (certificationsResult.data ?? []) as {
    archived_at: string | null;
  }[];
  const orgRoles = (orgRolesResult.data ?? []) as {
    archived_at: string | null;
  }[];

  return (
    focusAreasPlaced &&
    shiftsPlaced &&
    jobsPlaced &&
    certifications.some((certification) => !certification.archived_at) &&
    orgRoles.some((orgRole) => !orgRole.archived_at) &&
    (employeesResult.count ?? 0) > 0
  );
}
