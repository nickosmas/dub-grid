import {
  rowToCoverageRequirement,
  rowToEmployee,
  rowToFocusArea,
  rowToJobDefinition,
  rowToNamedItem,
  rowToShiftCategory,
  rowToShiftRequest,
} from "@/lib/db/mappers";
import {
  FOCUS_AREA_COLS,
  COVERAGE_REQ_COLS,
  EMPLOYEE_COLS,
  JOB_COLS,
  NAMED_ITEM_COLS,
  ORG_ROLE_COLS,
  SHIFT_CATEGORY_COLS,
} from "@/lib/db/shared";
import type {
  DbCoverageRequirement,
  DbFocusArea,
  DbJobDefinition,
  DbNamedItem,
  DbScheduleCell,
  DbScheduleCellSnapshot,
  DbShiftCategory,
  DbShiftRequest,
} from "@/lib/db/types";
import { buildShiftJobPairKey } from "@/lib/shift-job-segments";
import type {
  FocusArea,
  JobDefinition,
  Organization,
  Employee,
  NamedItem,
  ShiftCategory,
} from "@/types";
import {
  buildScheduleAssignmentOptions,
  buildShiftDisplayParts,
  formatAssignableShiftOptionLabel,
  getQualificationSeniorityRank,
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
  ScheduleCellState,
} from "@dubgrid/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAssignmentDefinitionIdsByFocusArea,
  computeCoverageGaps,
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

type LoadedMobileScheduleRow = {
  emp_id: string;
  date: string;
  focus_area_id: number | null;
  state: ScheduleCellState;
  employees: unknown;
};

type MobileScheduleCellRow = DbScheduleCell & {
  employees: unknown;
  snapshots?: DbScheduleCellSnapshot[] | null;
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
  const { data, error } = await serviceClient
    .from("employees")
    .select(
      "id, org_id, first_name, last_name, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version",
    )
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToEmployee(data);
}

async function fetchAssignmentDetailsMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<string, MobileAssignmentDetails>> {
  const [
    focusAreaResult,
    shiftResult,
    jobResult,
    roleResult,
    certificationResult,
  ] = await Promise.all([
    serviceClient
      .from("focus_areas")
      .select(FOCUS_AREA_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null),
    serviceClient
      .from("shift_categories")
      .select(SHIFT_CATEGORY_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
    serviceClient
      .from("jobs")
      .select(JOB_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
    serviceClient
      .from("organization_roles")
      .select(ORG_ROLE_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
    serviceClient
      .from("certifications")
      .select(NAMED_ITEM_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
  ]);

  if (focusAreaResult.error) throw focusAreaResult.error;
  if (shiftResult.error) throw shiftResult.error;
  if (jobResult.error) throw jobResult.error;
  if (roleResult.error) throw roleResult.error;
  if (certificationResult.error) throw certificationResult.error;

  const focusAreas = ((focusAreaResult.data ?? []) as DbFocusArea[]).map(
    rowToFocusArea,
  );
  const shiftCategories = ((shiftResult.data ?? []) as DbShiftCategory[]).map(
    rowToShiftCategory,
  );
  const jobs = ((jobResult.data ?? []) as DbJobDefinition[]).map(
    rowToJobDefinition,
  );
  const orgRoles = ((roleResult.data ?? []) as DbNamedItem[]).map(
    rowToNamedItem,
  );
  const certifications = (
    (certificationResult.data ?? []) as DbNamedItem[]
  ).map(rowToNamedItem);
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
  const { data } = await serviceClient
    .from("absence_types")
    .select("id, label, name, color, border_color, text_color")
    .eq("org_id", orgId)
    .is("archived_at", null);

  return new Map(
    (data ?? []).map((row) => [
      row.id as number,
      {
        label: row.label as string,
        name: (row.name as string | null) ?? (row.label as string),
        color: (row.color as string | null) ?? null,
        borderColor: (row.border_color as string | null) ?? null,
        textColor: (row.text_color as string | null) ?? null,
      },
    ]),
  );
}

async function fetchJobNameMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, string>> {
  const { data } = await serviceClient
    .from("jobs")
    .select("id, name")
    .eq("org_id", orgId)
    .is("archived_at", null);

  return new Map(
    (data ?? []).map((row) => [row.id as number, row.name as string]),
  );
}

export async function fetchMobileAbsenceTypes(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileAbsenceType[]> {
  const { data, error } = await serviceClient
    .from("absence_types")
    .select("id, label")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("label", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as number,
    label: row.label as string,
  }));
}

export async function fetchMobileFocusAreas(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileFocusArea[]> {
  const { data, error } = await serviceClient
    .from("focus_areas")
    .select("id, name")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as number,
    name: row.name as string,
  }));
}

async function fetchFocusAreaNameMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, string>> {
  const focusAreas = await fetchMobileFocusAreas(serviceClient, orgId);
  return new Map(focusAreas.map((focusArea) => [focusArea.id, focusArea.name]));
}

async function fetchMobilePublishHistory(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobilePublishHistoryEntry[]> {
  const { data, error } = await serviceClient.rpc("get_publish_history", {
    p_org_id: orgId,
    p_limit: 100,
    p_offset: 0,
  });

  if (error || !data) {
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => ({
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    publishedAt: row.published_at as string,
    publishedByName: (row.published_by_name as string | null) ?? null,
  }));
}

function normalizeEmbeddedEmployee(value: unknown): EmbeddedEmployee | null {
  if (Array.isArray(value)) {
    return normalizeEmbeddedEmployee(value[0] ?? null);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EmbeddedEmployee>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.first_name !== "string" ||
    typeof candidate.last_name !== "string" ||
    typeof candidate.org_id !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    org_id: candidate.org_id,
    seniority:
      typeof candidate.seniority === "number" ? candidate.seniority : null,
    focus_area_ids: Array.isArray(candidate.focus_area_ids)
      ? candidate.focus_area_ids.filter(
          (value): value is number => typeof value === "number",
        )
      : [],
  };
}

function normalizePublishedSnapshotRow(
  row: MobileScheduleCellRow,
): LoadedMobileScheduleRow | null {
  const publishedSnapshot = (row.snapshots ?? []).find(
    (snapshot) => snapshot.snapshot_kind === "published",
  );
  if (!publishedSnapshot) return null;

  const orderedSegments = [...(publishedSnapshot.segments ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  return {
    emp_id: row.emp_id,
    date: row.date,
    focus_area_id: row.focus_area_id ?? null,
    state:
      publishedSnapshot.state_kind === "absence"
        ? {
            kind: "absence",
            segments: [],
            absenceTypeId: publishedSnapshot.absence_type_id ?? null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          }
        : {
            kind: "worked",
            segments: orderedSegments.map((segment) => ({
              shiftId: segment.shift_id ?? null,
              jobId: segment.job_id,
              position: segment.position,
            })),
            absenceTypeId: null,
            customStartTime: publishedSnapshot.custom_start_time ?? null,
            customEndTime: publishedSnapshot.custom_end_time ?? null,
            seriesId: null,
            fromRecurring: false,
          },
    employees: row.employees,
  };
}

async function loadMobileScheduleRows(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
): Promise<LoadedMobileScheduleRow[]> {
  let normalizedQuery = serviceClient
    .from("schedule_cells")
    .select(
      `
        id,
        emp_id,
        date,
        org_id,
        focus_area_id,
        version,
        series_id,
        from_recurring,
        created_by,
        updated_by,
        created_at,
        updated_at,
        snapshots:schedule_cell_snapshots(
          id,
          cell_id,
          org_id,
          snapshot_kind,
          state_kind,
          absence_type_id,
          custom_start_time,
          custom_end_time,
          segments:schedule_cell_segments(
            id,
            snapshot_id,
            org_id,
            position,
            shift_id,
            job_id
          )
        ),
        employees!inner(id, first_name, last_name, org_id, seniority, focus_area_ids)
      `,
    )
    .eq("org_id", input.orgId)
    .gte("date", input.startDate)
    .lte("date", input.endDate)
    .order("date", { ascending: true });

  if (input.employeeId) {
    normalizedQuery = normalizedQuery.eq("emp_id", input.employeeId);
  }

  const { data, error } = await normalizedQuery;
  if (error) throw error;

  return ((data ?? []) as MobileScheduleCellRow[])
    .map((row) => normalizePublishedSnapshotRow(row))
    .filter((row): row is LoadedMobileScheduleRow => row != null);
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
  const data = await loadMobileScheduleRows(serviceClient, input);

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

    const employee = normalizeEmbeddedEmployee(row.employees);
    if (!employee) {
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
      employeeId: employee.id,
      employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
      employeeSeniority: employee.seniority ?? null,
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
  const [
    focusAreaResult,
    shiftResult,
    jobResult,
    roleResult,
    coverageResult,
    employeeResult,
  ] = await Promise.all([
    serviceClient
      .from("focus_areas")
      .select(FOCUS_AREA_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
    serviceClient
      .from("shift_categories")
      .select(SHIFT_CATEGORY_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
    serviceClient
      .from("jobs")
      .select(JOB_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
    serviceClient
      .from("organization_roles")
      .select(ORG_ROLE_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
    serviceClient
      .from("coverage_requirements")
      .select(COVERAGE_REQ_COLS)
      .eq("org_id", orgId),
    serviceClient
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("status", "active"),
  ]);

  if (focusAreaResult.error) throw focusAreaResult.error;
  if (shiftResult.error) throw shiftResult.error;
  if (jobResult.error) throw jobResult.error;
  if (roleResult.error) throw roleResult.error;
  if (coverageResult.error) throw coverageResult.error;
  if (employeeResult.error) throw employeeResult.error;

  const focusAreas = ((focusAreaResult.data ?? []) as DbFocusArea[]).map(
    rowToFocusArea,
  );
  const shiftCategories = ((shiftResult.data ?? []) as DbShiftCategory[]).map(
    rowToShiftCategory,
  );
  const jobs = ((jobResult.data ?? []) as DbJobDefinition[]).map(
    rowToJobDefinition,
  );
  const orgRoles = ((roleResult.data ?? []) as DbNamedItem[]).map(
    rowToNamedItem,
  );
  const coverageRequirements = (
    (coverageResult.data ?? []) as DbCoverageRequirement[]
  ).map(rowToCoverageRequirement);
  const employees = (
    (employeeResult.data ?? []) as Parameters<typeof rowToEmployee>[0][]
  )
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
    loadMobileScheduleRows(serviceClient, {
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
    const assignment =
      openAssignments.find(
        (item) => item.id === gap.preferredOpenAssignmentDefinitionId,
      ) ??
      openAssignments[0] ??
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

  let query = serviceClient
    .from("shift_requests")
    .select(
      `*,
       requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name),
       target:employees!shift_requests_target_emp_id_fkey(first_name, last_name)`,
    )
    .eq("org_id", input.orgId)
    .order("created_at", { ascending: false });

  if (input.employeeId) {
    const filters = [
      `requester_emp_id.eq.${input.employeeId}`,
      `target_emp_id.eq.${input.employeeId}`,
    ];

    if (input.includeOpenPickupRequests) {
      filters.push("and(status.eq.open,type.eq.pickup)");
    }

    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).filter((row) => {
    if (!input.startDate && !input.endDate) {
      return true;
    }

    const requesterDate = String(row.requester_shift_date ?? "");
    const targetDate =
      row.target_shift_date == null ? null : String(row.target_shift_date);
    const dateValues = [requesterDate, targetDate].filter(
      (value): value is string => value != null && value.length > 0,
    );

    return dateValues.some((dateValue) => {
      if (input.startDate && dateValue < input.startDate) {
        return false;
      }
      if (input.endDate && dateValue > input.endDate) {
        return false;
      }
      return true;
    });
  });

  return rows.map((row) => {
    const requester = row.requester as {
      first_name: string;
      last_name: string;
    } | null;
    const target = row.target as {
      first_name: string;
      last_name: string;
    } | null;
    const mapped: DbShiftRequest = {
      id: row.id as string,
      org_id: row.org_id as string,
      type: row.type as DbShiftRequest["type"],
      status: row.status as DbShiftRequest["status"],
      requester_emp_id: row.requester_emp_id as string,
      requester_shift_date: row.requester_shift_date as string,
      requester_state: row.requester_state as DbShiftRequest["requester_state"],
      target_emp_id: (row.target_emp_id as string | null) ?? null,
      target_shift_date: (row.target_shift_date as string | null) ?? null,
      target_state:
        (row.target_state as DbShiftRequest["target_state"]) ?? null,
      absence_type_id: (row.absence_type_id as number | null) ?? null,
      parent_request_id: (row.parent_request_id as string | null) ?? null,
      admin_user_id: (row.admin_user_id as string | null) ?? null,
      admin_note: (row.admin_note as string | null) ?? null,
      expires_at: row.expires_at as string,
      resolved_at: (row.resolved_at as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
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
  const { data, error } = await serviceClient
    .from("employees")
    .select(
      "id, first_name, last_name, status, status_changed_at, status_note, focus_area_ids, phone, email, contact_notes, version",
    )
    .eq("org_id", orgId)
    .order("first_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status ?? "active",
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
  const { data, error } = await userClient.rpc(
    "get_unread_notification_count",
  );

  if (error) throw error;

  return (data as number) ?? 0;
}

export async function fetchMobileNotifications(
  userClient: SupabaseClient,
  input: { limit: number; offset: number },
): Promise<{ unreadCount: number; notifications: MobileNotification[] }> {
  const [
    { data: notifications, error: notificationError },
    { data: unreadCount, error: unreadError },
  ] = await Promise.all([
    userClient.rpc("get_notifications", {
      p_limit: input.limit,
      p_offset: input.offset,
    }),
    userClient.rpc("get_unread_notification_count"),
  ]);

  if (notificationError) throw notificationError;
  if (unreadError) throw unreadError;

  return {
    unreadCount: (unreadCount as number) ?? 0,
    notifications: (notifications ?? []).map(
      (row: Record<string, unknown>) => ({
        id: row.id as string,
        type: row.type as MobileNotification["type"],
        channel: (row.channel as "in_app" | "email") ?? "in_app",
        category: (row.category as string | null) ?? null,
        title: row.title as string,
        message: row.message as string,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        readAt: (row.read_at as string | null) ?? null,
        createdAt: row.created_at as string,
      }),
    ),
  };
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
