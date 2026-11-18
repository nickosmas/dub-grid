import type { MobileBootstrapResponse, MobileShiftRequest } from "@dubgrid/contracts";
import type { ShiftChangeResolvers, ShiftChangeSegmentDefinition } from "@dubgrid/schedule-core";

type Segment = MobileShiftRequest["requesterPresentation"]["segments"][number];

/**
 * The names the shared request text needs, read from the request's own
 * presentations and the organization's absence types and focus areas, so the
 * page says exactly what the web's hover card says.
 */
export function buildRequestResolvers(
  request: Pick<MobileShiftRequest, "requesterPresentation" | "targetPresentation">,
  bootstrap: Pick<MobileBootstrapResponse, "absenceTypes" | "focusAreas"> | null | undefined,
): ShiftChangeResolvers {
  const segments: Segment[] = [
    ...request.requesterPresentation.segments,
    ...(request.targetPresentation?.segments ?? []),
  ];
  return {
    segment(shiftId, jobId): ShiftChangeSegmentDefinition | null {
      const match = segments.find(
        (segment) => (segment.shiftId ?? null) === shiftId && segment.jobId === jobId,
      );
      if (!match?.jobName) return null;
      return {
        shiftName: match.shiftName ?? null,
        jobName: match.jobName,
        focusAreaId: match.focusAreaId ?? null,
        defaultStart: match.shiftStartTime ?? match.startTime ?? null,
        defaultEnd: match.shiftEndTime ?? match.endTime ?? null,
        breakMinutes: match.breakMinutes ?? null,
      };
    },
    absenceType(absenceTypeId) {
      const type = bootstrap?.absenceTypes.find((item) => item.id === absenceTypeId);
      return type ? { name: type.name ?? type.label } : null;
    },
    focusArea(focusAreaId) {
      return bootstrap?.focusAreas.find((item) => item.id === focusAreaId)?.name ?? null;
    },
  };
}
