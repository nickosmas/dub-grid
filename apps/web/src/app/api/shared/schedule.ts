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
