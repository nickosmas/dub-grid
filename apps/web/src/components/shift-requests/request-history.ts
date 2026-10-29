import type { ShiftRequest, ShiftRequestStatus } from "@/types";

export const HISTORY_STATUSES: ShiftRequestStatus[] = [
  "approved",
  "rejected",
  "cancelled",
  "expired",
];

type HistoryRequest = Pick<
  ShiftRequest,
  "status" | "requesterEmpId" | "targetEmpId" | "resolvedAt" | "createdAt"
>;

/**
 * The decided requests the History tab lists, newest decision first. A
 * reviewer sees the organization's, narrowed by `people`; anyone else sees
 * only requests they made or were asked to take, whatever the server sent.
 */
export function filterRequestHistory<T extends HistoryRequest>(
  requests: T[],
  options: {
    status: ShiftRequestStatus | "all";
    people: string[];
    viewerEmpId: string | null;
    canReviewOrg: boolean;
  },
): T[] {
  const people = new Set(options.people);
  const involves = (request: T, empIds: Set<string>) =>
    empIds.has(request.requesterEmpId) ||
    (request.targetEmpId != null && empIds.has(request.targetEmpId));
  const viewer = new Set(options.viewerEmpId ? [options.viewerEmpId] : []);

  return requests
    .filter((request) => HISTORY_STATUSES.includes(request.status))
    .filter((request) => options.canReviewOrg || involves(request, viewer))
    .filter((request) => options.status === "all" || request.status === options.status)
    .filter((request) => !options.canReviewOrg || people.size === 0 || involves(request, people))
    .sort(
      (left, right) =>
        new Date(right.resolvedAt ?? right.createdAt).getTime() -
        new Date(left.resolvedAt ?? left.createdAt).getTime(),
    );
}
