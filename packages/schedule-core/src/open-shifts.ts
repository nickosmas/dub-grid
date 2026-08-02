import type {
  MobileOpenShift,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import {
  type AvailableOpenShiftFeed,
  type AvailableShiftDateGroup,
  type AvailableShiftFeedItem,
  type LegacyMobileShiftRequest,
  type TimeRange,
} from "./types";
import {
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryCustomEndTime,
  getScheduleEntryCustomStartTime,
  getScheduleEntryEndTime,
  getScheduleEntrySegments,
  getScheduleEntryStartTime,
} from "./entry-accessors";
import {
  expandTimeRange,
  hasShiftRequestStarted,
  hasShiftStartedAtTimeRanges,
  toShiftTimeRange,
} from "./schedule-time";

function getAvailableShiftFeedItemSlotCount(item: AvailableShiftFeedItem): number {
  if (item.kind === "open_shift") {
    return Math.max(item.openShift.needed, 1);
  }

  return 1;
}

function getRequestPrimarySegment(
  request: MobileShiftRequest,
  which: "requester" | "target",
): MobileScheduleEntrySegment | null {
  const legacyRequest = request as MobileShiftRequest & {
    requesterSegments?: MobileShiftRequest["requesterPresentation"]["segments"];
    targetSegments?: MobileShiftRequest["requesterPresentation"]["segments"] | null;
  };
  const segments =
    which === "requester"
      ? (request.requesterPresentation?.segments ?? legacyRequest.requesterSegments ?? [])
      : (request.targetPresentation?.segments ?? legacyRequest.targetSegments ?? []);

  return segments[0] ?? null;
}

export function getRequestSortTime(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string {
  const legacyRequest = request as LegacyMobileShiftRequest;
  const primarySegment = getRequestPrimarySegment(request, which);

  return (
    primarySegment?.startTime ??
    (which === "requester"
      ? (request.requesterState?.customStartTime ?? legacyRequest.requesterCustomStartTime)
      : (request.targetState?.customStartTime ?? legacyRequest.targetCustomStartTime)) ??
    "99:99:99"
  );
}

function getOpenShiftSortTime(openShift: MobileOpenShift): string {
  const primarySegment = openShift.presentation.segments[0] ?? null;

  return (
    primarySegment?.startTime ??
    openShift.presentation.startTime ??
    openShift.state.customStartTime ??
    "99:99:99"
  );
}

export function buildAvailableShiftDateGroups(input: {
  openShifts: ReadonlyArray<MobileOpenShift>;
  requests: ReadonlyArray<MobileShiftRequest>;
}): AvailableShiftDateGroup[] {
  const items = [
    ...input.openShifts.map((openShift, index) => ({
      kind: "open_shift" as const,
      key: openShift.id,
      date: openShift.date,
      openShift,
      sortTime: getOpenShiftSortTime(openShift),
      sourceIndex: index,
    })),
    ...input.requests.map((request, index) => ({
      kind: "request" as const,
      key: request.id,
      date: request.requesterShiftDate,
      request,
      sortTime: getRequestSortTime(request, "requester"),
      sourceIndex: input.openShifts.length + index,
    })),
  ].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    if (left.sortTime !== right.sortTime) {
      return left.sortTime.localeCompare(right.sortTime);
    }

    return left.sourceIndex - right.sourceIndex;
  });

  const groups: AvailableShiftDateGroup[] = [];

  for (const item of items) {
    const group = groups[groups.length - 1];
    const feedItem: AvailableShiftFeedItem =
      item.kind === "open_shift"
        ? {
            kind: item.kind,
            key: item.key,
            date: item.date,
            openShift: item.openShift,
          }
        : {
            kind: item.kind,
            key: item.key,
            date: item.date,
            request: item.request,
          };

    if (!group || group.date !== item.date) {
      groups.push({
        date: item.date,
        itemCount: 1,
        slotCount: getAvailableShiftFeedItemSlotCount(feedItem),
        items: [feedItem],
      });
      continue;
    }

    group.itemCount += 1;
    group.slotCount += getAvailableShiftFeedItemSlotCount(feedItem);
    group.items.push(feedItem);
  }

  return groups;
}

function getScheduleEntryAvailabilityTimeRanges(entry: MobileScheduleEntry): TimeRange[] {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return [];
  }

  const segmentRanges = getScheduleEntrySegments(entry).flatMap((segment) => {
    const range = toShiftTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const customRange = toShiftTimeRange(
    getScheduleEntryCustomStartTime(entry),
    getScheduleEntryCustomEndTime(entry),
  );

  if (customRange) {
    return [customRange];
  }

  const baseRange = toShiftTimeRange(
    getScheduleEntryStartTime(entry),
    getScheduleEntryEndTime(entry),
  );

  return baseRange ? [baseRange] : [];
}

function getRequestAvailabilityTimeRanges(request: MobileShiftRequest): TimeRange[] {
  const legacyRequest = request as LegacyMobileShiftRequest;
  const segments = request.requesterPresentation?.segments ?? [];
  const segmentRanges = segments.flatMap((segment) => {
    const range = toShiftTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const presentationRange = toShiftTimeRange(
    request.requesterPresentation?.startTime ?? null,
    request.requesterPresentation?.endTime ?? null,
  );

  if (presentationRange) {
    return [presentationRange];
  }

  const stateRange = toShiftTimeRange(
    request.requesterState?.customStartTime ?? legacyRequest.requesterCustomStartTime,
    request.requesterState?.customEndTime ?? legacyRequest.requesterCustomEndTime,
  );

  return stateRange ? [stateRange] : [];
}

function getOpenShiftAvailabilityTimeRanges(openShift: MobileOpenShift): TimeRange[] {
  const segmentRanges = openShift.presentation.segments.flatMap((segment) => {
    const range = toShiftTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const presentationRange = toShiftTimeRange(
    openShift.presentation.startTime,
    openShift.presentation.endTime,
  );

  if (presentationRange) {
    return [presentationRange];
  }

  const stateRange = toShiftTimeRange(
    openShift.state.customStartTime,
    openShift.state.customEndTime,
  );

  return stateRange ? [stateRange] : [];
}

function availabilityRangesOverlap(
  left: ReadonlyArray<TimeRange>,
  right: ReadonlyArray<TimeRange>,
): boolean {
  return left.some((leftRange) =>
    right.some((rightRange) =>
      expandTimeRange(leftRange.start, leftRange.end).some((leftExpanded) =>
        expandTimeRange(rightRange.start, rightRange.end).some(
          (rightExpanded) =>
            leftExpanded.start < rightExpanded.end && rightExpanded.start < leftExpanded.end,
        ),
      ),
    ),
  );
}

function isPendingVolunteerRequest(
  request: MobileShiftRequest,
  linkedEmployeeId?: string | null,
): boolean {
  if (
    request.type !== "pickup" ||
    request.status !== "pending_approval" ||
    request.targetEmpId != null ||
    request.parentRequestId != null
  ) {
    return false;
  }

  return linkedEmployeeId == null || request.requesterEmpId === linkedEmployeeId;
}

function requestMatchesOpenShift(request: MobileShiftRequest, openShift: MobileOpenShift): boolean {
  if (request.requesterShiftDate !== openShift.date) {
    return false;
  }

  const requestFocusAreaId =
    request.requesterState.focusAreaId ??
    request.requesterPresentation?.focusAreaId ??
    request.requesterPresentation?.segments[0]?.focusAreaId ??
    null;

  if (requestFocusAreaId !== openShift.focusAreaId) {
    return false;
  }

  return request.requesterState.segments.some((requestSegment) =>
    openShift.state.segments.some(
      (openShiftSegment) =>
        requestSegment.jobId === openShiftSegment.jobId &&
        requestSegment.shiftId === openShiftSegment.shiftId,
    ),
  );
}

function buildScheduleAvailabilityRangesByDate(
  entries: ReadonlyArray<MobileScheduleEntry>,
): Map<string, TimeRange[]> {
  const rangesByDate = new Map<string, TimeRange[]>();

  for (const entry of entries) {
    const ranges = getScheduleEntryAvailabilityTimeRanges(entry);

    if (ranges.length === 0) {
      continue;
    }

    const currentRanges = rangesByDate.get(entry.date) ?? [];
    currentRanges.push(...ranges);
    rangesByDate.set(entry.date, currentRanges);
  }

  return rangesByDate;
}

/**
 * How an open-shift source is surfaced to a regular user. Mirrors
 * `OpenShiftVisibilityMode` from `@dubgrid/domain` (kept local so schedule-core
 * stays dependency-light). `matched` only shows shifts that fit the user's
 * availability; `always` shows them regardless; `hidden` shows none.
 */
export type OpenShiftFeedVisibilityMode = "hidden" | "matched" | "always";

export function buildAvailableOpenShiftFeed(input: {
  linkedEmployeeId: string | null;
  scheduleEntries: ReadonlyArray<MobileScheduleEntry>;
  openShifts: ReadonlyArray<MobileOpenShift>;
  requests: ReadonlyArray<MobileShiftRequest>;
  now?: Date;
  showAll?: boolean;
  timeZone?: string | null;
  /** Visibility of coverage-shortage open shifts. Defaults to `matched`. */
  coverageGapVisibility?: OpenShiftFeedVisibilityMode;
  /** Visibility of call-off (open pickup) vacancies. Defaults to `matched`. */
  calloffVisibility?: OpenShiftFeedVisibilityMode;
}): AvailableOpenShiftFeed {
  if (!input.linkedEmployeeId && !input.showAll) {
    return {
      groups: [],
      openShiftRequests: [],
      openShifts: [],
      totalCount: 0,
    };
  }

  const scheduleRangesByDate = buildScheduleAvailabilityRangesByDate(input.scheduleEntries);
  const now = input.now ?? new Date();
  const showAll = input.showAll ?? false;
  // The visibility policy governs the regular-user view only. When showAll is
  // set (a scheduler/admin viewing every open shift), it always wins.
  const coverageGapVisibility = input.coverageGapVisibility ?? "matched";
  const calloffVisibility = input.calloffVisibility ?? "matched";
  const pendingVolunteerRequests = input.requests.filter(
    (request) =>
      isPendingVolunteerRequest(request, input.linkedEmployeeId) &&
      !hasShiftRequestStarted(request, now, input.timeZone),
  );
  const openShiftRequests = input.requests
    .filter((request) => {
      if (
        request.type !== "pickup" ||
        request.status !== "open" ||
        (!showAll && request.requesterEmpId === input.linkedEmployeeId)
      ) {
        return false;
      }

      if (hasShiftRequestStarted(request, now, input.timeZone)) {
        return false;
      }

      if (!showAll && calloffVisibility === "hidden") {
        return false;
      }

      if (showAll || calloffVisibility === "always") {
        return true;
      }

      return !availabilityRangesOverlap(
        scheduleRangesByDate.get(request.requesterShiftDate) ?? [],
        getRequestAvailabilityTimeRanges(request),
      );
    })
    .concat(pendingVolunteerRequests);
  const openShifts = input.openShifts.flatMap((openShift) => {
    const hasOwnPendingVolunteer =
      input.linkedEmployeeId != null &&
      pendingVolunteerRequests.some((request) => requestMatchesOpenShift(request, openShift));

    if (hasOwnPendingVolunteer) {
      return [];
    }

    if (openShift.needed <= 0) {
      return [];
    }

    if (!showAll && coverageGapVisibility === "hidden") {
      return [];
    }

    if (!showAll && openShift.canVolunteer === false) {
      return [];
    }

    if (
      hasShiftStartedAtTimeRanges({
        shiftDate: openShift.date,
        timeRanges: getOpenShiftAvailabilityTimeRanges(openShift),
        now,
        timeZone: input.timeZone,
      })
    ) {
      return [];
    }

    if (showAll || coverageGapVisibility === "always") {
      return [openShift];
    }

    return availabilityRangesOverlap(
      scheduleRangesByDate.get(openShift.date) ?? [],
      getOpenShiftAvailabilityTimeRanges(openShift),
    )
      ? []
      : [openShift];
  });

  const groups = buildAvailableShiftDateGroups({
    openShifts,
    requests: openShiftRequests,
  });

  return {
    groups,
    openShiftRequests,
    openShifts,
    totalCount: groups.reduce((total, group) => total + group.slotCount, 0),
  };
}
