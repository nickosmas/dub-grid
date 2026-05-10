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
  fetchMobileCertificationRows as fetchMobileCertificationRowsData,
  fetchMobileDepartmentRows as fetchMobileDepartmentRowsData,
  fetchMobileFocusAreaRows as fetchMobileFocusAreaRowsData,
  fetchMobileJobNameRows,
  fetchMobileManagementMembershipRowsByUserIds,
  fetchMobileNotificationsPage as fetchMobileNotificationsPageData,
  fetchMobileOpenShiftContextRows as fetchMobileOpenShiftContextRowsData,
  fetchMobilePeopleRows as fetchMobilePeopleRowsData,
  fetchMobilePendingInvitationRows,
  fetchMobilePublishHistoryRows,
  fetchMobileRoleRows as fetchMobileRoleRowsData,
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
import { isRegularStaffSystemJob } from "@/lib/system-jobs";
import {
  normalizeMobileScheduleRange,
  type MobileScheduleQuery,
} from "@dubgrid/contracts";
import type {
  MobileAbsenceType,
  MobileDepartment,
  MobileFocusArea,
  MobileNamedItem,
  MobileNotification,
  MobileOpenShift,
  MobilePerson,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasShiftStartedAtTimeRanges } from "@dubgrid/schedule-core";
import {
  buildAssignmentDefinitionIdsByFocusArea,
  computeCoverageGaps,
  normalizeCoverageRuleConfig,
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
  showJobOnGrid: boolean;
  isShiftOnly: boolean;
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
  | "employmentType"
  | "status"
  | "statusChangedAt"
  | "statusNote"
  | "certificationId"
  | "roleIds"
  | "seniority"
  | "focusAreaIds"
  | "departmentIds"
  | "deptAdminIds"
  | "phone"
  | "email"
  | "contactNotes"
  | "userId"
  | "version"
> & {
  managementDepartmentIds: number[];
  managementDeptAdminIds: number[];
  pendingInvitation: MobilePerson["pendingInvitation"];
};

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
  return normalizeMobileScheduleRange(input as MobileScheduleQuery | undefined);
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
  const shiftCategories =
    assignmentSeed.shiftCategoryRows.map(rowToShiftCategory);
  const jobs = assignmentSeed.jobRows.map(rowToJobDefinition);
  const orgRoles = assignmentSeed.organizationRoleRows.map(rowToNamedItem);
  const certifications = assignmentSeed.certificationRows.map(rowToNamedItem);
  const jobSortOrderById = new Map(
    jobs
      .filter((job) => !isRegularStaffSystemJob(job))
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
      showJobOnGrid: displayParts.showJobOnGrid,
      isShiftOnly: displayParts.isShiftOnly,
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
    if (isRegularStaffSystemJob(job)) continue;
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
    color: row.color ?? null,
    borderColor: row.border_color ?? null,
    textColor: row.text_color ?? null,
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
    departmentId: row.department_id,
  }));
}

export async function fetchMobileRoles(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileNamedItem[]> {
  const rows = await fetchMobileRoleRowsData(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    abbr: row.abbr,
  }));
}

export async function fetchMobileCertifications(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileNamedItem[]> {
  const rows = await fetchMobileCertificationRowsData(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    abbr: row.abbr,
  }));
}

export async function fetchMobileDepartments(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileDepartment[]> {
  const rows = await fetchMobileDepartmentRowsData(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    abbr: row.abbr,
    type: row.type === "management" ? "management" : "scheduled",
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
  input?: { startDate?: string; endDate?: string },
): Promise<MobilePublishHistoryEntry[]> {
  const rows = await fetchMobilePublishHistoryRows(serviceClient, orgId, input);
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
    publishedByName:
      (row.published_by && publisherNameMap.get(row.published_by)) ?? null,
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

function pickBoundaryPipeTime(
  value: string | null | undefined,
  which: "start" | "end",
  segmentCount: number,
): string | null {
  if (segmentCount <= 1) {
    return pickPipeTime(value, "first");
  }

  return pickPipeTime(value, which === "start" ? "first" : "last");
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
  stateSegments?: ReadonlyArray<{ isMentored?: boolean | null }>;
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
      jobName:
        assignmentDetails?.isShiftOnly === true
          ? null
          : (input.jobNameMap.get(jobId) ?? null),
      jobSortOrder: assignmentDetails?.jobSortOrder ?? null,
      jobColor: assignmentDetails?.color ?? null,
      jobBorderColor: assignmentDetails?.borderColor ?? null,
      jobTextColor: assignmentDetails?.textColor ?? null,
      shiftStartTime: assignmentDetails?.shiftStartTime ?? null,
      shiftEndTime: assignmentDetails?.shiftEndTime ?? null,
      defaultDurationHours: assignmentDetails?.defaultDurationHours ?? null,
      defaultDurationMinutes: assignmentDetails?.defaultDurationMinutes ?? null,
      breakMinutes: assignmentDetails?.breakMinutes ?? null,
      focusAreaId: segmentFocusAreaId,
      startTime:
        customStartTimes[index] ?? assignmentDetails?.defaultStartTime ?? null,
      endTime:
        customEndTimes[index] ?? assignmentDetails?.defaultEndTime ?? null,
      isMentored: input.stateSegments?.[index]?.isMentored ?? false,
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
  stateSegments?: ReadonlyArray<{ isMentored?: boolean | null }>;
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
      jobName:
        assignmentDetails?.isShiftOnly === true || jobId == null
          ? null
          : (input.jobNameMap.get(jobId) ?? null),
      jobSortOrder: assignmentDetails?.jobSortOrder ?? null,
      jobColor: assignmentDetails?.color ?? null,
      jobBorderColor: assignmentDetails?.borderColor ?? null,
      jobTextColor: assignmentDetails?.textColor ?? null,
      shiftStartTime: assignmentDetails?.shiftStartTime ?? null,
      shiftEndTime: assignmentDetails?.shiftEndTime ?? null,
      defaultDurationHours: assignmentDetails?.defaultDurationHours ?? null,
      defaultDurationMinutes: assignmentDetails?.defaultDurationMinutes ?? null,
      breakMinutes: assignmentDetails?.breakMinutes ?? null,
      focusAreaId,
      startTime:
        customStartTimes[index] ?? assignmentDetails?.defaultStartTime ?? null,
      endTime:
        customEndTimes[index] ?? assignmentDetails?.defaultEndTime ?? null,
      isMentored: input.stateSegments?.[index]?.isMentored ?? false,
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
      focusAreaId: input.focusAreaId,
      startTime: pickPipeTime(input.customStartTime, "first"),
      endTime: pickPipeTime(input.customEndTime, "last"),
      isMentored: input.stateSegments?.[0]?.isMentored ?? false,
      displayFocusAreaName:
        input.focusAreaId != null
          ? (input.focusAreaNameMap.get(input.focusAreaId) ?? null)
          : null,
    },
  ];
}

function normalizeMobileTimeValue(
  value: string | null | undefined,
): string | null {
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
    shiftIds: input.row.state.segments.map(
      (segment) => segment.shiftId ?? null,
    ),
    stateSegments: input.row.state.segments,
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
    fetchMobilePublishHistory(serviceClient, input.orgId, {
      startDate: input.startDate,
      endDate: input.endDate,
    }),
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
        : (pickBoundaryPipeTime(
            state.customStartTime,
            "start",
            jobIds.length,
          ) ??
          getFallbackTime(shiftIds, jobIds, assignmentDetailsByPair, "start"));
    const endTime =
      absenceTypeId != null
        ? null
        : (pickBoundaryPipeTime(state.customEndTime, "end", jobIds.length) ??
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
      stateSegments: state.kind === "worked" ? state.segments : [],
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
      employeeName:
        `${row.employees.first_name} ${row.employees.last_name}`.trim(),
      employeeSeniority: row.employees.seniority ?? null,
      employeeFocusAreaIds: row.employees.focus_area_ids ?? [],
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

function buildOpenShiftVolunteerSegmentKey({
  assignment,
  date,
  focusAreaId,
}: {
  assignment: Pick<AssignmentDefinition, "jobId" | "shiftId">;
  date: string;
  focusAreaId: number;
}): string | null {
  if (assignment.jobId == null) {
    return null;
  }

  return [
    date,
    focusAreaId,
    assignment.shiftId ?? "null",
    assignment.jobId,
  ].join(":");
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
  const coverageRuleConfig = normalizeCoverageRuleConfig(
    contextRows.organizationRow?.coverage_rule_config,
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
    coverageRuleConfig,
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
    employee?: Employee;
    startDate?: string;
    endDate?: string;
    showAll?: boolean;
    timeZone?: string | null;
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
    activeRequestRows,
  ] = await Promise.all([
    fetchAssignmentDetailsMap(serviceClient, input.orgId),
    fetchFocusAreaNameMap(serviceClient, input.orgId),
    fetchMobilePublishHistory(serviceClient, input.orgId, {
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    fetchMobileOpenShiftContext(serviceClient, input.orgId),
    fetchPublishedMobileScheduleRowsData(serviceClient, {
      orgId: input.orgId,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    fetchMobileShiftRequestRowsData(serviceClient, {
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
  const assignmentById = new Map(
    context.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const pendingVolunteerRequestIdsByAssignmentKey = new Map<
    string,
    Set<string>
  >();
  const ownPendingVolunteerAssignmentKeys = new Set<string>();
  for (const row of activeRequestRows) {
    if (
      row.type !== "pickup" ||
      row.status !== "pending_approval" ||
      row.target_emp_id != null ||
      row.parent_request_id != null
    ) {
      continue;
    }

    const state = row.requester_state as {
      focusAreaId?: number | null;
      kind?: string | null;
      segments?: Array<{ shiftId?: number | null; jobId?: number | null }>;
    };

    if (state.kind !== "worked") {
      continue;
    }

    for (const segment of state.segments ?? []) {
      if (segment.jobId == null) {
        continue;
      }

      const assignmentId = assignmentIdByPair.get(
        buildShiftJobPairKey(segment.shiftId ?? null, segment.jobId),
      );
      const assignment =
        assignmentId == null
          ? null
          : (assignmentById.get(assignmentId) ?? null);
      const segmentFocusAreaId =
        state.focusAreaId ?? assignment?.focusAreaId ?? null;
      const key =
        assignment != null && segmentFocusAreaId != null
          ? buildOpenShiftVolunteerSegmentKey({
              assignment,
              date: row.requester_shift_date,
              focusAreaId: segmentFocusAreaId,
            })
          : null;

      if (key != null) {
        const requestIds =
          pendingVolunteerRequestIdsByAssignmentKey.get(key) ??
          new Set<string>();
        requestIds.add(row.id);
        pendingVolunteerRequestIdsByAssignmentKey.set(key, requestIds);

        if (input.employee?.id === row.requester_emp_id) {
          ownPendingVolunteerAssignmentKeys.add(key);
        }
      }
    }
  }
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
  const mentoredCoverageCredit =
    context.coverageRuleConfig.mentoredCoverageCreditPercent / 100;
  const coverageCreditForKey = (
    empId: string,
    date: Date,
    assignmentId: number,
  ) => {
    const row = rowByEmployeeDate.get(`${empId}_${formatMobileIsoDate(date)}`);
    if (!row || row.state.kind !== "worked") {
      return 0;
    }

    let credit = 0;
    for (const segment of row.state.segments) {
      const segmentAssignmentId = assignmentIdByPair.get(
        buildShiftJobPairKey(segment.shiftId ?? null, segment.jobId),
      );
      if (segmentAssignmentId === assignmentId) {
        credit = Math.max(
          credit,
          segment.isMentored ? mentoredCoverageCredit : 1,
        );
      }
    }
    return credit;
  };

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
    undefined,
    coverageCreditForKey,
  );
  const jobNameMap = new Map(context.jobs.map((job) => [job.id, job.name]));

  return gaps.flatMap((gap) => {
    const gapDate = formatMobileIsoDate(gap.date);
    const pendingVolunteerRequestIds = new Set<string>();
    const hasOwnPendingVolunteer = gap.eligibleAssignmentDefinitionIds.some(
      (assignmentId) => {
        const assignment = assignmentById.get(assignmentId);
        const key =
          assignment == null
            ? null
            : buildOpenShiftVolunteerSegmentKey({
                assignment,
                date: gapDate,
                focusAreaId: gap.focusAreaId,
              });
        return key != null && ownPendingVolunteerAssignmentKeys.has(key);
      },
    );

    if (hasOwnPendingVolunteer) {
      return [];
    }

    for (const assignmentId of gap.eligibleAssignmentDefinitionIds) {
      const assignment = assignmentById.get(assignmentId);
      const key =
        assignment == null
          ? null
          : buildOpenShiftVolunteerSegmentKey({
              assignment,
              date: gapDate,
              focusAreaId: gap.focusAreaId,
            });
      const requestIds =
        key == null ? null : pendingVolunteerRequestIdsByAssignmentKey.get(key);
      if (!requestIds) {
        continue;
      }

      for (const requestId of requestIds) {
        pendingVolunteerRequestIds.add(requestId);
      }
    }

    const remainingNeeded =
      gap.status.required - gap.status.actual - pendingVolunteerRequestIds.size;

    if (remainingNeeded <= 0) {
      return [];
    }

    const openAssignments = gap.eligibleAssignmentDefinitionIds
      .map((assignmentId) => assignmentById.get(assignmentId))
      .filter(
        (assignment): assignment is (typeof context.assignments)[number] =>
          Boolean(assignment),
      );
    const getVolunteerState = (
      assignment: AssignmentDefinition,
    ): { canVolunteer: boolean; volunteerBlockReason: string | null } => {
      if (!input.employee) {
        return {
          canVolunteer: false,
          volunteerBlockReason: "You need a linked staff profile to volunteer.",
        };
      }

      if (!input.employee.focusAreaIds.includes(gap.focusAreaId)) {
        return {
          canVolunteer: false,
          volunteerBlockReason:
            "You are not assigned to the focus area required for this shift.",
        };
      }

      if (
        !isEmployeeQualifiedForAssignmentDefinition(input.employee, {
          assignment,
          shiftCategories: context.shiftCategories,
          jobs: context.jobs,
          orgRoles: context.orgRoles,
        })
      ) {
        return {
          canVolunteer: false,
          volunteerBlockReason:
            "You do not meet the eligibility requirements for this shift.",
        };
      }

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
      const assignmentRanges = getAssignmentDefinitionTimeRanges(assignment);

      if (
        employeeTimeRanges.length > 0 &&
        assignmentRanges.length > 0 &&
        timesOverlap(employeeTimeRanges, assignmentRanges)
      ) {
        return {
          canVolunteer: false,
          volunteerBlockReason: "You already have a shift during that time.",
        };
      }

      return { canVolunteer: true, volunteerBlockReason: null };
    };

    const viewableAssignments = openAssignments.filter((assignment) => {
      if (
        hasShiftStartedAtTimeRanges({
          shiftDate: gapDate,
          timeRanges: [
            {
              start:
                assignment.defaultStartTime ??
                context.shiftCategories.find(
                  (item) => item.id === assignment.categoryId,
                )?.startTime ??
                "",
            },
          ],
          now: new Date(),
          timeZone: input.timeZone ?? null,
        })
      ) {
        return false;
      }

      if (input.showAll || !input.employee) {
        return true;
      }

      return getVolunteerState(assignment).canVolunteer;
    });
    const volunteerableAssignments = input.employee
      ? viewableAssignments.filter(
          (assignment) => getVolunteerState(assignment).canVolunteer,
        )
      : [];
    const assignment =
      volunteerableAssignments.find(
        (item) => item.id === gap.preferredOpenAssignmentDefinitionId,
      ) ??
      volunteerableAssignments[0] ??
      viewableAssignments.find(
        (item) => item.id === gap.preferredOpenAssignmentDefinitionId,
      ) ??
      viewableAssignments[0] ??
      null;

    if (!assignment || assignment.jobId == null) {
      return [];
    }

    const shiftIds = [assignment.shiftId ?? null];
    const jobIds = [assignment.jobId];
    const volunteerState = getVolunteerState(assignment);
    const segments = buildMobileShiftRequestSegments({
      customStartTime: null,
      customEndTime: null,
      fallbackShiftName: gap.assignmentLabel,
      focusAreaId: gap.focusAreaId,
      focusAreaNameMap,
      jobIds,
      jobNameMap,
      stateSegments: [{ isMentored: false }],
      assignmentDetailsByPair,
      shiftIds,
    });

    return [
      {
        id: `coverage_gap_${gap.focusAreaId}_${assignment.id}_${gapDate}`,
        date: gapDate,
        focusAreaId: gap.focusAreaId,
        focusAreaName: gap.focusAreaName,
        needed: remainingNeeded,
        state: {
          kind: "worked" as const,
          segments: [
            {
              shiftId: assignment.shiftId ?? null,
              jobId: assignment.jobId,
              position: 0,
              isMentored: false,
            },
          ],
          absenceTypeId: null,
          focusAreaId: gap.focusAreaId,
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
        canVolunteer: volunteerState.canVolunteer,
        volunteerBlockReason: volunteerState.volunteerBlockReason,
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
    const target = Array.isArray(row.target)
      ? (row.target[0] ?? null)
      : row.target;
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
      stateSegments: baseRequest.requesterState.segments,
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
            stateSegments: baseRequest.targetState.segments,
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
  const pendingInvitations = await fetchMobilePendingInvitationRows(
    serviceClient,
    orgId,
    rows.map((row) => row.id),
  );
  const invitationByEmployeeId = new Map(
    pendingInvitations
      .filter((invitation) => invitation.employee_id)
      .map((invitation) => [invitation.employee_id as string, invitation]),
  );
  const managementMemberships =
    await fetchMobileManagementMembershipRowsByUserIds(
      serviceClient,
      orgId,
      rows
        .map((row) => row.user_id)
        .filter((userId): userId is string => Boolean(userId)),
    );
  const managementMembershipByUserId = new Map(
    managementMemberships.map((membership) => [membership.user_id, membership]),
  );

  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    employmentType: row.employment_type ?? "full_time",
    status: (row.status as Employee["status"] | null) ?? "active",
    statusChangedAt: row.status_changed_at ?? null,
    statusNote: row.status_note ?? "",
    certificationId: row.certification_id ?? null,
    roleIds: row.role_ids ?? [],
    seniority: row.seniority ?? 0,
    focusAreaIds: row.focus_area_ids ?? [],
    departmentIds: row.department_ids ?? [],
    deptAdminIds: row.dept_admin_ids ?? [],
    phone: row.phone ?? "",
    email: row.email ?? "",
    contactNotes: row.contact_notes ?? "",
    userId: row.user_id ?? null,
    version: row.version ?? 0,
    managementDepartmentIds:
      (row.user_id
        ? managementMembershipByUserId.get(row.user_id)?.department_ids
        : null) ??
      invitationByEmployeeId.get(row.id)?.department_ids ??
      [],
    managementDeptAdminIds:
      (row.user_id
        ? managementMembershipByUserId.get(row.user_id)?.dept_admin_ids
        : null) ??
      invitationByEmployeeId.get(row.id)?.dept_admin_ids ??
      [],
    pendingInvitation: invitationByEmployeeId.get(row.id)
      ? {
          id: invitationByEmployeeId.get(row.id)!.id,
          email: invitationByEmployeeId.get(row.id)!.email,
          expiresAt: invitationByEmployeeId.get(row.id)!.expires_at,
          updatedAt: invitationByEmployeeId.get(row.id)!.updated_at ?? null,
        }
      : null,
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
