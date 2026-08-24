import type {
  AssignmentDefinition,
  CoverageGap,
  Employee,
  GridOpenShift,
  JobDefinition,
  NamedItem,
  ShiftCategory,
  ShiftRequest,
} from "@/types";
import { formatDateKey } from "@/lib/utils";
import { isEmployeeQualifiedForAssignmentDefinition } from "@/lib/assignable-shifts";

type EmployeeEligibilityInput = Pick<Employee, "certificationId" | "focusAreaIds" | "roleIds">;

interface IsEmployeeEligibleForOpenShiftContext {
  assignmentById: Map<number, AssignmentDefinition>;
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  orgRoles?: NamedItem[];
}

/**
 * Whether an employee is personally qualified (focus area + role + cert) for
 * at least one of the given assignment definitions. Used to gate both open
 * shift visibility (for plain staff) and claim-flow click routing (for
 * scheduler/admin viewers who see every open shift but may not be personally
 * eligible for a specific one).
 */
export function isEmployeeEligibleForOpenShift(
  candidateAssignmentIds: number[],
  employee: EmployeeEligibilityInput | null,
  context: IsEmployeeEligibleForOpenShiftContext,
): boolean {
  if (!employee) return false;

  return candidateAssignmentIds.some((assignmentId) => {
    const assignment = context.assignmentById.get(assignmentId);
    if (!assignment) return false;
    return isEmployeeQualifiedForAssignmentDefinition(employee, {
      assignment,
      shiftCategories: context.shiftCategories,
      jobs: context.jobs,
      orgRoles: context.orgRoles,
    });
  });
}

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
