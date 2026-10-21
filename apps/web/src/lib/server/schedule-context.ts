import type { ShiftChangeResolvers } from "@dubgrid/schedule-core";
import type {
  DbAbsenceType,
  DbFocusArea,
  DbJobDefinition,
  DbShiftCategory,
} from "@dubgrid/db-types";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import {
  rowToAbsenceType,
  rowToFocusArea,
  rowToJobDefinition,
  rowToShiftCategory,
} from "@/lib/db/mappers";
import { ABSENCE_TYPE_COLS, FOCUS_AREA_COLS, JOB_COLS, SHIFT_CATEGORY_COLS } from "@/lib/db/shared";
import { buildShiftChangeResolvers } from "@/lib/shift-change-web";
import type { getServiceClient } from "@/lib/supabase-service";

/** An organization's focus areas, shifts, jobs and every assignment, archived included. */
export async function fetchAssignmentContext(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
) {
  const [focusAreaResult, shiftCategoryResult, jobResult] = await Promise.all([
    serviceClient
      .from("focus_areas")
      .select(FOCUS_AREA_COLS)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true }),
    serviceClient
      .from("shift_categories")
      .select(SHIFT_CATEGORY_COLS)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true }),
    serviceClient
      .from("jobs")
      .select(JOB_COLS)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true }),
  ]);

  if (focusAreaResult.error) {
    throw focusAreaResult.error;
  }
  if (shiftCategoryResult.error) {
    throw shiftCategoryResult.error;
  }
  if (jobResult.error) {
    throw jobResult.error;
  }

  const focusAreas = ((focusAreaResult.data ?? []) as DbFocusArea[]).map(rowToFocusArea);
  const shiftCategories = ((shiftCategoryResult.data ?? []) as DbShiftCategory[]).map(
    rowToShiftCategory,
  );
  const jobs = ((jobResult.data ?? []) as DbJobDefinition[]).map(rowToJobDefinition);

  return {
    assignments: buildScheduleAssignmentOptions({
      orgId,
      focusAreas,
      shiftCategories,
      jobs,
      includeArchived: true,
    }),
    shiftCategories,
    jobs,
    focusAreas,
  };
}

/** Name lookups for describing shift changes, archived definitions included. */
export async function fetchShiftChangeResolvers(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<ShiftChangeResolvers> {
  const [context, absenceResult] = await Promise.all([
    fetchAssignmentContext(serviceClient, orgId),
    serviceClient.from("absence_types").select(ABSENCE_TYPE_COLS).eq("org_id", orgId),
  ]);
  if (absenceResult.error) throw absenceResult.error;
  return buildShiftChangeResolvers({
    assignments: context.assignments,
    shiftCategories: context.shiftCategories,
    jobs: context.jobs,
    focusAreas: context.focusAreas,
    absenceTypes: ((absenceResult.data ?? []) as DbAbsenceType[]).map(rowToAbsenceType),
  });
}
