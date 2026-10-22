import { fetchAssignmentContext } from "@/lib/server/schedule-context";
import {
  createAssignmentDefinitionIdByPairMap,
  createShiftJobCompatibilityMaps,
  type SegmentCompatibilityMaps,
} from "@/lib/shift-job-segments";
import type { getServiceClient } from "@/lib/supabase-service";

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

export { fetchShiftChangeResolvers } from "@/lib/server/schedule-context";
