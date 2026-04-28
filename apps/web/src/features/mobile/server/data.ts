import {
  rowToCoverageRequirement,
  rowToEmployee,
  rowToFocusArea,
  rowToJobDefinition,
  rowToNamedItem,
  rowToShiftCategory,
  rowToShiftRequest,
} from "@/lib/db/mappers";
import type { MobilePublishedScheduleRow } from "@dubgrid/data-access";
import {
  fetchLinkedEmployeeRowForUser,
  fetchMobileAbsenceTypeRows,
  fetchMobileAssignmentSeedRows,
  fetchMobileFocusAreaRows as fetchMobileFocusAreaRowsData,
  fetchMobileJobNameRows,
  fetchMobileNotificationsPage as fetchMobileNotificationsPageData,
  fetchMobileOpenShiftContextRows as fetchMobileOpenShiftContextRowsData,
  fetchMobilePeopleRows as fetchMobilePeopleRowsData,
  fetchMobilePublishHistoryRows,
  fetchMobileShiftRequestRows as fetchMobileShiftRequestRowsData,
  fetchMobileUnreadNotificationCount as fetchMobileUnreadNotificationCountData,
  fetchProfileNameRowsByIds as fetchProfileNameRowsByIdsData,
  fetchPublishedMobileScheduleRows as fetchPublishedMobileScheduleRowsData,
} from "@dubgrid/data-access";
import type { DbShiftRequest } from "@dubgrid/db-types";
import { buildShiftJobPairKey } from "@/lib/shift-job-segments";
import type {
  AssignmentDefinition,
  FocusArea,
  JobDefinition,
  Employee,
  NamedItem,
  ShiftCategory,
} from "@/types";
import type { Organization } from "@dubgrid/domain";
import {
  buildScheduleAssignmentOptions,
  buildShiftDisplayParts,
  formatAssignableShiftOptionLabel,
  getQualificationSeniorityRank,
  isEmployeeQualifiedForAssignmentDefinition,
} from "@/lib/assignable-shifts";
import {
  getJobPlacementShiftPool,
  resolveJobColorsForShift,
  resolveJobTimesForShift,
} from "@/lib/job-placement";
import type {
  MobileAbsenceType,
  MobileFocusArea,
  MobileNotification,
  MobileOpenShift,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAssignmentDefinitionIdsByFocusArea,
  computeCoverageGaps,
  timesOverlap,
  type TimeRange,
} from "@/lib/schedule-logic";

type EmbeddedEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  org_id: string;
  seniority?: number | null;
  focus_area_ids?: number[];
};

type MobileAssignmentDetails = {
  label: string;
  name: string;
  shiftName: string;
  shiftId: number | null;
  jobId: number | null;
  jobSortOrder: number | null;
  focusAreaId: number | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  defaultDurationHours: number | null;
  defaultDurationMinutes: number | null;
  breakMinutes: number | null;
  color: string | null;
  borderColor: string | null;
  textColor: string | null;
};

type MobileAbsenceDetails = {
  label: string;
  name: string;
  color: string | null;
  borderColor: string | null;
  textColor: string | null;
};

type MobilePublishHistoryEntry = {
  startDate: string;
  endDate: string;
  publishedAt: string;
  publishedByName: string | null;
};

type MobilePeopleRow = Pick<
  Employee,
  | "id"
  | "firstName"
  | "lastName"
  | "status"
  | "statusChangedAt"
  | "statusNote"
  | "focusAreaIds"
  | "phone"
  | "email"
  | "contactNotes"
  | "version"
>;

function compareJobsByQualificationSeniority(
  left: JobDefinition,
  right: JobDefinition,
  orgRoles: NamedItem[],
  certifications: NamedItem[],
): number {
  const leftRank = getQualificationSeniorityRank({
    job: left,
    orgRoles,
    certifications,
  });
  const rightRank = getQualificationSeniorityRank({
    job: right,
    orgRoles,
    certifications,
  });
  const leftRanked = leftRank != null;
  const rightRanked = rightRank != null;

  if (leftRanked !== rightRanked) {
    return leftRanked ? -1 : 1;
  }
  if (leftRank != null && rightRank != null && leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.name.localeCompare(right.name);
}

export function resolveMobileDateRange(input?: {
  startDate?: string;
  endDate?: string;
}): { startDate: string; endDate: string } {
  const today = new Date();
  const start = input?.startDate
    ? new Date(`${input.startDate}T00:00:00`)
    : new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = input?.endDate
    ? new Date(`${input.endDate}T00:00:00`)
    : new Date(start.getTime() + 13 * 86_400_000);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function fetchLinkedEmployeeForUser(
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<Employee | null> {
  const row = await fetchLinkedEmployeeRowForUser(serviceClient, orgId, userId);
  return row ? rowToEmployee(row) : null;
}

async function fetchAssignmentDetailsMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<string, MobileAssignmentDetails>> {
  const assignmentSeed = await fetchMobileAssignmentSeedRows(
    serviceClient,
    orgId,
  );
  const focusAreas = assignmentSeed.focusAreaRows.map(rowToFocusArea);
  const shiftCategories = assignmentSeed.shiftCategoryRows.map(
    rowToShiftCategory,
  );
  const jobs = assignmentSeed.jobRows.map(rowToJobDefinition);
  const orgRoles = assignmentSeed.organizationRoleRows.map(rowToNamedItem);
  const certifications = assignmentSeed.certificationRows.map(rowToNamedItem);
  const jobSortOrderById = new Map(
    jobs
      .filter((job) => job.systemKey !== "regular_staff")
      .sort((left, right) =>
        compareJobsByQualificationSeniority(
          left,
          right,
          orgRoles,
          certifications,
        ),
      )
      .map((job, index) => [job.id, index]),
  );
  const detailsByPair = new Map<string, MobileAssignmentDetails>();

  function addDetails(job: JobDefinition, shift: ShiftCategory | null) {
    const colors = resolveJobColorsForShift(job, shift);
    const times = resolveJobTimesForShift(job, shift);
    const displayParts = buildShiftDisplayParts({
      shift,
      job,
      shiftDisplayMode: "code",
    });
    const label = formatAssignableShiftOptionLabel(displayParts);
    const name = shift
      ? displayParts.secondaryLabel
        ? `${shift.name} ${job.name}`
        : shift.name
      : job.name;

    detailsByPair.set(buildShiftJobPairKey(shift?.id ?? null, job.id), {
      label,
      name,
      shiftName: shift?.name ?? job.name,
      shiftId: shift?.id ?? null,
      jobId: job.id,
      jobSortOrder: jobSortOrderById.get(job.id) ?? job.sortOrder,
      focusAreaId: shift?.focusAreaId ?? null,
      shiftStartTime: shift?.startTime ?? null,
      shiftEndTime: shift?.endTime ?? null,
      color: colors.color,
      borderColor: colors.border,
      textColor: colors.text,
      defaultStartTime: times.startTime,
      defaultEndTime: times.endTime,
      defaultDurationHours: shift ? null : (job.defaultDurationHours ?? null),
      defaultDurationMinutes: shift
        ? null
        : (job.defaultDurationMinutes ?? null),
      breakMinutes: shift?.breakMinutes ?? null,
    });
  }

  for (const job of jobs) {
    if (job.systemKey === "regular_staff") continue;
    const mode = job.assignmentMode ?? "with_shift";
    if (mode !== "shiftless") {
      for (const shift of getJobPlacementShiftPool(
        job,
        shiftCategories,
        focusAreas,
      )) {
        addDetails(job, shift);
      }
    }
    if (mode !== "with_shift") {
      addDetails(job, null);
    }
  }

  return detailsByPair;
}

async function fetchAbsenceLabelMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, MobileAbsenceDetails>> {
  const rows = await fetchMobileAbsenceTypeRows(serviceClient, orgId);

  return new Map(
    rows.map((row) => [
      row.id as number,
      {
        label: row.label,
        name: row.name ?? row.label,
        color: row.color ?? null,
        borderColor: row.border_color ?? null,
        textColor: row.text_color ?? null,
      },
    ]),
  );
}

async function fetchJobNameMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, string>> {
  const rows = await fetchMobileJobNameRows(serviceClient, orgId);
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function fetchMobileAbsenceTypes(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileAbsenceType[]> {
  const rows = await fetchMobileAbsenceTypeRows(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    name: row.name ?? undefined,
  }));
}

export async function fetchMobileFocusAreas(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileFocusArea[]> {
  const rows = await fetchMobileFocusAreaRowsData(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

async function fetchFocusAreaNameMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, string>> {
  const focusAreas = await fetchMobileFocusAreaRowsData(serviceClient, orgId);
  return new Map(focusAreas.map((focusArea) => [focusArea.id, focusArea.name]));
}

async function fetchMobilePublishHistory(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobilePublishHistoryEntry[]> {
  const rows = await fetchMobilePublishHistoryRows(serviceClient, orgId);
  if (rows.length === 0) {
    return [];
  }

  const publisherIds = [
    ...new Set(
      rows
        .map((row) => row.published_by)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
  const publisherNameMap = new Map<string, string | null>();

  if (publisherIds.length > 0) {
    const profiles = await fetchProfileNameRowsByIdsData(
      serviceClient,
      publisherIds,
    );
    for (const profile of profiles ?? []) {
      const firstName = profile.first_name ?? "";
      const lastName = profile.last_name ?? "";
      const fullName = `${firstName} ${lastName}`.trim();

      publisherNameMap.set(profile.id, fullName || null);
    }
  }

  return rows.map((row) => ({
    startDate: row.start_date,
    endDate: row.end_date,
    publishedAt: row.published_at,
    publishedByName: (row.published_by && publisherNameMap.get(row.published_by)) ?? null,
  }));
}

function getAssignmentDetailsForPair(
  assignmentDetailsByPair: Map<string, MobileAssignmentDetails>,
  shiftId: number | null,
  jobId: number | null | undefined,
): MobileAssignmentDetails | null {
  if (jobId == null) {
    return null;
  }

  return (
    assignmentDetailsByPair.get(buildShiftJobPairKey(shiftId ?? null, jobId)) ??
    null
  );
}

function joinAssignmentText(
  shiftIds: Array<number | null>,
  jobIds: number[],
  assignmentDetailsByPair: Map<string, MobileAssignmentDetails>,
  field: "label" | "name",
): string {
  return jobIds
    .map(
      (jobId, index) =>
        getAssignmentDetailsForPair(
          assignmentDetailsByPair,
          shiftIds[index] ?? null,
          jobId,
        )?.[field] ?? "?",
    )
    .join(" / ");
}

function joinShiftNames(
  shiftIds: Array<number | null>,
  jobIds: number[],
  assignmentDetailsByPair: Map<string, MobileAssignmentDetails>,
): string {
  const names = jobIds
    .map(
      (jobId, index) =>
        getAssignmentDetailsForPair(
          assignmentDetailsByPair,
          shiftIds[index] ?? null,
          jobId,
        )?.shiftName ?? "?",
    )
    .filter((name, index, values) => values.indexOf(name) === index);

  return names.join(" / ");
}

function splitPipeParts(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function pickPipeTime(
  value: string | null | undefined,
  which: "first" | "last",
): string | null {
  const parts = splitPipeParts(value);
  if (parts.length === 0) {
    return null;
  }

  return which === "first"
    ? (parts[0] ?? null)
    : (parts[parts.length - 1] ?? null);
}

function getFallbackTime(
  shiftIds: Array<number | null>,
  jobIds: number[],
  assignmentDetailsByPair: Map<string, MobileAssignmentDetails>,
  part: "start" | "end",
): string | null {
  if (jobIds.length === 0) {
    return null;
  }

  const assignmentDetails =
    part === "start"
      ? getAssignmentDetailsForPair(
          assignmentDetailsByPair,
          shiftIds[0] ?? null,
          jobIds[0],
        )
      : getAssignmentDetailsForPair(
          assignmentDetailsByPair,
          shiftIds[jobIds.length - 1] ?? null,
          jobIds[jobIds.length - 1],
        );

  if (!assignmentDetails) {
    return null;
  }

  return part === "start"
    ? assignmentDetails.defaultStartTime
    : assignmentDetails.defaultEndTime;
}

function buildMobileScheduleEntrySegments(input: {
  absenceTypeId: number | null;
  customStartTime: string | null;
  customEndTime: string | null;
  focusAreaNameMap: Map<number, string>;
  jobNameMap: Map<number, string>;
  rowFocusAreaId: number | null;
  shiftIds: Array<number | null>;
  jobIds: number[];
  assignmentDetailsByPair: Map<string, MobileAssignmentDetails>;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
}): MobileScheduleEntrySegment[] {
  if (input.absenceTypeId != null) {
    return [
      {
        label: input.shiftName,
        shiftName: input.shiftName,
        startTime: null,
        endTime: null,
        displayFocusAreaName: null,
      },
    ];
  }

  const customStartTimes = splitPipeParts(input.customStartTime);
  const customEndTimes = splitPipeParts(input.customEndTime);
  const segments = input.jobIds.map((jobId, index) => {
    const assignmentDetails = getAssignmentDetailsForPair(
      input.assignmentDetailsByPair,
      input.shiftIds[index] ?? null,
      jobId,
    );
    const segmentFocusAreaId =
      input.rowFocusAreaId ?? assignmentDetails?.focusAreaId ?? null;

    return {
      shiftId: input.shiftIds[index] ?? null,
      jobId,
      label: assignmentDetails?.label ?? "?",
      shiftName:
        assignmentDetails?.shiftName ??
        assignmentDetails?.name ??
        assignmentDetails?.label ??
        "?",
      jobName: input.jobNameMap.get(jobId) ?? null,
      jobSortOrder: assignmentDetails?.jobSortOrder ?? null,
      jobColor: assignmentDetails?.color ?? null,
      jobBorderColor: assignmentDetails?.borderColor ?? null,
      jobTextColor: assignmentDetails?.textColor ?? null,
      shiftStartTime: assignmentDetails?.shiftStartTime ?? null,
      shiftEndTime: assignmentDetails?.shiftEndTime ?? null,
      defaultDurationHours: assignmentDetails?.defaultDurationHours ?? null,
      defaultDurationMinutes: assignmentDetails?.defaultDurationMinutes ?? null,
      breakMinutes: assignmentDetails?.breakMinutes ?? null,
      startTime:
        customStartTimes[index] ?? assignmentDetails?.defaultStartTime ?? null,
      endTime:
        customEndTimes[index] ?? assignmentDetails?.defaultEndTime ?? null,
      displayFocusAreaName:
        segmentFocusAreaId != null
          ? (input.focusAreaNameMap.get(segmentFocusAreaId) ?? null)
          : null,
    };
  });

  if (segments.length > 0) {
    return segments;
  }

  return [
    {
      label: input.shiftName,
      shiftName: input.shiftName,
      startTime: input.startTime,
      endTime: input.endTime,
      displayFocusAreaName: null,
    },
  ];
}

function buildMobileShiftRequestSegments(input: {
  customStartTime: string | null;
  customEndTime: string | null;
  fallbackShiftName: string | null;
  focusAreaId: number | null;
  focusAreaNameMap: Map<number, string>;
  jobIds: number[] | null | undefined;
  jobNameMap: Map<number, string>;
  assignmentDetailsByPair: Map<string, MobileAssignmentDetails>;
  shiftIds: Array<number | null> | null | undefined;
}): MobileScheduleEntrySegment[] {
  const shiftIds = input.shiftIds ?? [];
  const jobIds = input.jobIds ?? [];
  const customStartTimes = splitPipeParts(input.customStartTime);
  const customEndTimes = splitPipeParts(input.customEndTime);
  const segments = jobIds.map((jobId, index) => {
    const assignmentDetails = getAssignmentDetailsForPair(
      input.assignmentDetailsByPair,
      shiftIds[index] ?? null,
      jobId,
    );
    const focusAreaId =
      input.focusAreaId ?? assignmentDetails?.focusAreaId ?? null;

    return {
      shiftId: shiftIds[index] ?? null,
      jobId,
      label: assignmentDetails?.label ?? "?",
      shiftName:
        assignmentDetails?.shiftName ??
        assignmentDetails?.name ??
        assignmentDetails?.label ??
        "?",
      jobName: jobId != null ? (input.jobNameMap.get(jobId) ?? null) : null,
      jobSortOrder: assignmentDetails?.jobSortOrder ?? null,
      jobColor: assignmentDetails?.color ?? null,
      jobBorderColor: assignmentDetails?.borderColor ?? null,
      jobTextColor: assignmentDetails?.textColor ?? null,
      shiftStartTime: assignmentDetails?.shiftStartTime ?? null,
      shiftEndTime: assignmentDetails?.shiftEndTime ?? null,
      defaultDurationHours: assignmentDetails?.defaultDurationHours ?? null,
      defaultDurationMinutes: assignmentDetails?.defaultDurationMinutes ?? null,
      breakMinutes: assignmentDetails?.breakMinutes ?? null,
      startTime:
        customStartTimes[index] ?? assignmentDetails?.defaultStartTime ?? null,
      endTime:
        customEndTimes[index] ?? assignmentDetails?.defaultEndTime ?? null,
      displayFocusAreaName:
        focusAreaId != null
          ? (input.focusAreaNameMap.get(focusAreaId) ?? null)
          : null,
    };
  });

  if (segments.length > 0) {
    return segments;
  }

  if (!input.fallbackShiftName) {
    return [];
  }

  const fallbackJobId = jobIds[0] ?? null;

  return [
    {
      shiftId: shiftIds[0] ?? null,
      jobId: fallbackJobId,
      label: input.fallbackShiftName,
      shiftName: input.fallbackShiftName,
      jobName:
        fallbackJobId != null
          ? (input.jobNameMap.get(fallbackJobId) ?? null)
          : null,
      jobSortOrder: null,
      jobColor: null,
      jobBorderColor: null,
      jobTextColor: null,
      shiftStartTime: null,
      shiftEndTime: null,
      startTime: pickPipeTime(input.customStartTime, "first"),
      endTime: pickPipeTime(input.customEndTime, "last"),
      displayFocusAreaName:
        input.focusAreaId != null
          ? (input.focusAreaNameMap.get(input.focusAreaId) ?? null)
          : null,
    },
  ];
}

function normalizeMobileTimeValue(value: string | null | undefined): string | null {
  return value ? value.slice(0, 5) : null;
}

function toMobileTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): TimeRange | null {
  const normalizedStart = normalizeMobileTimeValue(start);
  const normalizedEnd = normalizeMobileTimeValue(end);

  if (!normalizedStart || !normalizedEnd) {
    return null;
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
  };
}

function getMobileSegmentTimeRanges(
  segments: ReadonlyArray<MobileScheduleEntrySegment>,
): TimeRange[] {
  return segments.flatMap((segment) => {
    const range = toMobileTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });
}

function getScheduleRowTimeRanges(input: {
  row: MobilePublishedScheduleRow;
  assignmentDetailsByPair: Map<string, MobileAssignmentDetails>;
  focusAreaNameMap: Map<number, string>;
  jobNameMap: Map<number, string>;
}): TimeRange[] {
  if (input.row.state.kind !== "worked") {
    return [];
  }

  const segments = buildMobileShiftRequestSegments({
    customStartTime: input.row.state.customStartTime ?? null,
    customEndTime: input.row.state.customEndTime ?? null,
    fallbackShiftName: null,
    focusAreaId: input.row.focus_area_id,
    focusAreaNameMap: input.focusAreaNameMap,
    jobIds: input.row.state.segments.map((segment) => segment.jobId),
    jobNameMap: input.jobNameMap,
    assignmentDetailsByPair: input.assignmentDetailsByPair,
    shiftIds: input.row.state.segments.map((segment) => segment.shiftId ?? null),
  });

  return getMobileSegmentTimeRanges(segments);
}

function getAssignmentDefinitionTimeRanges(
  assignment: Pick<AssignmentDefinition, "defaultStartTime" | "defaultEndTime">,
): TimeRange[] {
  const range = toMobileTimeRange(
    assignment.defaultStartTime,
    assignment.defaultEndTime,
  );

  return range ? [range] : [];
}

function findPublishHistoryEntryForDate(
  history: MobilePublishHistoryEntry[],
  date: string,
): MobilePublishHistoryEntry | null {
  return (
    history.find((entry) => entry.startDate <= date && entry.endDate >= date) ??
    null
  );
}

export async function fetchMobileScheduleEntries(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
): Promise<MobileScheduleEntry[]> {
  const [
    assignmentDetailsByPair,
    absenceMap,
    focusAreaNameMap,
    jobNameMap,
    publishHistory,
  ] = await Promise.all([
    fetchAssignmentDetailsMap(serviceClient, input.orgId),
    fetchAbsenceLabelMap(serviceClient, input.orgId),
    fetchFocusAreaNameMap(serviceClient, input.orgId),
    fetchJobNameMap(serviceClient, input.orgId),
    fetchMobilePublishHistory(serviceClient, input.orgId),
  ]);
  const data = await fetchPublishedMobileScheduleRowsData(serviceClient, input);

  const entries: MobileScheduleEntry[] = [];

  for (const row of data ?? []) {
    const state = row.state;
    const shiftIds =
      state.kind === "worked"
        ? state.segments.map((segment) => segment.shiftId ?? null)
        : [];
    const jobIds =
      state.kind === "worked"
        ? state.segments.map((segment) => segment.jobId)
        : [];
    const absenceTypeId = state.kind === "absence" ? state.absenceTypeId : null;
    if (shiftIds.length === 0 && jobIds.length === 0 && absenceTypeId == null) {
      continue;
    }

    const absence =
      absenceTypeId != null ? (absenceMap.get(absenceTypeId) ?? null) : null;
    const primaryAssignmentDetails =
      jobIds.length > 0
        ? getAssignmentDetailsForPair(
            assignmentDetailsByPair,
            shiftIds[0] ?? null,
            jobIds[0],
          )
        : null;
    const assignmentLabel =
      absenceTypeId != null
        ? (absence?.label ?? "?")
        : joinAssignmentText(
            shiftIds,
            jobIds,
            assignmentDetailsByPair,
            "label",
          );
    const shiftName =
      absenceTypeId != null
        ? (absence?.name ?? absence?.label ?? "Off")
        : joinShiftNames(shiftIds, jobIds, assignmentDetailsByPair);
    const startTime =
      absenceTypeId != null
        ? null
        : (pickPipeTime(state.customStartTime, "first") ??
          getFallbackTime(shiftIds, jobIds, assignmentDetailsByPair, "start"));
    const endTime =
      absenceTypeId != null
        ? null
        : (pickPipeTime(state.customEndTime, "last") ??
          getFallbackTime(shiftIds, jobIds, assignmentDetailsByPair, "end"));

    const rowFocusAreaId = (row.focus_area_id as number | null) ?? null;
    const explicitFocusAreaId =
      rowFocusAreaId ?? primaryAssignmentDetails?.focusAreaId ?? null;
    const focusAreaId = explicitFocusAreaId;
    const focusAreaName =
      focusAreaId != null ? (focusAreaNameMap.get(focusAreaId) ?? null) : null;
    const displayFocusAreaName =
      absenceTypeId != null || explicitFocusAreaId == null
        ? null
        : (focusAreaNameMap.get(explicitFocusAreaId) ?? null);
    const publishEntry = findPublishHistoryEntryForDate(
      publishHistory,
      row.date as string,
    );
    const segments = buildMobileScheduleEntrySegments({
      absenceTypeId,
      customStartTime: state.customStartTime,
      customEndTime: state.customEndTime,
      focusAreaNameMap,
      jobNameMap,
      rowFocusAreaId,
      shiftIds,
      jobIds,
      assignmentDetailsByPair,
      shiftName,
      startTime,
      endTime,
    });
    const presentation = {
      label: assignmentLabel || shiftName,
      shiftName,
      focusAreaId,
      focusAreaName,
      displayFocusAreaName,
      startTime,
      endTime,
      shiftColor: absence?.color ?? primaryAssignmentDetails?.color ?? null,
      shiftBorderColor:
        absence?.borderColor ??
        primaryAssignmentDetails?.borderColor ??
        absence?.color ??
        primaryAssignmentDetails?.color ??
        null,
      shiftTextColor:
        absence?.textColor ?? primaryAssignmentDetails?.textColor ?? null,
      segments,
    };

    entries.push({
      employeeId: row.employees.id,
      employeeName: `${row.employees.first_name} ${row.employees.last_name}`.trim(),
      employeeSeniority: row.employees.seniority ?? null,
      date: row.date as string,
      state,
      presentation,
      publishedAt: publishEntry?.publishedAt ?? null,
      publishedByName: publishEntry?.publishedByName ?? null,
    });
  }

  return entries;
}

function parseMobileIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatMobileIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getMobileDatesBetween(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const cursor = parseMobileIsoDate(startDate);
  const end = parseMobileIsoDate(endDate);

  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getPublishedMobileDates(
  dates: Date[],
  publishHistory: MobilePublishHistoryEntry[],
): Date[] {
  if (publishHistory.length === 0) {
    return [];
  }

  return dates.filter((date) => {
    const dateKey = formatMobileIsoDate(date);
    return publishHistory.some(
      (entry) => entry.startDate <= dateKey && entry.endDate >= dateKey,
    );
  });
}

async function fetchMobileOpenShiftContext(
  serviceClient: SupabaseClient,
  orgId: string,
) {
  const contextRows = await fetchMobileOpenShiftContextRowsData(
    serviceClient,
    orgId,
  );
  const focusAreas = contextRows.focusAreaRows.map(rowToFocusArea);
  const shiftCategories = contextRows.shiftCategoryRows.map(rowToShiftCategory);
  const jobs = contextRows.jobRows.map(rowToJobDefinition);
  const orgRoles = contextRows.organizationRoleRows.map(rowToNamedItem);
  const coverageRequirements = contextRows.coverageRequirementRows.map(
    rowToCoverageRequirement,
  );
  const employees = contextRows.employeeRows
    .map((row) => rowToEmployee(row))
    .filter((employee) => employee.status === "active");
  const assignments = buildScheduleAssignmentOptions({
    orgId,
    focusAreas,
    shiftCategories,
    jobs,
  });

  return {
    assignments,
    coverageRequirements,
    employees,
    focusAreas,
    jobs,
    orgRoles,
    shiftCategories,
  };
}

export async function fetchMobileOpenShifts(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employee: Employee;
    startDate?: string;
    endDate?: string;
  },
): Promise<MobileOpenShift[]> {
  const range = resolveMobileDateRange({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const [
    assignmentDetailsByPair,
    focusAreaNameMap,
    publishHistory,
    context,
    scheduleRows,
  ] = await Promise.all([
    fetchAssignmentDetailsMap(serviceClient, input.orgId),
    fetchFocusAreaNameMap(serviceClient, input.orgId),
    fetchMobilePublishHistory(serviceClient, input.orgId),
    fetchMobileOpenShiftContext(serviceClient, input.orgId),
    fetchPublishedMobileScheduleRowsData(serviceClient, {
      orgId: input.orgId,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
  ]);

  const dates = getPublishedMobileDates(
    getMobileDatesBetween(range.startDate, range.endDate),
    publishHistory,
  );
  if (dates.length === 0) {
    return [];
  }

  const assignmentIdByPair = new Map(
    context.assignments.flatMap((assignment) =>
      assignment.jobId == null
        ? []
        : [
            [
              buildShiftJobPairKey(
                assignment.shiftId ?? null,
                assignment.jobId,
              ),
              assignment.id,
            ],
          ],
    ),
  );
  const employeesByFocusArea = new Map<number, Employee[]>();
  for (const focusArea of context.focusAreas) {
    employeesByFocusArea.set(
      focusArea.id,
      context.employees.filter((employee) =>
        employee.focusAreaIds.includes(focusArea.id),
      ),
    );
  }
  const rowByEmployeeDate = new Map(
    scheduleRows.map((row) => [`${row.emp_id}_${row.date}`, row]),
  );
  const assignmentById = new Map(
    context.assignments.map((assignment) => [assignment.id, assignment]),
  );

  const gaps = computeCoverageGaps(
    context.focusAreas,
    context.shiftCategories,
    context.assignments,
    context.coverageRequirements,
    dates,
    employeesByFocusArea,
    (empId, date) => {
      const row = rowByEmployeeDate.get(
        `${empId}_${formatMobileIsoDate(date)}`,
      );
      if (!row || row.state.kind !== "worked") {
        return [];
      }

      return row.state.segments.flatMap((segment) => {
        const assignmentId = assignmentIdByPair.get(
          buildShiftJobPairKey(segment.shiftId ?? null, segment.jobId),
        );
        return assignmentId == null ? [] : [assignmentId];
      });
    },
    assignmentById,
    buildAssignmentDefinitionIdsByFocusArea(
      context.focusAreas,
      context.assignments,
    ),
  );
  const jobNameMap = new Map(context.jobs.map((job) => [job.id, job.name]));

  return gaps.flatMap((gap) => {
    const openAssignments = gap.eligibleAssignmentDefinitionIds
      .map((assignmentId) => assignmentById.get(assignmentId))
      .filter(
        (assignment): assignment is (typeof context.assignments)[number] =>
          Boolean(assignment),
      );
    const qualifiedAssignments = openAssignments.filter((assignment) =>
      isEmployeeQualifiedForAssignmentDefinition(input.employee, {
        assignment,
        shiftCategories: context.shiftCategories,
        jobs: context.jobs,
        orgRoles: context.orgRoles,
      }),
    );
    const employeeScheduleRow = rowByEmployeeDate.get(
      `${input.employee.id}_${formatMobileIsoDate(gap.date)}`,
    );
    const employeeTimeRanges = employeeScheduleRow
      ? getScheduleRowTimeRanges({
          row: employeeScheduleRow,
          assignmentDetailsByPair,
          focusAreaNameMap,
          jobNameMap,
        })
      : [];
    const conflictFreeAssignments = qualifiedAssignments.filter((assignment) => {
      const assignmentRanges = getAssignmentDefinitionTimeRanges(assignment);

      if (employeeTimeRanges.length === 0 || assignmentRanges.length === 0) {
        return true;
      }

      return !timesOverlap(employeeTimeRanges, assignmentRanges);
    });
    const assignment =
      conflictFreeAssignments.find(
        (item) => item.id === gap.preferredOpenAssignmentDefinitionId,
      ) ??
      conflictFreeAssignments[0] ??
      null;

    if (!assignment || assignment.jobId == null) {
      return [];
    }

    const shiftIds = [assignment.shiftId ?? null];
    const jobIds = [assignment.jobId];
    const segments = buildMobileShiftRequestSegments({
      customStartTime: null,
      customEndTime: null,
      fallbackShiftName: gap.assignmentLabel,
      focusAreaId: gap.focusAreaId,
      focusAreaNameMap,
      jobIds,
      jobNameMap,
      assignmentDetailsByPair,
      shiftIds,
    });

    return [
      {
        id: `coverage_gap_${gap.focusAreaId}_${assignment.id}_${formatMobileIsoDate(gap.date)}`,
        date: formatMobileIsoDate(gap.date),
        focusAreaId: gap.focusAreaId,
        focusAreaName: gap.focusAreaName,
        needed: Math.max(gap.status.required - gap.status.actual, 1),
        state: {
          kind: "worked" as const,
          segments: [
            {
              shiftId: assignment.shiftId ?? null,
              jobId: assignment.jobId,
              position: 0,
            },
          ],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label:
            segments
              .map((segment) => segment.label ?? segment.shiftName)
              .filter(Boolean)
              .join(" / ") || gap.assignmentLabel,
          focusAreaId: gap.focusAreaId,
          focusAreaName: gap.focusAreaName,
          displayFocusAreaName: segments[0]?.displayFocusAreaName ?? null,
          startTime: segments[0]?.startTime ?? null,
          endTime: segments[0]?.endTime ?? null,
          segments,
        },
      },
    ];
  });
}

export async function fetchMobileShiftRequests(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId?: string;
    includeOpenPickupRequests?: boolean;
    startDate?: string;
    endDate?: string;
  },
): Promise<MobileShiftRequest[]> {
  const [assignmentDetailsByPair, focusAreaNameMap, jobNameMap] =
    await Promise.all([
      fetchAssignmentDetailsMap(serviceClient, input.orgId),
      fetchFocusAreaNameMap(serviceClient, input.orgId),
      fetchJobNameMap(serviceClient, input.orgId),
    ]);
  const rows = await fetchMobileShiftRequestRowsData(serviceClient, input);

  return rows.map((row) => {
    const requester = Array.isArray(row.requester)
      ? (row.requester[0] ?? null)
      : row.requester;
    const target = Array.isArray(row.target) ? (row.target[0] ?? null) : row.target;
    const mapped: DbShiftRequest = {
      id: row.id,
      org_id: row.org_id,
      type: row.type as DbShiftRequest["type"],
      status: row.status as DbShiftRequest["status"],
      requester_emp_id: row.requester_emp_id,
      requester_shift_date: row.requester_shift_date,
      requester_state: row.requester_state as DbShiftRequest["requester_state"],
      target_emp_id: row.target_emp_id ?? null,
      target_shift_date: row.target_shift_date ?? null,
      target_state: row.target_state ?? null,
      absence_type_id: row.absence_type_id ?? null,
      parent_request_id: row.parent_request_id ?? null,
      admin_user_id: row.admin_user_id ?? null,
      admin_note: row.admin_note ?? null,
      expires_at: row.expires_at,
      resolved_at: row.resolved_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      requester_first_name: requester?.first_name,
      requester_last_name: requester?.last_name,
      target_first_name: target?.first_name ?? null,
      target_last_name: target?.last_name ?? null,
    };

    const baseRequest = rowToShiftRequest(
      mapped,
      new Map(),
      undefined,
      undefined,
    );
    const requesterSegments = buildMobileShiftRequestSegments({
      customStartTime: baseRequest.requesterState.customStartTime ?? null,
      customEndTime: baseRequest.requesterState.customEndTime ?? null,
      fallbackShiftName: baseRequest.requesterShiftLabel,
      focusAreaId: baseRequest.requesterFocusAreaId ?? null,
      focusAreaNameMap,
      jobIds: baseRequest.requesterState.segments.map(
        (segment) => segment.jobId,
      ),
      jobNameMap,
      assignmentDetailsByPair,
      shiftIds: baseRequest.requesterState.segments.map(
        (segment) => segment.shiftId,
      ),
    });
    const targetSegments =
      baseRequest.targetState != null
        ? buildMobileShiftRequestSegments({
            customStartTime: baseRequest.targetState.customStartTime ?? null,
            customEndTime: baseRequest.targetState.customEndTime ?? null,
            fallbackShiftName: baseRequest.targetShiftLabel,
            focusAreaId: baseRequest.targetFocusAreaId ?? null,
            focusAreaNameMap,
            jobIds: baseRequest.targetState.segments.map(
              (segment) => segment.jobId,
            ),
            jobNameMap,
            assignmentDetailsByPair,
            shiftIds: baseRequest.targetState.segments.map(
              (segment) => segment.shiftId,
            ),
          })
        : null;

    const {
      requesterPresentation: _requesterPresentation,
      targetPresentation: _targetPresentation,
      requesterShiftIds: _requesterShiftIds,
      requesterJobIds: _requesterJobIds,
      requesterSegments: _requesterSegments,
      requesterShiftLabel: _requesterShiftLabel,
      requesterFocusAreaId: _requesterFocusAreaId,
      requesterCustomStartTime: _requesterCustomStartTime,
      requesterCustomEndTime: _requesterCustomEndTime,
      requesterAssignmentDefinitionIds: _requesterAssignmentDefinitionIds,
      targetShiftIds: _targetShiftIds,
      targetJobIds: _targetJobIds,
      targetSegments: _targetSegments,
      targetShiftLabel: _targetShiftLabel,
      targetFocusAreaId: _targetFocusAreaId,
      targetCustomStartTime: _targetCustomStartTime,
      targetCustomEndTime: _targetCustomEndTime,
      targetAssignmentDefinitionIds: _targetAssignmentDefinitionIds,
      ...mobileRequestRest
    } = baseRequest;

    return {
      ...mobileRequestRest,
      requesterState: baseRequest.requesterState,
      requesterPresentation: {
        label:
          requesterSegments
            .map((segment) => segment.label ?? segment.shiftName)
            .filter(Boolean)
            .join(" / ") ||
          baseRequest.requesterShiftLabel ||
          "?",
        focusAreaId: baseRequest.requesterFocusAreaId,
        focusAreaName:
          baseRequest.requesterFocusAreaId != null
            ? (focusAreaNameMap.get(baseRequest.requesterFocusAreaId) ?? null)
            : null,
        displayFocusAreaName:
          requesterSegments[0]?.displayFocusAreaName ?? null,
        startTime: baseRequest.requesterState.customStartTime,
        endTime: baseRequest.requesterState.customEndTime,
        segments: requesterSegments,
      },
      targetState: baseRequest.targetState ?? null,
      targetPresentation:
        baseRequest.targetState != null
          ? {
              label:
                targetSegments
                  ?.map((segment) => segment.label ?? segment.shiftName)
                  .filter(Boolean)
                  .join(" / ") ||
                baseRequest.targetShiftLabel ||
                "?",
              focusAreaId: baseRequest.targetFocusAreaId,
              focusAreaName:
                baseRequest.targetFocusAreaId != null
                  ? (focusAreaNameMap.get(baseRequest.targetFocusAreaId) ??
                    null)
                  : null,
              displayFocusAreaName:
                targetSegments?.[0]?.displayFocusAreaName ?? null,
              startTime: baseRequest.targetState.customStartTime,
              endTime: baseRequest.targetState.customEndTime,
              segments: targetSegments ?? [],
            }
          : null,
    };
  });
}

export async function fetchMobilePeople(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobilePeopleRow[]> {
  const rows = await fetchMobilePeopleRowsData(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: (row.status as Employee["status"] | null) ?? "active",
    statusChangedAt: row.status_changed_at ?? null,
    statusNote: row.status_note ?? "",
    focusAreaIds: row.focus_area_ids ?? [],
    phone: row.phone ?? "",
    email: row.email ?? "",
    contactNotes: row.contact_notes ?? "",
    version: row.version ?? 0,
  }));
}

export async function fetchMobileUnreadNotificationCount(
  userClient: SupabaseClient,
): Promise<number> {
  return fetchMobileUnreadNotificationCountData(userClient);
}

export async function fetchMobileNotifications(
  userClient: SupabaseClient,
  input: { limit: number; offset: number },
): Promise<{ unreadCount: number; notifications: MobileNotification[] }> {
  return fetchMobileNotificationsPageData(userClient, input);
}

export function mapOrganizationToMobileConfig(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    timezone: org.timezone,
    shiftDisplayMode: org.shiftDisplayMode,
    labels: {
      focusArea: org.focusAreaLabel,
      certification: org.certificationLabel,
      role: org.roleLabel,
      department: org.departmentLabel,
    },
    featureFlags: org.featureOverrides ?? {},
  };
}
