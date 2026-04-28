import type { Employee, GridOpenShift, ShiftRequest } from "@/types";

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
      request.requesterFocusAreaId ??
      employeeHomeFocusAreaById.get(request.requesterEmpId) ??
      null;

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
