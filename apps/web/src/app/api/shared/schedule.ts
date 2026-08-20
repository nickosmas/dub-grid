import type { DbFocusArea, DbJobDefinition, DbShiftCategory } from "@dubgrid/db-types";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import { rowToFocusArea, rowToJobDefinition, rowToShiftCategory } from "@/lib/db/mappers";
import { FOCUS_AREA_COLS, JOB_COLS, SHIFT_CATEGORY_COLS } from "@/lib/db/shared";
import {
  createAssignmentDefinitionIdByPairMap,
  createShiftJobCompatibilityMaps,
  type SegmentCompatibilityMaps,
} from "@/lib/shift-job-segments";
import type { getServiceClient } from "@/lib/supabase-service";

async function fetchAssignmentContext(
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
  };
}

export async function fetchAssignmentIdByPairMap(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<Map<string, number>> {
  const { assignments } = await fetchAssignmentContext(serviceClient, orgId);

  return createAssignmentDefinitionIdByPairMap(assignments);
}

export async function fetchAssignmentLabelMap(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<Map<number, string>> {
  const { assignments } = await fetchAssignmentContext(serviceClient, orgId);

  return new Map(
    assignments.map((assignment) => [assignment.id, assignment.label || assignment.name]),
  );
}

/**
 * Pair map plus the compatibility maps that spell shift/job names onto a
 * stored cell's segments. Read paths that only need assignment IDs can stay on
 * {@link fetchAssignmentIdByPairMap}; anything rendering segment names needs
 * this, or every segment comes back nameless.
 */
export async function fetchSegmentResolutionMaps(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<{
  assignmentIdByPair: Map<string, number>;
  segmentCompatibility: SegmentCompatibilityMaps;
}> {
  const { assignments, shiftCategories, jobs } = await fetchAssignmentContext(serviceClient, orgId);

  return {
    assignmentIdByPair: createAssignmentDefinitionIdByPairMap(assignments),
    segmentCompatibility: createShiftJobCompatibilityMaps({
      assignments,
      shiftCategories,
      jobs,
      shiftDisplayMode: "code",
    }),
  };
}
