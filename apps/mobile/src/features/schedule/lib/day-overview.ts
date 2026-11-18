import type {
  MobileDashboardResponse,
  MobileOpenShift,
  MobileScheduleEntry,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import { getScheduleEntryTimeRange, isDeletedScheduleHistory } from "@dubgrid/schedule-core";
import { REQUEST_TYPE_LABEL } from "../../shift-requests/lib/request-type";
import {
  getOpenShiftFocusAreaName,
  getOpenShiftPrimarySegment,
  getOpenShiftTimeRange,
} from "./openShiftPresentation";

export type DayCoverageRow = {
  focusAreaId: number;
  name: string;
  filled: number;
  required: number;
};

/**
 * Each area's coverage on one day, from the dashboard's own per-day count.
 * An area with no requirement that day, or a day not yet published, has
 * nothing to measure and is left out rather than shown as a number.
 */
export function buildDayCoverage(
  sections: MobileDashboardResponse["coverageBySection"],
  date: string,
): DayCoverageRow[] {
  return sections.flatMap((section) => {
    const day = section.daily.find((entry) => entry.dateKey === date);
    if (!day || day.status === "none" || day.requiredCount === 0) return [];
    return [
      {
        focusAreaId: section.focusAreaId,
        name: section.focusAreaName,
        filled: day.filledCount,
        required: day.requiredCount,
      },
    ];
  });
}

export type DayOpenShift = {
  id: string;
  title: string;
  detail: string | null;
  canClaim: boolean;
};

/** The day's open shifts: "Day Shift · RN" over "3 East · 7:00 AM - 3:00 PM". */
export function buildDayOpenShifts(
  openShifts: readonly MobileOpenShift[],
  date: string,
  viewerEmpId: string | null,
): DayOpenShift[] {
  return openShifts
    .filter((openShift) => openShift.date === date)
    .map((openShift) => {
      const segment = getOpenShiftPrimarySegment(openShift);
      const shiftName = segment?.shiftName ?? openShift.presentation.label ?? "Open shift";
      const jobName = openShift.presentation.segments.find((item) => item.jobName)?.jobName ?? null;
      return {
        id: openShift.id,
        title: [shiftName, jobName].filter(Boolean).join(" · "),
        detail:
          [getOpenShiftFocusAreaName(openShift), getOpenShiftTimeRange(openShift)]
            .filter(Boolean)
            .join(" · ") || null,
        canClaim: viewerEmpId !== null && openShift.canVolunteer,
      };
    });
}

export type DayRequest = {
  id: string;
  who: string;
  detail: string;
  /** The Requests tab that lists it for this viewer. */
  tab: "mine" | "approval" | null;
};

const ACTIVE_STATUSES = new Set<MobileShiftRequest["status"]>(["open", "pending_approval"]);

function describeStatus(request: MobileShiftRequest, viewerEmpId: string | null): string {
  if (request.status === "pending_approval") return "Pending approval";
  if (!request.targetEmpId) return "Open to claim";
  if (request.targetEmpId === viewerEmpId) return "Waiting on you";
  return request.targetName ? `Waiting on ${request.targetName}` : "Waiting on a teammate";
}

/**
 * The requests still waiting that touch one day. An approver sees everyone's;
 * anyone else only the ones they asked or were asked, theirs named "You".
 */
export function buildDayRequests(
  requests: readonly MobileShiftRequest[],
  date: string,
  { viewerEmpId, canSeeAll }: { viewerEmpId: string | null; canSeeAll: boolean },
): DayRequest[] {
  return requests
    .filter(
      (request) =>
        ACTIVE_STATUSES.has(request.status) &&
        (request.requesterShiftDate === date || request.targetShiftDate === date) &&
        (canSeeAll ||
          (viewerEmpId !== null &&
            (request.requesterEmpId === viewerEmpId || request.targetEmpId === viewerEmpId))),
    )
    .map((request) => ({
      id: request.id,
      who: request.requesterEmpId === viewerEmpId ? "You" : request.requesterName,
      detail: `${REQUEST_TYPE_LABEL[request.type]} · ${describeStatus(request, viewerEmpId)}`,
      tab:
        viewerEmpId !== null &&
        (request.requesterEmpId === viewerEmpId || request.targetEmpId === viewerEmpId)
          ? ("mine" as const)
          : request.status === "pending_approval"
            ? ("approval" as const)
            : null,
    }));
}

export type ViewerDay = { title: string; time: string | null };

/** The viewer's own shift or absence that day, or null when they aren't scheduled. */
export function findViewerDay(
  entries: readonly MobileScheduleEntry[],
  date: string,
  viewerEmpId: string | null,
): ViewerDay | null {
  if (!viewerEmpId) return null;
  const entry = entries.find(
    (item) =>
      item.date === date && item.employeeId === viewerEmpId && !isDeletedScheduleHistory(item),
  );
  if (!entry) return null;
  const shiftNames = entry.presentation.segments
    .map((segment) => segment.shiftName)
    .filter((name): name is string => Boolean(name));
  return {
    title:
      (shiftNames.length > 0 ? shiftNames.join(" + ") : null) ??
      entry.presentation.shiftName ??
      entry.presentation.label,
    time: getScheduleEntryTimeRange(entry),
  };
}
