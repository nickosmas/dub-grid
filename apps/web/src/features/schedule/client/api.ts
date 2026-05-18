"use client";

import type {
  GridOpenShift,
  PublishHistoryEntry,
  PublishHistoryEntryWithName,
  RecurringScheduleDraft,
  RecurringShift,
  ScheduleNote,
  ScheduleCellInput,
  ShiftMap,
  ShiftSeries,
  ShiftRequest,
  ShiftRequestStatus,
  ShiftRequestType,
  SeriesFrequency,
} from "@/types";
import type { DraftBreakdown } from "@/lib/draft-utils";
import type { SegmentCompatibilityMaps } from "@/lib/shift-job-segments";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { formatDateKey } from "@/lib/utils";

export interface ScheduleActorNamesResponse {
  names: Record<string, string>;
}

export class OptimisticLockError extends Error {
  constructor(
    public readonly shiftId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion?: number,
  ) {
    super(
      `Optimistic lock failed for shift ${shiftId}: expected version ${expectedVersion}${actualVersion !== undefined ? `, but found version ${actualVersion}` : ""}`,
    );
    this.name = "OptimisticLockError";
  }
}

async function requestScheduleJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(
      formatClientErrorMessage(body?.error, "Schedule request failed."),
    );
  }

  return body as T;
}

export function fetchScheduleActorNames(input: {
  ids: string[];
  orgId: string;
}): Promise<ScheduleActorNamesResponse> {
  return requestScheduleJson("/api/schedule/actor-names", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchRepeatOverwriteCount(input: {
  empId: string;
  dates: string[];
}): Promise<{ overwriteCount: number }> {
  return requestScheduleJson("/api/shifts/repeat-overwrites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

function requestScheduleAction<T>(body: Record<string, unknown>): Promise<T> {
  return requestScheduleJson("/api/schedule/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchShiftRequests(
  orgId: string,
  assignmentLabelMap: Map<number, string>,
  filters?: {
    status?: ShiftRequestStatus[];
    type?: ShiftRequestType;
    empId?: string;
  },
): Promise<ShiftRequest[]> {
  return requestScheduleAction<{ requests: ShiftRequest[] }>({
    action: "fetchShiftRequests",
    orgId,
    assignmentLabels: [...assignmentLabelMap.entries()],
    ...filters,
  }).then((data) => data.requests);
}

export function createShiftRequest(
  orgId: string,
  type: ShiftRequestType,
  requesterEmpId: string,
  requesterShiftDate: string,
  targetEmpId?: string,
  targetShiftDate?: string,
  absenceTypeId?: number,
  requesterSegmentIndex?: number,
  targetSegmentIndex?: number,
): Promise<string> {
  return requestScheduleAction<{ requestId: string }>({
    action: "createShiftRequest",
    orgId,
    type,
    requesterEmpId,
    requesterShiftDate,
    targetEmpId,
    targetShiftDate,
    absenceTypeId,
    requesterSegmentIndex,
    targetSegmentIndex,
  }).then((data) => data.requestId);
}

export function claimShiftRequest(
  requestId: string,
  claimerEmpId: string,
  orgId: string,
): Promise<void> {
  return requestScheduleAction<{ success: true }>({
    action: "claimShiftRequest",
    orgId,
    requestId,
    claimerEmpId,
  }).then(() => undefined);
}

export function volunteerForOpenShift(
  orgId: string,
  empId: string,
  shiftDate: string,
  input: ScheduleCellInput,
  focusAreaId: number,
): Promise<string> {
  return requestScheduleAction<{ requestId: string }>({
    action: "volunteerForOpenShift",
    orgId,
    empId,
    shiftDate,
    input,
    focusAreaId,
  }).then((data) => data.requestId);
}

export function respondToShiftRequest(
  requestId: string,
  empId: string,
  accept: boolean,
  orgId: string,
): Promise<void> {
  return requestScheduleAction<{ success: true }>({
    action: "respondToShiftRequest",
    orgId,
    requestId,
    empId,
    accept,
  }).then(() => undefined);
}

export function resolveShiftRequest(
  requestId: string,
  approved: boolean,
  note: string | undefined,
  orgId: string,
): Promise<void> {
  return requestScheduleAction<{ success: true }>({
    action: "resolveShiftRequest",
    orgId,
    requestId,
    approved,
    note,
  }).then(() => undefined);
}

export function cancelShiftRequest(
  requestId: string,
  empId: string,
  orgId: string,
): Promise<void> {
  return requestScheduleAction<{ success: true }>({
    action: "cancelShiftRequest",
    orgId,
    requestId,
    empId,
  }).then(() => undefined);
}

export function fetchPublishHistory(
  orgId: string,
  limit = 20,
  offset = 0,
): Promise<PublishHistoryEntryWithName[]> {
  const params = new URLSearchParams({
    orgId,
    limit: String(limit),
    offset: String(offset),
  });
  return requestScheduleJson<{ entries: PublishHistoryEntryWithName[] }>(
    `/api/schedule/publish-history?${params}`,
  ).then((data) => data.entries);
}

export function fetchRecentPublishHistory(
  orgId: string,
  since?: string | null,
): Promise<PublishHistoryEntry[]> {
  const params = new URLSearchParams({ orgId });
  if (since) {
    params.set("since", since);
  }
  return requestScheduleJson<{ entries: PublishHistoryEntry[] }>(
    `/api/schedule/publish-history/recent?${params}`,
  ).then((data) => data.entries);
}

export function fetchPublishedDateRanges(
  orgId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ startDate: string; endDate: string }[]> {
  const params = new URLSearchParams({ orgId, rangeStart, rangeEnd });
  return requestScheduleJson<{
    ranges: { startDate: string; endDate: string }[];
  }>(`/api/schedule/published-ranges?${params}`).then((data) => data.ranges);
}

function requestRecurringAction<T>(body: Record<string, unknown>): Promise<T> {
  return requestScheduleJson("/api/schedule/recurring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchRecurringShifts(
  orgId: string,
  employeeId?: string,
  assignmentLabelMap?: Map<number, string>,
  includeArchived = false,
  absenceTypeMap?: Map<number, string>,
): Promise<RecurringShift[]> {
  return requestRecurringAction<{ rows: RecurringShift[] }>({
    action: "fetchRecurringShifts",
    orgId,
    employeeId,
    assignmentLabels: assignmentLabelMap
      ? [...assignmentLabelMap.entries()]
      : undefined,
    absenceTypeLabels: absenceTypeMap
      ? [...absenceTypeMap.entries()]
      : undefined,
    includeArchived,
  }).then((data) => data.rows);
}

export function getRecurringDraft(
  orgId: string,
  _userId: string,
): Promise<{
  id: string;
  orgId: string;
  savedBy: string;
  draftData: RecurringScheduleDraft;
  savedAt: string;
} | null> {
  return requestRecurringAction<{
    draft: {
      id: string;
      orgId: string;
      savedBy: string;
      draftData: RecurringScheduleDraft;
      savedAt: string;
    } | null;
  }>({
    action: "getRecurringDraft",
    orgId,
  }).then((data) => data.draft);
}

export function saveRecurringDraft(
  orgId: string,
  _savedBy: string,
  draftData: RecurringScheduleDraft,
): Promise<void> {
  return requestRecurringAction<{ success: true }>({
    action: "saveRecurringDraft",
    orgId,
    draftData,
  }).then(() => undefined);
}

export function deleteRecurringDraft(
  orgId: string,
  _userId: string,
): Promise<void> {
  return requestRecurringAction<{ success: true }>({
    action: "deleteRecurringDraft",
    orgId,
  }).then(() => undefined);
}

export function upsertRecurringShift(
  employeeId: string,
  orgId: string,
  dayOfWeek: number,
  input: ScheduleCellInput,
  effectiveFrom: string,
): Promise<void> {
  return requestRecurringAction<{ success: true }>({
    action: "upsertRecurringShift",
    orgId,
    employeeId,
    dayOfWeek,
    input,
    effectiveFrom,
  }).then(() => undefined);
}

export function deleteRecurringShift(
  employeeId: string,
  dayOfWeek: number,
  orgId: string,
): Promise<void> {
  return requestRecurringAction<{ success: true }>({
    action: "deleteRecurringShift",
    orgId,
    employeeId,
    dayOfWeek,
  }).then(() => undefined);
}

function requestScheduleManage<T>(body: Record<string, unknown>): Promise<T> {
  return requestScheduleJson("/api/schedule/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchShifts(
  orgId: string,
  isScheduler: boolean,
  assignmentLabelMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
  _segmentCompatibility?: SegmentCompatibilityMaps | null,
): Promise<ShiftMap> {
  return requestScheduleManage<{ shifts: ShiftMap }>({
    action: "fetchShifts",
    orgId,
    isScheduler,
    assignmentLabels: [...assignmentLabelMap.entries()],
    absenceTypeLabels: absenceTypeMap ? [...absenceTypeMap.entries()] : undefined,
    startDate,
    endDate,
  }).then((data) => data.shifts);
}

export function fetchScheduleNotes(
  orgId: string,
  startDate?: string,
  endDate?: string,
): Promise<ScheduleNote[]> {
  return requestScheduleManage<{ notes: ScheduleNote[] }>({
    action: "fetchScheduleNotes",
    orgId,
    startDate,
    endDate,
  }).then((data) => data.notes);
}

export function fetchCalloffOpenShifts(
  orgId: string,
  startDate: string,
  endDate: string,
  assignmentLabelMap: Map<number, string>,
): Promise<GridOpenShift[]> {
  return requestScheduleManage<{ openShifts: GridOpenShift[] }>({
    action: "fetchCalloffOpenShifts",
    orgId,
    startDate,
    endDate,
    assignmentLabels: [...assignmentLabelMap.entries()],
  }).then((data) => data.openShifts);
}

export function getScheduleLastViewed(orgId: string): Promise<string | null> {
  return requestScheduleManage<{ lastViewed: string | null }>({
    action: "getScheduleLastViewed",
    orgId,
  }).then((data) => data.lastViewed);
}

export function updateScheduleLastViewed(orgId: string): Promise<void> {
  return requestScheduleManage<{ success: true }>({
    action: "updateScheduleLastViewed",
    orgId,
  }).then(() => undefined);
}

async function requestManageWithLock(
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch("/api/schedule/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        shiftId?: string;
        expectedVersion?: number;
        actualVersion?: number;
      }
    | null;

  if (response.status === 409) {
    throw new OptimisticLockError(
      payload?.shiftId ?? "",
      payload?.expectedVersion ?? 0,
      payload?.actualVersion,
    );
  }

  if (!response.ok) {
    throw new Error(formatClientErrorMessage(payload?.error, "Schedule request failed."));
  }
}

export function upsertShift(
  employeeId: string,
  date: string,
  input: ScheduleCellInput,
  orgId: string,
  expectedVersion?: number,
): Promise<void> {
  return requestManageWithLock({
    action: "upsertShift",
    orgId,
    employeeId,
    date,
    input,
    expectedVersion,
  });
}

export type UpsertShiftBatchItem = {
  employeeId: string;
  date: string;
  input: ScheduleCellInput;
  expectedVersion?: number;
};

export function upsertShiftBatch(
  orgId: string,
  shifts: UpsertShiftBatchItem[],
): Promise<void> {
  return requestManageWithLock({
    action: "upsertShifts",
    orgId,
    shifts,
  });
}

export function deleteShift(
  employeeId: string,
  date: string,
  orgId: string,
  expectedVersion?: number,
): Promise<void> {
  return requestManageWithLock({
    action: "deleteShift",
    orgId,
    employeeId,
    date,
    expectedVersion,
  });
}

export type DeleteShiftBatchItem = {
  employeeId: string;
  date: string;
  expectedVersion?: number;
};

export function deleteShiftBatch(
  orgId: string,
  shifts: DeleteShiftBatchItem[],
): Promise<void> {
  return requestManageWithLock({
    action: "deleteShifts",
    orgId,
    shifts,
  });
}

export function upsertShiftTimes(
  employeeId: string,
  date: string,
  customStartTime: string | null,
  customEndTime: string | null,
  orgId: string,
  expectedVersion?: number,
): Promise<void> {
  return requestManageWithLock({
    action: "upsertShiftTimes",
    orgId,
    employeeId,
    date,
    customStartTime,
    customEndTime,
    expectedVersion,
  });
}

export function moveShift(
  orgId: string,
  sourceEmpId: string,
  sourceDate: string,
  targetEmpId: string,
  targetDate: string,
  input: ScheduleCellInput,
  dragMode: "move" | "copy" = "move",
  expectedVersion?: number,
  targetExpectedVersion?: number,
  targetWasEmpty?: boolean,
): Promise<void> {
  return requestManageWithLock({
    action: "moveShift",
    orgId,
    sourceEmpId,
    sourceDate,
    targetEmpId,
    targetDate,
    input,
    dragMode,
    expectedVersion,
    targetExpectedVersion,
    targetWasEmpty,
  });
}

export function createShiftSeries(
  employeeId: string,
  orgId: string,
  input: ScheduleCellInput,
  shiftLabel: string,
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
  _options?: { onProgress?: (progress: number) => void },
): Promise<ShiftSeries> {
  return requestScheduleManage<{ series: ShiftSeries }>({
    action: "createShiftSeries",
    orgId,
    employeeId,
    input,
    shiftLabel,
    frequency,
    daysOfWeek,
    startDate,
    endDate,
    maxOccurrences,
  }).then((data) => data.series);
}

export function updateSeriesAllShifts(
  seriesId: string,
  input: ScheduleCellInput,
  orgId: string,
): Promise<void> {
  return requestManageWithLock({
    action: "updateSeriesAllShifts",
    orgId,
    seriesId,
    input,
  });
}

export function deleteShiftSeries(
  seriesId: string,
  orgId: string,
): Promise<number> {
  return requestScheduleManage<{ deletedCount: number }>({
    action: "deleteShiftSeries",
    orgId,
    seriesId,
  }).then((data) => data.deletedCount);
}

export function applyRecurringSchedules(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<
  Array<{ empId: string; date: string; label: string; absenceTypeId?: number }>
> {
  return requestScheduleManage<{
    generated: Array<{
      empId: string;
      date: string;
      label: string;
      absenceTypeId?: number;
    }>;
  }>({
    action: "applyRecurringSchedules",
    orgId,
    // Local-tz formatting: toISOString() converts to UTC and shifts the date
    // by one for users east of UTC, silently truncating the range.
    startDate: formatDateKey(startDate),
    endDate: formatDateKey(endDate),
  }).then((data) => data.generated);
}

export async function publishSchedule(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<DraftBreakdown> {
  const response = await fetch("/api/shifts/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgId,
      // See applyRecurringSchedules above — must format in local tz.
      startDate: formatDateKey(startDate),
      endDate: formatDateKey(endDate),
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | { summary?: DraftBreakdown; error?: string }
    | null;
  if (!response.ok || !body?.summary) {
    throw new Error(formatClientErrorMessage(body?.error, "Failed to publish schedule"));
  }
  return body.summary;
}

export async function discardScheduleDrafts(
  orgId: string,
  userId?: string,
): Promise<DraftBreakdown> {
  const response = await fetch("/api/shifts/discard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgId,
      scope: userId ? "mine" : "all",
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | { summary?: DraftBreakdown; error?: string }
    | null;
  if (!response.ok || !body?.summary) {
    throw new Error(formatClientErrorMessage(body?.error, "Failed to discard schedule drafts"));
  }
  return body.summary;
}

export function upsertScheduleNote(
  orgId: string,
  employeeId: string,
  date: string,
  indicatorTypeId: number,
  focusAreaId: number,
  existingStatus?: "published" | "draft" | "draft_deleted",
): Promise<void> {
  return requestScheduleManage<{ success: true }>({
    action: "upsertScheduleNote",
    orgId,
    employeeId,
    date,
    indicatorTypeId,
    focusAreaId,
    existingStatus,
  }).then(() => undefined);
}

export function deleteScheduleNote(
  orgId: string,
  employeeId: string,
  date: string,
  indicatorTypeId: number,
  focusAreaId: number,
  existingStatus?: "published" | "draft" | "draft_deleted",
): Promise<void> {
  return requestScheduleManage<{ success: true }>({
    action: "deleteScheduleNote",
    orgId,
    employeeId,
    date,
    indicatorTypeId,
    focusAreaId,
    existingStatus,
  }).then(() => undefined);
}
