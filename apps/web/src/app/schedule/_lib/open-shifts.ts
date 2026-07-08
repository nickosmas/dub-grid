import type { CoverageGap, Employee, GridOpenShift, ShiftRequest } from "@/types";
import { formatDateKey } from "@/lib/utils";

interface SelectVisibleCoverageGapsInput {
  allCoverageGaps: CoverageGap[];
  publishedCoverageGaps: CoverageGap[];
  canEditShifts: boolean;
}

export function selectVisibleCoverageGaps({
  allCoverageGaps,
  publishedCoverageGaps,
  canEditShifts,
}: SelectVisibleCoverageGapsInput): CoverageGap[] {
  return canEditShifts ? allCoverageGaps : publishedCoverageGaps;
}

interface CountPendingVolunteerRequestsForCoverageGapInput {
  gap: CoverageGap;
  requests: ShiftRequest[];
  actionableAssignmentIds?: number[];
}

export function countPendingVolunteerRequestsForCoverageGap({
  gap,
  requests,
  actionableAssignmentIds = gap.eligibleAssignmentDefinitionIds,
}: CountPendingVolunteerRequestsForCoverageGapInput): number {
  const gapDate = formatDateKey(gap.date);
  const matchingRequestIds = new Set<string>();

  for (const request of requests) {
    if (
      request.type !== "pickup" ||
      request.status !== "pending_approval" ||
      request.targetEmpId != null ||
      request.parentRequestId != null ||
      request.requesterShiftDate !== gapDate ||
      request.requesterFocusAreaId !== gap.focusAreaId
    ) {
      continue;
    }

    if (
      request.requesterAssignmentDefinitionIds.some((assignmentId) =>
        actionableAssignmentIds.includes(assignmentId),
      )
    ) {
      matchingRequestIds.add(request.id);
    }
  }

  return matchingRequestIds.size;
}

interface HasPendingVolunteerRequestForCoverageGapInput extends CountPendingVolunteerRequestsForCoverageGapInput {
  employeeId: string | null;
}

export function hasPendingVolunteerRequestForCoverageGap({
  employeeId,
  gap,
  requests,
  actionableAssignmentIds = gap.eligibleAssignmentDefinitionIds,
}: HasPendingVolunteerRequestForCoverageGapInput): boolean {
  if (!employeeId) {
    return false;
  }

  const gapDate = formatDateKey(gap.date);

  return requests.some(
    (request) =>
      request.type === "pickup" &&
      request.status === "pending_approval" &&
      request.targetEmpId == null &&
      request.parentRequestId == null &&
      request.requesterEmpId === employeeId &&
      request.requesterShiftDate === gapDate &&
      request.requesterFocusAreaId === gap.focusAreaId &&
      request.requesterAssignmentDefinitionIds.some((assignmentId) =>
        actionableAssignmentIds.includes(assignmentId),
      ),
  );
}

interface BuildGridCalloffOpenShiftsFromRequestsInput {
  requests: ShiftRequest[];
  employees: Employee[];
  startDate: string;
  endDate: string;
}

export function buildGridCalloffOpenShiftsFromRequests({
  requests,
  employees,
  startDate,
  endDate,
}: BuildGridCalloffOpenShiftsFromRequestsInput): GridOpenShift[] {
  const employeeHomeFocusAreaById = new Map(
    employees.map((employee) => [employee.id, employee.focusAreaIds[0] ?? null]),
  );

  return requests.reduce<GridOpenShift[]>((openShifts, request) => {
    if (
      request.type !== "pickup" ||
      request.status !== "open" ||
      request.parentRequestId == null ||
      request.requesterShiftDate < startDate ||
      request.requesterShiftDate > endDate
    ) {
      return openShifts;
    }

    const focusAreaId =
      request.requesterFocusAreaId ?? employeeHomeFocusAreaById.get(request.requesterEmpId) ?? null;

    if (focusAreaId == null) {
      return openShifts;
    }

    openShifts.push({
      id: request.id,
      source: "calloff",
      date: request.requesterShiftDate,
      focusAreaId,
      shiftIds: request.requesterShiftIds,
      jobIds: request.requesterJobIds,
      segments: request.requesterSegments,
      assignmentIds: request.requesterAssignmentDefinitionIds,
      assignmentLabel: request.requesterShiftLabel,
      customStartTime: request.requesterCustomStartTime,
      customEndTime: request.requesterCustomEndTime,
      calledOffBy: request.requesterName || undefined,
      requestId: request.id,
      needed: 1,
    });

    return openShifts;
  }, []);
}
