import { HIDDEN_ABSENCE_TYPE, maskCellStateAbsence, type AbsenceNameMask } from "@dubgrid/domain";
import { resolveAbsenceNameMask } from "@/lib/server/absence-visibility";
import {
  rowToCoverageRequirement,
  rowToEmployee,
  rowToFocusArea,
  rowToJobDefinition,
  rowToNamedItem,
  rowToShiftCategory,
  rowToShiftRequest,
} from "@/lib/db/mappers";
import type { MobileScheduleNoteRecord } from "@dubgrid/mobile-api-core";
import { fetchTermsAcceptanceStatus } from "@/features/account/server";
import type {
  MobilePublishedScheduleRow,
  MobileScheduleComparisonRow,
  MobileShiftRequestQueryRow,
} from "@dubgrid/data-access";
import {
  fetchLinkedEmployeeRowForUser,
  fetchMobileAbsenceTypeRows,
  fetchMobileIndicatorTypeRows,
  fetchMobileScheduleNoteRows,
  fetchMobileAssignmentSeedRows,
  fetchMobileCertificationRows as fetchMobileCertificationRowsData,
  fetchMobileDepartmentRows as fetchMobileDepartmentRowsData,
  fetchMobileEffectiveScheduleRows,
  fetchMobileEmployeeRowsByIds,
  fetchMobileFocusAreaRows as fetchMobileFocusAreaRowsData,
  fetchMobileFocusAreaRowsInDepartmentOrder,
  fetchMobileJobNameRows,
  fetchMobileManagementMembershipRowsByUserIds,
  fetchMobileNotificationFacets as fetchMobileNotificationFacetsData,
  fetchMobileNotificationsPage as fetchMobileNotificationsPageData,
  fetchMobileOpenShiftContextRows as fetchMobileOpenShiftContextRowsData,
  fetchMobilePeopleRows as fetchMobilePeopleRowsData,
  fetchMobilePendingInvitationRows,
  fetchMobilePublishHistoryRows,
  fetchMobileRoleRows as fetchMobileRoleRowsData,
  fetchMobileScheduleComparisonRows as fetchMobileScheduleComparisonRowsData,
  fetchMobileShiftRequestHistoryRows as fetchMobileShiftRequestHistoryRowsData,
  fetchMobileShiftRequestRows as fetchMobileShiftRequestRowsData,
  fetchMobileUnreadNotificationCount as fetchMobileUnreadNotificationCountData,
  fetchProfileNameRowsByIds as fetchProfileNameRowsByIdsData,
  fetchHiddenEmployeeIds,
  withoutHiddenRequests,
} from "@dubgrid/data-access";
import type { DbShiftRequest } from "@dubgrid/db-types";
import {
  buildShiftJobPairKey,
  createAssignmentDefinitionIdByPairMap,
} from "@/lib/shift-job-segments";
import type {
  AssignmentDefinition,
  FocusArea,
  JobDefinition,
  Employee,
  NamedItem,
  ShiftCategory,
} from "@/types";
import type { Organization } from "@dubgrid/domain";
import { DEFAULT_OPEN_SHIFT_VISIBILITY } from "@dubgrid/domain";
import {
  buildAssignableShiftDisplayMap,
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
import { isRegularStaffSystemJob, jobIdTakesNewWork } from "@/lib/system-jobs";
import { normalizeMobileScheduleRange, type MobileScheduleQuery } from "@dubgrid/contracts";
import type {
  MobileAbsenceType,
  MobileIndicatorType,
  MobileDepartment,
  MobileFocusArea,
  MobileNamedItem,
  MobileBootstrapRole,
  MobileCoverageWindow,
  MobileOpenShift,
  MobilePerson,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  absenceBlocksWork,
  absenceSideOf,
  assembleDashboardCoverage,
  classifyOpenShiftUrgency,
  formatLocalDateKey,
  hasEffectiveCoverageRequirements,
  hasShiftStartedAtTimeRanges,
  parseLocalDateKey,
  summarizeCoverageDailyForFocusArea,
  type CoverageByFocusAreaEntry,
  type CoverageDailyEntry,
  type CoverageGap,
  type CoverageTotals,
  type SegmentsForEmployeeDate,
  cellStateToChangeDay,
  describeShiftChange,
  selectOriginalCellChange,
  type ShiftChange,
  type ShiftChangeResolvers,
} from "@dubgrid/schedule-core";
import { fetchShiftChangeResolvers } from "@/lib/server/schedule-context";
import { countMobileAdminPermissions } from "./admin-permission-count";
import { normalizeCoverageRuleConfig, timesOverlap, type TimeRange } from "@/lib/schedule-logic";

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
  changes: Array<{
    empId: string;
    date: string;
    kind: "new" | "modified" | "deleted";
    fromState: MobileScheduleComparisonRow["publishedState"];
    toState: MobileScheduleComparisonRow["publishedState"];
  }>;
};

function toMobileOrgRole(value: string | null | undefined): MobilePerson["orgRole"] {
  return value === "super_admin" || value === "admin" || value === "user" ? value : null;
}

type MobilePeopleRow = Pick<
  Employee,
  | "id"
  | "firstName"
  | "lastName"
  | "employmentType"
  | "status"
  | "statusChangedAt"
  | "statusNote"
  | "awayUntil"
  | "awayAbsenceTypeId"
  | "suspendedAt"
  | "suspendedUntil"
  | "plannedStatus"
  | "plannedFrom"
  | "plannedUntil"
  | "plannedAbsenceTypeId"
  | "firstDay"
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
  // employeeNumber is optional on Employee (test fixtures may omit it), but DB
  // rows always have one — narrow back to required here.
  employeeNumber: number;
  managementDepartmentIds: number[];
  managementDeptAdminIds: number[];
  orgRole: MobilePerson["orgRole"];
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

export function resolveMobileDateRange(input?: { startDate?: string; endDate?: string }): {
  startDate: string;
  endDate: string;
} {
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
  const assignmentSeed = await fetchMobileAssignmentSeedRows(serviceClient, orgId);
  const focusAreas = assignmentSeed.focusAreaRows.map(rowToFocusArea);
  const shiftCategories = assignmentSeed.shiftCategoryRows.map(rowToShiftCategory);
  const jobs = assignmentSeed.jobRows.map(rowToJobDefinition);
  const orgRoles = assignmentSeed.organizationRoleRows.map(rowToNamedItem);
  const certifications = assignmentSeed.certificationRows.map(rowToNamedItem);
  const jobSortOrderById = new Map(
    jobs
      .filter((job) => !isRegularStaffSystemJob(job))
      .sort((left, right) =>
        compareJobsByQualificationSeniority(left, right, orgRoles, certifications),
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
      defaultDurationMinutes: shift ? null : (job.defaultDurationMinutes ?? null),
      breakMinutes: shift?.breakMinutes ?? null,
    });
  }

  for (const job of jobs) {
    if (isRegularStaffSystemJob(job)) continue;
    const mode = job.assignmentMode ?? "with_shift";
    if (mode !== "shiftless") {
      for (const shift of getJobPlacementShiftPool(job, shiftCategories, focusAreas)) {
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

// The database only requires an indicator's name and colour to be present, not
// non-empty, and the contract refuses an empty one, so a blank value reads as a
// plain note in neutral grey rather than failing the whole response.
const UNKNOWN_INDICATOR_COLOR = "#A3A3A3";

export async function fetchMobileIndicatorTypes(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileIndicatorType[]> {
  const rows = await fetchMobileIndicatorTypeRows(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name || "Note",
    color: row.color || UNKNOWN_INDICATOR_COLOR,
    sortOrder: row.sort_order,
  }));
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
  const rows = await fetchMobileFocusAreaRowsInDepartmentOrder(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    departmentId: row.department_id,
  }));
}

export async function fetchMobileRoles(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileBootstrapRole[]> {
  const rows = await fetchMobileRoleRowsData(serviceClient, orgId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    abbr: row.abbr,
    requiredCertificationIds: row.required_certification_ids ?? [],
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
  input?: Parameters<typeof fetchMobilePublishHistoryRows>[2],
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
    const profiles = await fetchProfileNameRowsByIdsData(serviceClient, publisherIds);
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
    changes: row.changes,
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

  return assignmentDetailsByPair.get(buildShiftJobPairKey(shiftId ?? null, jobId)) ?? null;
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
        getAssignmentDetailsForPair(assignmentDetailsByPair, shiftIds[index] ?? null, jobId)?.[
          field
        ] ?? "?",
    )
    .join(" / ");
}

/**
 * Each shift once, by id: two jobs on one shift name it once, while two
 * focus areas' shifts that share a name each say where.
 */
function joinShiftNames(
  shiftIds: Array<number | null>,
  jobIds: number[],
  assignmentDetailsByPair: Map<string, MobileAssignmentDetails>,
  focusAreaNameMap: Map<number, string>,
): string {
  const shifts = jobIds.map((jobId, index) => {
    const shiftId = shiftIds[index] ?? null;
    const details = getAssignmentDetailsForPair(assignmentDetailsByPair, shiftId, jobId);
    return {
      key: shiftId != null ? `shift:${shiftId}` : `name:${details?.shiftName ?? "?"}`,
      name: details?.shiftName ?? "?",
      focusAreaId: shiftId != null ? (details?.focusAreaId ?? null) : null,
    };
  });
  const distinct = shifts.filter(
    (shift, index) => shifts.findIndex((other) => other.key === shift.key) === index,
  );
  return distinct
    .map((shift) => {
      const shared = distinct.some((other) => other !== shift && other.name === shift.name);
      const area =
        shared && shift.focusAreaId != null ? focusAreaNameMap.get(shift.focusAreaId) : undefined;
      return area ? `${shift.name} · ${area}` : shift.name;
    })
    .join(" / ");
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

function pickPipeTime(value: string | null | undefined, which: "first" | "last"): string | null {
  const parts = splitPipeParts(value);
  if (parts.length === 0) {
    return null;
  }

  return which === "first" ? (parts[0] ?? null) : (parts[parts.length - 1] ?? null);
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
      ? getAssignmentDetailsForPair(assignmentDetailsByPair, shiftIds[0] ?? null, jobIds[0])
      : getAssignmentDetailsForPair(
          assignmentDetailsByPair,
          shiftIds[jobIds.length - 1] ?? null,
          jobIds[jobIds.length - 1],
        );

  if (!assignmentDetails) {
    return null;
  }

  return part === "start" ? assignmentDetails.defaultStartTime : assignmentDetails.defaultEndTime;
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
    const isGeneralShift = (input.shiftIds[index] ?? null) === null;
    const segmentFocusAreaId = isGeneralShift
      ? null
      : (assignmentDetails?.focusAreaId ?? input.rowFocusAreaId ?? null);

    return {
      shiftId: input.shiftIds[index] ?? null,
      jobId,
      label: assignmentDetails?.label ?? "?",
      shiftName:
        assignmentDetails?.shiftName ?? assignmentDetails?.name ?? assignmentDetails?.label ?? "?",
      jobName:
        assignmentDetails?.isShiftOnly === true ? null : (input.jobNameMap.get(jobId) ?? null),
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
      startTime: customStartTimes[index] ?? assignmentDetails?.defaultStartTime ?? null,
      endTime: customEndTimes[index] ?? assignmentDetails?.defaultEndTime ?? null,
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
    // A shift's own focus area, as schedule entries take it; the request's
    // area stands in only for work without a shift.
    const focusAreaId =
      shiftIds[index] != null
        ? (assignmentDetails?.focusAreaId ?? input.focusAreaId ?? null)
        : (input.focusAreaId ?? null);

    return {
      shiftId: shiftIds[index] ?? null,
      jobId,
      label: assignmentDetails?.label ?? "?",
      shiftName:
        assignmentDetails?.shiftName ?? assignmentDetails?.name ?? assignmentDetails?.label ?? "?",
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
      startTime: customStartTimes[index] ?? assignmentDetails?.defaultStartTime ?? null,
      endTime: customEndTimes[index] ?? assignmentDetails?.defaultEndTime ?? null,
      isMentored: input.stateSegments?.[index]?.isMentored ?? false,
      displayFocusAreaName:
        focusAreaId != null ? (input.focusAreaNameMap.get(focusAreaId) ?? null) : null,
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
      jobName: fallbackJobId != null ? (input.jobNameMap.get(fallbackJobId) ?? null) : null,
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
        input.focusAreaId != null ? (input.focusAreaNameMap.get(input.focusAreaId) ?? null) : null,
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
    stateSegments: input.row.state.segments,
  });

  return getMobileSegmentTimeRanges(segments);
}

function getAssignmentDefinitionTimeRanges(
  assignment: Pick<AssignmentDefinition, "defaultStartTime" | "defaultEndTime">,
): TimeRange[] {
  const range = toMobileTimeRange(assignment.defaultStartTime, assignment.defaultEndTime);

  return range ? [range] : [];
}

function findPublishHistoryEntryForDate(
  history: MobilePublishHistoryEntry[],
  date: string,
): MobilePublishHistoryEntry | null {
  return history.find((entry) => entry.startDate <= date && entry.endDate >= date) ?? null;
}

type PublishedCellChange = {
  entryIndex: number;
  change: MobilePublishHistoryEntry["changes"][number];
};

/** Each cell's changes, newest publish first, so a cell's lookup isn't a scan of every change. */
export function indexPublishedChangesByCell(
  history: MobilePublishHistoryEntry[],
): Map<string, PublishedCellChange[]> {
  const byCell = new Map<string, PublishedCellChange[]>();
  history.forEach((entry, entryIndex) => {
    for (const change of entry.changes) {
      const key = `${change.empId}:${change.date}`;
      const cellChanges = byCell.get(key);
      if (cellChanges) cellChanges.push({ entryIndex, change });
      else byCell.set(key, [{ entryIndex, change }]);
    }
  });
  return byCell;
}

export function findPublishedChangeForCell(
  history: MobilePublishHistoryEntry[],
  changesByCell: Map<string, PublishedCellChange[]>,
  employeeId: string,
  date: string,
):
  | (MobilePublishHistoryEntry["changes"][number] & {
      isNewAddition: boolean;
      publishedAt: string;
    })
  | null {
  const newest = changesByCell.get(`${employeeId}:${date}`)?.[0];
  if (!newest) return null;
  const { entryIndex, change } = newest;
  const isNewAddition =
    change.kind === "new" &&
    history
      .slice(entryIndex + 1)
      .some((olderEntry) => olderEntry.startDate <= date && olderEntry.endDate >= date);
  return { ...change, isNewAddition, publishedAt: history[entryIndex]!.publishedAt };
}

/**
 * A cell's whole day Before and After (item 46d): its earliest in-window
 * "from" against its newest "to", since staff are assumed to have seen
 * nothing in between, as on the web. Null for a first publication and for a
 * cell that ended where it started.
 */
function describeCellPublishChange(
  changesByCell: Map<string, PublishedCellChange[]>,
  employeeId: string,
  date: string,
  resolvers: ShiftChangeResolvers,
): ShiftChange | null {
  const changes = (changesByCell.get(`${employeeId}:${date}`) ?? [])
    .map(({ change }) => change)
    .reverse();
  const original = selectOriginalCellChange(
    changes.map((change) => ({
      fromState: change.fromState ?? null,
      toState: change.toState ?? null,
    })),
  );
  if (!original) return null;
  const change = describeShiftChange(
    cellStateToChangeDay(original.fromState, resolvers),
    cellStateToChangeDay(original.toState, resolvers),
    { date },
  );
  return change.kind === "none" ? null : change;
}

function getMissingDeletedPublishedChanges(
  history: MobilePublishHistoryEntry[],
  rows: MobileScheduleComparisonRow[],
  input: { startDate: string; endDate: string; employeeId?: string },
): Array<MobilePublishHistoryEntry["changes"][number]> {
  const rowKeys = new Set(rows.map((row) => `${row.emp_id}:${row.date}`));
  const latestChangesByCell = new Map<string, MobilePublishHistoryEntry["changes"][number]>();

  for (const entry of history) {
    for (const change of entry.changes) {
      if (
        change.date < input.startDate ||
        change.date > input.endDate ||
        (input.employeeId != null && change.empId !== input.employeeId)
      ) {
        continue;
      }

      const key = `${change.empId}:${change.date}`;
      if (!latestChangesByCell.has(key)) {
        latestChangesByCell.set(key, change);
      }
    }
  }

  return [...latestChangesByCell.entries()]
    .filter(([key, change]) => !rowKeys.has(key) && change.kind === "deleted" && change.fromState)
    .map(([, change]) => change);
}

/** The range's schedule notes for the schedule loaders, which apply the viewer's rule. */
export async function fetchMobileScheduleNotes(
  serviceClient: SupabaseClient,
  input: { orgId: string; startDate: string; endDate: string; employeeId?: string },
): Promise<MobileScheduleNoteRecord[]> {
  const rows = await fetchMobileScheduleNoteRows(serviceClient, input);
  return rows.map((row) => ({
    employeeId: row.emp_id,
    date: row.date,
    indicatorTypeId: row.indicator_type_id,
    focusAreaId: row.focus_area_id,
    shiftId: row.shift_id,
    jobId: row.job_id,
    status: row.status,
    name: row.indicator_types?.name || "Note",
    color: row.indicator_types?.color || UNKNOWN_INDICATOR_COLOR,
  }));
}

/**
 * The schedule as a viewer shown colleagues' absences as Time off sees it:
 * every state rewritten before any label, presentation or change text is
 * built from it, so none of them can name the absence.
 */
function withMobileAbsenceMask(
  mask: AbsenceNameMask | null,
  input: {
    absenceMap: Map<number, MobileAbsenceDetails>;
    publishHistory: MobilePublishHistoryEntry[];
    shiftChangeResolvers: ShiftChangeResolvers;
    rows: MobileScheduleComparisonRow[];
  },
) {
  if (!mask) return input;
  input.absenceMap.set(HIDDEN_ABSENCE_TYPE.id, {
    label: HIDDEN_ABSENCE_TYPE.label,
    name: HIDDEN_ABSENCE_TYPE.name,
    color: HIDDEN_ABSENCE_TYPE.color,
    borderColor: HIDDEN_ABSENCE_TYPE.borderColor,
    textColor: HIDDEN_ABSENCE_TYPE.textColor,
  });
  return {
    absenceMap: input.absenceMap,
    publishHistory: input.publishHistory.map((entry) => ({
      ...entry,
      changes: entry.changes.map((change) => ({
        ...change,
        fromState: maskCellStateAbsence(mask, change.empId, change.fromState),
        toState: maskCellStateAbsence(mask, change.empId, change.toState),
      })),
    })),
    shiftChangeResolvers: {
      ...input.shiftChangeResolvers,
      absenceType: (absenceTypeId: number) =>
        absenceTypeId === HIDDEN_ABSENCE_TYPE.id
          ? { name: HIDDEN_ABSENCE_TYPE.name, archived: false }
          : input.shiftChangeResolvers.absenceType(absenceTypeId),
    },
    rows: input.rows.map((row) => ({
      ...row,
      draftState: maskCellStateAbsence(mask, row.emp_id, row.draftState),
      publishedState: maskCellStateAbsence(mask, row.emp_id, row.publishedState),
    })),
  };
}

export async function fetchMobileScheduleEntries(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
    /** People whose shifts the viewer must not be shown. */
    hiddenUserIds?: readonly string[];
    /** Who is looking, when the organization may hide absence names from them. */
    absenceViewer?: { userId: string; showAbsenceNames: boolean };
  },
): Promise<MobileScheduleEntry[]> {
  const [
    assignmentDetailsByPair,
    absenceMap,
    focusAreaNameMap,
    jobNameMap,
    unmaskedPublishHistory,
    unmaskedShiftChangeResolvers,
    unmaskedData,
    absenceMask,
  ] = await Promise.all([
    fetchAssignmentDetailsMap(serviceClient, input.orgId),
    fetchAbsenceLabelMap(serviceClient, input.orgId),
    fetchFocusAreaNameMap(serviceClient, input.orgId),
    fetchJobNameMap(serviceClient, input.orgId),
    fetchMobilePublishHistory(serviceClient, input.orgId, {
      startDate: input.startDate,
      endDate: input.endDate,
      changesInRange: { employeeId: input.employeeId },
    }),
    fetchShiftChangeResolvers(serviceClient, input.orgId),
    fetchMobileScheduleComparisonRowsData(serviceClient, input),
    input.absenceViewer
      ? resolveAbsenceNameMask(serviceClient, input.orgId, input.absenceViewer)
      : Promise.resolve(null),
  ]);
  const {
    publishHistory,
    shiftChangeResolvers,
    rows: data,
  } = withMobileAbsenceMask(absenceMask, {
    absenceMap,
    publishHistory: unmaskedPublishHistory,
    shiftChangeResolvers: unmaskedShiftChangeResolvers,
    rows: unmaskedData,
  });
  const missingDeletedChanges = getMissingDeletedPublishedChanges(publishHistory, data, input);
  const missingDeletedEmployees = await fetchMobileEmployeeRowsByIds(
    serviceClient,
    input.orgId,
    missingDeletedChanges.map((change) => change.empId),
  );
  const hidden = new Set(input.hiddenUserIds ?? []);
  const missingDeletedEmployeesById = new Map(
    missingDeletedEmployees
      .filter((employee) => !employee.user_id || !hidden.has(employee.user_id))
      .map((employee) => [employee.id, employee]),
  );
  const missingDeletedRows = missingDeletedChanges.map((change) => {
    const employee = missingDeletedEmployeesById.get(change.empId);
    if (!employee || !change.fromState) {
      return null;
    }

    return {
      emp_id: employee.id,
      date: change.date,
      focus_area_id: null,
      draftState: null,
      draftDeleted: true,
      publishedState: change.fromState,
      employees: {
        id: employee.id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        org_id: employee.org_id,
        seniority: employee.seniority ?? null,
        focus_area_ids: employee.focus_area_ids ?? [],
      },
    } satisfies MobileScheduleComparisonRow;
  });
  const comparisonRows = [...data, ...missingDeletedRows.filter((row) => row != null)];
  const changesByCell = indexPublishedChangesByCell(publishHistory);

  const entries: MobileScheduleEntry[] = [];

  for (const row of comparisonRows) {
    const publishedChange = findPublishedChangeForCell(
      publishHistory,
      changesByCell,
      row.emp_id,
      row.date,
    );
    const state =
      row.publishedState ??
      (publishedChange?.kind === "deleted" ? publishedChange.fromState : null);
    if (!state) {
      continue;
    }

    const buildPresentation = (candidateState: typeof state) => {
      const hasRegularShift =
        candidateState.kind === "worked" &&
        candidateState.segments.some((segment) => segment.shiftId != null);
      const shiftIds =
        candidateState.kind === "worked"
          ? candidateState.segments.map((segment) => segment.shiftId ?? null)
          : [];
      const jobIds =
        candidateState.kind === "worked"
          ? candidateState.segments.map((segment) => segment.jobId)
          : [];
      const absenceTypeId = candidateState.kind === "absence" ? candidateState.absenceTypeId : null;
      const absence = absenceTypeId != null ? (absenceMap.get(absenceTypeId) ?? null) : null;
      const restOfDayAbsenceTypeId =
        candidateState.kind === "worked" ? (candidateState.absenceTypeId ?? null) : null;
      const restOfDay =
        restOfDayAbsenceTypeId != null ? (absenceMap.get(restOfDayAbsenceTypeId) ?? null) : null;
      // The time it covers and its side (item 50), for the app to place it.
      const restOfDaySpan =
        candidateState.kind === "worked" &&
        candidateState.absenceStartTime &&
        candidateState.absenceEndTime
          ? {
              start: candidateState.absenceStartTime.slice(0, 5),
              end: candidateState.absenceEndTime.slice(0, 5),
            }
          : null;
      const primaryAssignmentDetails =
        jobIds.length > 0
          ? getAssignmentDetailsForPair(assignmentDetailsByPair, shiftIds[0] ?? null, jobIds[0])
          : null;
      const primaryRegularSegmentIndex =
        candidateState.kind === "worked"
          ? candidateState.segments.findIndex((segment) => segment.shiftId != null)
          : -1;
      const primaryRegularAssignmentDetails =
        primaryRegularSegmentIndex >= 0
          ? getAssignmentDetailsForPair(
              assignmentDetailsByPair,
              shiftIds[primaryRegularSegmentIndex] ?? null,
              jobIds[primaryRegularSegmentIndex],
            )
          : null;
      const assignmentLabel =
        absenceTypeId != null
          ? (absence?.label ?? "?")
          : joinAssignmentText(shiftIds, jobIds, assignmentDetailsByPair, "label");
      const shiftName =
        absenceTypeId != null
          ? (absence?.name ?? absence?.label ?? "Off")
          : joinShiftNames(shiftIds, jobIds, assignmentDetailsByPair, focusAreaNameMap);
      const startTime =
        absenceTypeId != null
          ? null
          : (pickBoundaryPipeTime(candidateState.customStartTime, "start", jobIds.length) ??
            getFallbackTime(shiftIds, jobIds, assignmentDetailsByPair, "start"));
      const endTime =
        absenceTypeId != null
          ? null
          : (pickBoundaryPipeTime(candidateState.customEndTime, "end", jobIds.length) ??
            getFallbackTime(shiftIds, jobIds, assignmentDetailsByPair, "end"));
      const rowFocusAreaId = (row.focus_area_id as number | null) ?? null;
      const explicitFocusAreaId = hasRegularShift
        ? (primaryRegularAssignmentDetails?.focusAreaId ?? rowFocusAreaId ?? null)
        : null;
      const focusAreaId = explicitFocusAreaId;
      const focusAreaName =
        focusAreaId != null ? (focusAreaNameMap.get(focusAreaId) ?? null) : null;
      const displayFocusAreaName =
        absenceTypeId != null || explicitFocusAreaId == null
          ? null
          : (focusAreaNameMap.get(explicitFocusAreaId) ?? null);
      const segments = buildMobileScheduleEntrySegments({
        absenceTypeId,
        customStartTime: candidateState.customStartTime,
        customEndTime: candidateState.customEndTime,
        focusAreaNameMap,
        jobNameMap,
        rowFocusAreaId,
        shiftIds,
        jobIds,
        stateSegments: candidateState.kind === "worked" ? candidateState.segments : [],
        assignmentDetailsByPair,
        shiftName,
        startTime,
        endTime,
      });

      return {
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
        shiftTextColor: absence?.textColor ?? primaryAssignmentDetails?.textColor ?? null,
        segments,
        restOfDayAbsence:
          restOfDayAbsenceTypeId != null && restOfDay
            ? {
                absenceTypeId: restOfDayAbsenceTypeId,
                label: restOfDay.label,
                name: restOfDay.name ?? restOfDay.label,
                color: restOfDay.color ?? null,
                borderColor: restOfDay.borderColor ?? restOfDay.color ?? null,
                textColor: restOfDay.textColor ?? null,
                startTime: restOfDaySpan?.start ?? null,
                endTime: restOfDaySpan?.end ?? null,
                arrivedLate:
                  !!restOfDaySpan &&
                  !!startTime &&
                  !!endTime &&
                  absenceSideOf(restOfDaySpan, {
                    start: startTime.slice(0, 5),
                    end: endTime.slice(0, 5),
                  }) === "arrived-late",
              }
            : null,
      };
    };

    const shiftIds =
      state.kind === "worked" ? state.segments.map((segment) => segment.shiftId ?? null) : [];
    const jobIds = state.kind === "worked" ? state.segments.map((segment) => segment.jobId) : [];
    const absenceTypeId = state.kind === "absence" ? state.absenceTypeId : null;
    if (shiftIds.length === 0 && jobIds.length === 0 && absenceTypeId == null) {
      continue;
    }

    const publishEntry = findPublishHistoryEntryForDate(publishHistory, row.date as string);
    const presentation = buildPresentation(state);
    const previousPresentation = publishedChange?.fromState
      ? buildPresentation(publishedChange.fromState)
      : null;

    entries.push({
      employeeId: row.employees.id,
      employeeName: `${row.employees.first_name} ${row.employees.last_name}`.trim(),
      employeeSeniority: row.employees.seniority ?? null,
      employeeFocusAreaIds: row.employees.focus_area_ids ?? [],
      date: row.date as string,
      state,
      presentation,
      change: publishedChange
        ? {
            kind: publishedChange.kind,
            isNewAddition: publishedChange.isNewAddition,
            previousPresentation,
            shiftChange:
              publishedChange.kind === "new" && !publishedChange.isNewAddition
                ? null
                : describeCellPublishChange(
                    changesByCell,
                    row.employees.id,
                    row.date as string,
                    shiftChangeResolvers,
                  ),
          }
        : null,
      publishedAt: publishEntry?.publishedAt ?? null,
      publishedByName: publishEntry?.publishedByName ?? null,
      // Attached per viewer by the schedule loaders; other callers need none.
      indicators: [],
    });
  }

  return entries;
}

// Delegates to @dubgrid/schedule-core's canonical local-date-key pair —
// do not reintroduce a local parse/format pair here. A prior local copy of
// this pair parsed as local midnight but formatted back via `.toISOString()`
// (UTC), which silently shifted every date key back one day on any server
// ahead of UTC — the exact bug that caused mobile's coverage totals to drop
// the first day of a published week (see parseLocalDateKey's doc comment).
const parseMobileIsoDate = parseLocalDateKey;
const formatMobileIsoDate = formatLocalDateKey;

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

  return [date, focusAreaId, assignment.shiftId ?? "null", assignment.jobId].join(":");
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
    return publishHistory.some((entry) => entry.startDate <= dateKey && entry.endDate >= dateKey);
  });
}

export async function fetchMobileOpenShiftContext(
  serviceClient: SupabaseClient,
  orgId: string,
  hiddenUserIds: readonly string[] = [],
) {
  const contextRows = await fetchMobileOpenShiftContextRowsData(
    serviceClient,
    orgId,
    hiddenUserIds,
  );
  const focusAreas = contextRows.focusAreaRows.map(rowToFocusArea);
  const shiftCategories = contextRows.shiftCategoryRows.map(rowToShiftCategory);
  const allJobs = contextRows.jobRows.map(rowToJobDefinition);
  // Open shifts and coverage plan new work, which an archived job takes none of.
  const jobs = allJobs.filter((job) => !job.archivedAt);
  const orgRoles = contextRows.organizationRoleRows.map(rowToNamedItem);
  const coverageRequirements = contextRows.coverageRequirementRows.map(rowToCoverageRequirement);
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
  // Coverage-gap labels (open-shift lists, not the mobile grid) are always
  // spelled out in full, regardless of the org's shiftDisplayMode setting.
  const assignmentNameMap = buildAssignableShiftDisplayMap({
    assignments,
    shiftCategories,
    jobs,
    focusAreas,
    shiftDisplayMode: "name",
  });
  // Hours count every shift worked, so a cell that holds an archived job
  // still resolves to the assignment carrying its default hours.
  const hoursAssignments = buildScheduleAssignmentOptions({
    orgId,
    focusAreas,
    shiftCategories,
    jobs: allJobs,
    includeArchived: true,
  });
  // For resolving a schedule segment's (shiftId, jobId) pair to the
  // assignment definition that carries its default hours/duration —
  // packages/mobile-api-core's staff-hours computation needs this the same
  // way the coverage engine already does.
  const assignmentIdByPair = createAssignmentDefinitionIdByPairMap(hoursAssignments);

  return {
    assignments,
    hoursAssignments,
    assignmentIdByPair,
    assignmentNameMap,
    coverageRequirements,
    coverageRuleConfig,
    employees,
    focusAreas,
    jobs,
    orgRoles,
    shiftCategories,
    defaultShiftEnabled: contextRows.organizationRow?.default_shift_enabled ?? true,
  };
}

type MobileOpenShiftInput = {
  orgId: string;
  employee?: Employee;
  startDate?: string;
  endDate?: string;
  showAll?: boolean;
  timeZone?: string | null;
  /** People whose shifts the viewer must not be shown; coverage counts only the rest. */
  hiddenUserIds?: readonly string[];
};

/**
 * Fetches + assembles every input `assembleDashboardCoverage` needs for a
 * given org/date range. Shared by fetchMobileOpenShifts and
 * fetchMobileCoverageSummary so the dashboard's coverage totals and the
 * open-shifts list are always computed from the exact same one DB round-trip
 * — not two independently-fetched (and potentially inconsistent) snapshots.
 */
async function buildMobileCoverageEngineInputs(
  serviceClient: SupabaseClient,
  input: MobileOpenShiftInput,
) {
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
    // Only which dates were published is read here, never the changes.
    fetchMobilePublishHistory(serviceClient, input.orgId, {
      startDate: range.startDate,
      endDate: range.endDate,
      changesInRange: {},
    }),
    fetchMobileOpenShiftContext(serviceClient, input.orgId, input.hiddenUserIds),
    // Draft-preferred ("effective") rows, not published-only — matches web's
    // scheduler view (apps/web/src/lib/schedule-cells.ts's
    // `isScheduler ? (draft ?? published) : published`), so an admin's
    // pending unpublished edits count toward coverage here too, the same way
    // they already do on web's dashboard. Using the same fetcher mobile's
    // staff-hours calc already relies on for this exact reason.
    fetchMobileEffectiveScheduleRows(serviceClient, {
      orgId: input.orgId,
      startDate: range.startDate,
      endDate: range.endDate,
      hiddenUserIds: input.hiddenUserIds,
    }),
    fetchMobileShiftRequestRowsData(serviceClient, {
      orgId: input.orgId,
      startDate: range.startDate,
      endDate: range.endDate,
    }).then((rows) =>
      withoutHiddenRequestRows(serviceClient, input.orgId, rows, input.hiddenUserIds),
    ),
  ]);

  const rangeDates = getMobileDatesBetween(range.startDate, range.endDate);
  const dates = getPublishedMobileDates(rangeDates, publishHistory);
  const publishedWindow: MobileCoverageWindow =
    rangeDates.length > 0 && dates.length === 0
      ? "unpublished"
      : dates.length < rangeDates.length
        ? "partial"
        : "published";

  const assignmentIdByPair = new Map(
    context.assignments.flatMap((assignment) =>
      assignment.jobId == null
        ? []
        : [[buildShiftJobPairKey(assignment.shiftId ?? null, assignment.jobId), assignment.id]],
    ),
  );
  const assignmentById = new Map(
    context.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const pendingVolunteerRequestIdsByAssignmentKey = new Map<string, Set<string>>();
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
      const assignment = assignmentId == null ? null : (assignmentById.get(assignmentId) ?? null);
      const segmentFocusAreaId = state.focusAreaId ?? assignment?.focusAreaId ?? null;
      const key =
        assignment != null && segmentFocusAreaId != null
          ? buildOpenShiftVolunteerSegmentKey({
              assignment,
              date: row.requester_shift_date,
              focusAreaId: segmentFocusAreaId,
            })
          : null;

      if (key != null) {
        const requestIds = pendingVolunteerRequestIdsByAssignmentKey.get(key) ?? new Set<string>();
        requestIds.add(row.id);
        pendingVolunteerRequestIdsByAssignmentKey.set(key, requestIds);

        if (input.employee?.id === row.requester_emp_id) {
          ownPendingVolunteerAssignmentKeys.add(key);
        }
      }
    }
  }
  const rowByEmployeeDate = new Map(scheduleRows.map((row) => [`${row.emp_id}_${row.date}`, row]));
  // The one platform-specific adapter: reads an employee's resolved shift
  // segments for a date out of mobile's row shape. Everything downstream
  // (credit resolution, gap/total math) is the shared @dubgrid/schedule-core
  // engine — see assembleDashboardCoverage in coverage-assembly.ts.
  const segmentsForKey: SegmentsForEmployeeDate = (empId, date) => {
    const row = rowByEmployeeDate.get(`${empId}_${formatMobileIsoDate(date)}`);
    if (!row || row.state.kind !== "worked") {
      return [];
    }

    return row.state.segments.flatMap((segment) => {
      const assignmentId = assignmentIdByPair.get(
        buildShiftJobPairKey(segment.shiftId ?? null, segment.jobId),
      );
      return assignmentId == null
        ? []
        : [{ assignmentId, isMentored: Boolean(segment.isMentored) }];
    });
  };
  const jobNameMap = new Map(context.jobs.map((job) => [job.id, job.name]));

  return {
    dates,
    publishedWindow,
    context,
    scheduleRows,
    assignmentDetailsByPair,
    focusAreaNameMap,
    jobNameMap,
    assignmentById,
    segmentsForKey,
    pendingVolunteerRequestIdsByAssignmentKey,
    ownPendingVolunteerAssignmentKeys,
    rowByEmployeeDate,
  };
}

type MobileCoverageEngineInputs = Awaited<ReturnType<typeof buildMobileCoverageEngineInputs>>;

/** Transforms coverage gaps into the volunteer-eligibility-annotated MobileOpenShift feed shape. */
function buildMobileOpenShiftsFromGaps(
  gaps: CoverageGap[],
  inputs: MobileCoverageEngineInputs,
  input: MobileOpenShiftInput,
): MobileOpenShift[] {
  const {
    context,
    assignmentDetailsByPair,
    focusAreaNameMap,
    jobNameMap,
    assignmentById,
    pendingVolunteerRequestIdsByAssignmentKey,
    ownPendingVolunteerAssignmentKeys,
    rowByEmployeeDate,
  } = inputs;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // A gap only shifts without a job could fill isn't offered while they're off.
  const takesNewWork = jobIdTakesNewWork(context.jobs, context.defaultShiftEnabled);

  return gaps.flatMap((gap) => {
    const fillableAssignmentIds = gap.eligibleAssignmentDefinitionIds.filter((assignmentId) =>
      takesNewWork(assignmentById.get(assignmentId)?.jobId),
    );
    if (fillableAssignmentIds.length === 0) {
      return [];
    }
    const gapDate = formatMobileIsoDate(gap.date);
    const pendingVolunteerRequestIds = new Set<string>();
    const hasOwnPendingVolunteer = gap.eligibleAssignmentDefinitionIds.some((assignmentId) => {
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
    });

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
      const requestIds = key == null ? null : pendingVolunteerRequestIdsByAssignmentKey.get(key);
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

    const openAssignments = fillableAssignmentIds
      .map((assignmentId) => assignmentById.get(assignmentId))
      .filter((assignment): assignment is (typeof context.assignments)[number] =>
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
            "You are not assigned to the schedule area required for this shift.",
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
          volunteerBlockReason: "You do not meet the eligibility requirements for this shift.",
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

      // An absence beside their shifts: after leaving early they take no more
      // work that day; after arriving late, only work it overlaps is out (item 50).
      if (
        employeeScheduleRow?.state.kind === "worked" &&
        employeeScheduleRow.state.absenceTypeId != null
      ) {
        const { absenceStartTime: start, absenceEndTime: end } = employeeScheduleRow.state;
        const blocked = absenceBlocksWork(
          start && end ? { start: start.slice(0, 5), end: end.slice(0, 5) } : null,
          employeeTimeRanges.length > 0
            ? {
                start: employeeTimeRanges[0].start.slice(0, 5),
                end: employeeTimeRanges[employeeTimeRanges.length - 1].end.slice(0, 5),
              }
            : null,
          assignmentRanges,
        );
        if (blocked) {
          return {
            canVolunteer: false,
            volunteerBlockReason:
              blocked === "overlap"
                ? "You are absent during that time."
                : "You are absent for the rest of this day.",
          };
        }
      }

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
                context.shiftCategories.find((item) => item.id === assignment.categoryId)
                  ?.startTime ??
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
      ? viewableAssignments.filter((assignment) => getVolunteerState(assignment).canVolunteer)
      : [];
    const assignment =
      volunteerableAssignments.find(
        (item) => item.id === gap.preferredOpenAssignmentDefinitionId,
      ) ??
      volunteerableAssignments[0] ??
      viewableAssignments.find((item) => item.id === gap.preferredOpenAssignmentDefinitionId) ??
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
      fallbackShiftName: gap.assignmentFullName,
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
        urgency: classifyOpenShiftUrgency(gap.date, today),
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
              .join(" / ") || gap.assignmentFullName,
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

export async function fetchMobileOpenShifts(
  serviceClient: SupabaseClient,
  input: MobileOpenShiftInput,
): Promise<MobileOpenShift[]> {
  const inputs = await buildMobileCoverageEngineInputs(serviceClient, input);
  if (inputs.dates.length === 0) {
    return [];
  }

  const { gaps } = assembleDashboardCoverage({
    focusAreas: inputs.context.focusAreas,
    shiftCategories: inputs.context.shiftCategories,
    assignments: inputs.context.assignments,
    requirements: inputs.context.coverageRequirements,
    employees: inputs.context.employees,
    dates: inputs.dates,
    segmentsForKey: inputs.segmentsForKey,
    coverageRuleConfig: inputs.context.coverageRuleConfig,
    assignmentNameMap: inputs.context.assignmentNameMap,
  });

  return buildMobileOpenShiftsFromGaps(gaps, inputs, input);
}

export interface MobileCoverageSummary {
  openShifts: MobileOpenShift[];
  totals: CoverageTotals;
  byFocusArea: CoverageByFocusAreaEntry[];
  dailyByFocusArea: Map<number, CoverageDailyEntry[]>;
  hasCoverageRequirements: boolean;
  publishedWindow: MobileCoverageWindow;
  scheduleRows: MobilePublishedScheduleRow[];
}

/**
 * The admin dashboard's single source of truth for coverage %, open-gap
 * count, and per-focus-area filled/required numbers. Built from the exact
 * same coverage-engine inputs (one DB round-trip) as fetchMobileOpenShifts,
 * so the dashboard's totals and its open-shifts list can never disagree with
 * each other — and because both platforms' totals now flow through the same
 * @dubgrid/schedule-core assembleDashboardCoverage input-assembly layer, not
 * just the same math, they can't silently diverge from web's numbers either.
 */
export async function fetchMobileCoverageSummary(
  serviceClient: SupabaseClient,
  input: MobileOpenShiftInput,
): Promise<MobileCoverageSummary> {
  const inputs = await buildMobileCoverageEngineInputs(serviceClient, input);
  const hasCoverageRequirements = hasEffectiveCoverageRequirements(
    inputs.context.coverageRequirements,
    inputs.context.assignments,
  );

  if (inputs.dates.length === 0) {
    return {
      openShifts: [],
      totals: { totalRequired: 0, totalFilled: 0, pct: 100, openSlots: 0 },
      byFocusArea: [],
      dailyByFocusArea: new Map(),
      hasCoverageRequirements,
      publishedWindow: inputs.publishedWindow,
      scheduleRows: inputs.scheduleRows,
    };
  }

  const { gaps, totals, byFocusArea, snapshots } = assembleDashboardCoverage({
    focusAreas: inputs.context.focusAreas,
    shiftCategories: inputs.context.shiftCategories,
    assignments: inputs.context.assignments,
    requirements: inputs.context.coverageRequirements,
    employees: inputs.context.employees,
    dates: inputs.dates,
    segmentsForKey: inputs.segmentsForKey,
    coverageRuleConfig: inputs.context.coverageRuleConfig,
    assignmentNameMap: inputs.context.assignmentNameMap,
  });

  return {
    openShifts: buildMobileOpenShiftsFromGaps(gaps, inputs, input),
    totals,
    byFocusArea,
    dailyByFocusArea: new Map(
      byFocusArea.map((entry) => [
        entry.focusAreaId,
        summarizeCoverageDailyForFocusArea(snapshots, entry.focusAreaId, inputs.dates),
      ]),
    ),
    hasCoverageRequirements,
    publishedWindow: inputs.publishedWindow,
    scheduleRows: inputs.scheduleRows,
  };
}

function mapMobileShiftRequestRows(
  rows: MobileShiftRequestQueryRow[],
  input: {
    assignmentDetailsByPair: Map<string, MobileAssignmentDetails>;
    focusAreaNameMap: Map<number, string>;
    jobNameMap: Map<number, string>;
  },
): MobileShiftRequest[] {
  const { assignmentDetailsByPair, focusAreaNameMap, jobNameMap } = input;
  return rows.map((row) => {
    const requester = Array.isArray(row.requester) ? (row.requester[0] ?? null) : row.requester;
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

    const baseRequest = rowToShiftRequest(mapped, new Map(), undefined, undefined);
    const requesterSegments = buildMobileShiftRequestSegments({
      customStartTime: baseRequest.requesterState.customStartTime ?? null,
      customEndTime: baseRequest.requesterState.customEndTime ?? null,
      fallbackShiftName: baseRequest.requesterShiftLabel,
      focusAreaId: baseRequest.requesterFocusAreaId ?? null,
      focusAreaNameMap,
      jobIds: baseRequest.requesterState.segments.map((segment) => segment.jobId),
      jobNameMap,
      assignmentDetailsByPair,
      shiftIds: baseRequest.requesterState.segments.map((segment) => segment.shiftId),
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
            jobIds: baseRequest.targetState.segments.map((segment) => segment.jobId),
            jobNameMap,
            assignmentDetailsByPair,
            shiftIds: baseRequest.targetState.segments.map((segment) => segment.shiftId),
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
        displayFocusAreaName: requesterSegments[0]?.displayFocusAreaName ?? null,
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
                  ? (focusAreaNameMap.get(baseRequest.targetFocusAreaId) ?? null)
                  : null,
              displayFocusAreaName: targetSegments?.[0]?.displayFocusAreaName ?? null,
              startTime: baseRequest.targetState.customStartTime,
              endTime: baseRequest.targetState.customEndTime,
              segments: targetSegments ?? [],
            }
          : null,
    };
  });
}

async function loadMobileShiftRequestMappingContext(serviceClient: SupabaseClient, orgId: string) {
  const [assignmentDetailsByPair, focusAreaNameMap, jobNameMap] = await Promise.all([
    fetchAssignmentDetailsMap(serviceClient, orgId),
    fetchFocusAreaNameMap(serviceClient, orgId),
    fetchJobNameMap(serviceClient, orgId),
  ]);

  return { assignmentDetailsByPair, focusAreaNameMap, jobNameMap };
}

/** Drops requests made by, or aimed at, a person the viewer must not see. */
/** Request rows with each person's absence as this viewer may see it. */
async function withMaskedRequestAbsences(
  serviceClient: SupabaseClient,
  orgId: string,
  rows: MobileShiftRequestQueryRow[],
  absenceViewer: { userId: string; showAbsenceNames: boolean } | undefined,
): Promise<MobileShiftRequestQueryRow[]> {
  const mask = absenceViewer
    ? await resolveAbsenceNameMask(serviceClient, orgId, absenceViewer)
    : null;
  if (!mask) return rows;
  return rows.map((row) => ({
    ...row,
    requester_state: maskCellStateAbsence(mask, row.requester_emp_id, row.requester_state),
    target_state: maskCellStateAbsence(mask, row.target_emp_id, row.target_state) ?? null,
    // A call-off's absence is the requester's.
    absence_type_id: mask.absenceTypeId(row.requester_emp_id, row.absence_type_id ?? null),
  }));
}

async function withoutHiddenRequestRows(
  serviceClient: SupabaseClient,
  orgId: string,
  rows: MobileShiftRequestQueryRow[],
  hiddenUserIds: readonly string[] = [],
): Promise<MobileShiftRequestQueryRow[]> {
  if (hiddenUserIds.length === 0) return rows;
  const hiddenStaffIds = new Set(await fetchHiddenEmployeeIds(serviceClient, orgId, hiddenUserIds));
  return withoutHiddenRequests(rows, hiddenStaffIds);
}

export async function fetchMobileShiftRequests(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId?: string;
    includeOpenPickupRequests?: boolean;
    startDate?: string;
    endDate?: string;
    /** People whose requests the viewer must not be shown. */
    hiddenUserIds?: readonly string[];
    /** Who is looking, when the organization may hide absence names from them. */
    absenceViewer?: { userId: string; showAbsenceNames: boolean };
  },
): Promise<MobileShiftRequest[]> {
  const [mappingContext, rows] = await Promise.all([
    loadMobileShiftRequestMappingContext(serviceClient, input.orgId),
    fetchMobileShiftRequestRowsData(serviceClient, input)
      .then((found) =>
        withoutHiddenRequestRows(serviceClient, input.orgId, found, input.hiddenUserIds),
      )
      .then((found) =>
        withMaskedRequestAbsences(serviceClient, input.orgId, found, input.absenceViewer),
      ),
  ]);

  return mapMobileShiftRequestRows(rows, mappingContext);
}

export async function fetchMobileShiftRequestHistory(
  serviceClient: SupabaseClient,
  input: Parameters<typeof fetchMobileShiftRequestHistoryRowsData>[1] & {
    hiddenUserIds?: readonly string[];
    absenceViewer?: { userId: string; showAbsenceNames: boolean };
  },
) {
  const [mappingContext, page] = await Promise.all([
    loadMobileShiftRequestMappingContext(serviceClient, input.orgId),
    fetchMobileShiftRequestHistoryRowsData(serviceClient, input),
  ]);
  // The cursor still comes from the full page, so a hidden row never skips the next one.
  const rows = await withMaskedRequestAbsences(
    serviceClient,
    input.orgId,
    await withoutHiddenRequestRows(serviceClient, input.orgId, page.rows, input.hiddenUserIds),
    input.absenceViewer,
  );

  return {
    requests: mapMobileShiftRequestRows(rows, mappingContext),
    nextCursor: page.nextCursor,
  };
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
  const managementMemberships = await fetchMobileManagementMembershipRowsByUserIds(
    serviceClient,
    orgId,
    rows.map((row) => row.user_id).filter((userId): userId is string => Boolean(userId)),
  );
  const managementMembershipByUserId = new Map(
    managementMemberships.map((membership) => [membership.user_id, membership]),
  );

  return rows.map((row) => ({
    id: row.id,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    employmentType: row.employment_type ?? "full_time",
    status: (row.status as Employee["status"] | null) ?? "active",
    statusChangedAt: row.status_changed_at ?? null,
    statusNote: row.status_note ?? "",
    awayUntil: row.away_until ?? null,
    awayAbsenceTypeId: row.away_absence_type_id ?? null,
    suspendedAt: row.suspended_at ?? null,
    suspendedUntil: row.suspended_until ?? null,
    plannedStatus: row.planned_status ?? null,
    plannedFrom: row.planned_from ?? null,
    plannedUntil: row.planned_until ?? null,
    plannedAbsenceTypeId: row.planned_absence_type_id ?? null,
    firstDay: row.first_day ?? null,
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
      (row.user_id ? managementMembershipByUserId.get(row.user_id)?.department_ids : null) ??
      invitationByEmployeeId.get(row.id)?.department_ids ??
      [],
    managementDeptAdminIds:
      (row.user_id ? managementMembershipByUserId.get(row.user_id)?.dept_admin_ids : null) ??
      invitationByEmployeeId.get(row.id)?.dept_admin_ids ??
      [],
    orgRole: toMobileOrgRole(
      row.user_id ? managementMembershipByUserId.get(row.user_id)?.org_role : null,
    ),
    membershipUpdatedAt:
      (row.user_id ? managementMembershipByUserId.get(row.user_id)?.updated_at : null) ?? null,
    adminPermissions: (() => {
      const membership = row.user_id ? managementMembershipByUserId.get(row.user_id) : null;
      return membership?.org_role === "admin" ? (membership.admin_permissions ?? null) : null;
    })(),
    adminPermissionCount: countMobileAdminPermissions(
      row.user_id ? managementMembershipByUserId.get(row.user_id) : null,
    ),
    pendingInvitation: invitationByEmployeeId.get(row.id)
      ? {
          id: invitationByEmployeeId.get(row.id)!.id,
          email: invitationByEmployeeId.get(row.id)!.email,
          expiresAt: invitationByEmployeeId.get(row.id)!.expires_at,
          updatedAt: invitationByEmployeeId.get(row.id)!.updated_at ?? null,
          roleToAssign: toMobileOrgRole(invitationByEmployeeId.get(row.id)!.role_to_assign),
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
  input: Parameters<typeof fetchMobileNotificationsPageData>[1],
): ReturnType<typeof fetchMobileNotificationsPageData> {
  return fetchMobileNotificationsPageData(userClient, input);
}

export async function fetchMobileNotificationFacets(
  userClient: SupabaseClient,
): ReturnType<typeof fetchMobileNotificationFacetsData> {
  return fetchMobileNotificationFacetsData(userClient);
}

/**
 * The Terms of Service version this user has accepted, or null. Mobile has no
 * login-time redirect the way web does, so bootstrap carries the flag and the
 * app gates on it in-place.
 */
export async function fetchMobileTermsAcceptedVersion(userId: string): Promise<string | null> {
  return (await fetchTermsAcceptanceStatus(userId)).acceptedVersion;
}

export function mapOrganizationToMobileConfig(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    timezone: org.timezone,
    payPeriodStartDate: org.payPeriodStartDate,
    shiftDisplayMode: org.shiftDisplayMode,
    useCompactRoleCertificationLabels: org.useCompactRoleCertificationLabels ?? false,
    labels: {
      focusArea: org.focusAreaLabel,
      certification: org.certificationLabel,
      role: org.roleLabel,
      department: org.departmentLabel,
    },
    openShiftVisibility: org.openShiftVisibility ?? DEFAULT_OPEN_SHIFT_VISIBILITY,
    featureFlags: org.featureOverrides ?? {},
  };
}
