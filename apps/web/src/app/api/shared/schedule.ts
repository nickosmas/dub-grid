import type {
  DbFocusArea,
  DbJobDefinition,
  DbShiftCategory,
} from "@dubgrid/db-types";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import {
  rowToFocusArea,
  rowToJobDefinition,
  rowToShiftCategory,
} from "@/lib/db/mappers";
import {
  FOCUS_AREA_COLS,
  JOB_COLS,
  SHIFT_CATEGORY_COLS,
} from "@/lib/db/shared";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";
import type { getServiceClient } from "@/lib/supabase-service";

export async function fetchAssignmentIdByPairMap(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<Map<string, number>> {
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

  const assignments = buildScheduleAssignmentOptions({
    orgId,
    focusAreas: ((focusAreaResult.data ?? []) as DbFocusArea[]).map(
      rowToFocusArea,
    ),
    shiftCategories: ((shiftCategoryResult.data ?? []) as DbShiftCategory[]).map(
      rowToShiftCategory,
    ),
    jobs: ((jobResult.data ?? []) as DbJobDefinition[]).map(rowToJobDefinition),
    includeArchived: true,
  });

  return createAssignmentDefinitionIdByPairMap(assignments);
}
