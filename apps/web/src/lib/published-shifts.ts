import { computeShiftDurationHours } from "@/lib/dashboard-stats";
import { FOCUS_AREA_COLS, JOB_COLS, SHIFT_CATEGORY_COLS } from "@/lib/db/shared";
import { rowToFocusArea, rowToJobDefinition, rowToShiftCategory } from "@/lib/db/mappers";
import type {
  DbFocusArea,
  DbJobDefinition,
  DbScheduleCell,
  DbScheduleCellSnapshot,
  DbShiftCategory,
} from "@/lib/db/types";
import { buildShiftJobPairKey } from "@/lib/shift-job-segments";
import { buildShiftDisplayParts, formatAssignableShiftOptionLabel } from "@/lib/assignable-shifts";
import { getJobPlacementShiftPool, resolveJobTimesForShift } from "@/lib/job-placement";
import { isRegularStaffSystemJob } from "@/lib/system-jobs";
import type { AssignmentDefinition, FocusArea, JobDefinition, ShiftCategory } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PUBLISHED_SHIFT_COLS = [
  "emp_id",
  "date",
  "published_shift_ids",
  "published_job_ids",
  "resolvedAssignmentIds",
  "published_absence_type_id",
  "published_custom_start_time",
  "published_custom_end_time",
].join(", ");

export interface PublishedShiftRow {
  emp_id: string;
  date: string;
  published_shift_ids?: Array<number | null> | null;
  published_job_ids?: number[] | null;
  resolvedAssignmentIds: number[] | null;
  resolvedSegments?: PublishedScheduleSegment[];
  published_absence_type_id: number | null;
  published_custom_start_time: string | null;
  published_custom_end_time: string | null;
}

export interface PublishedScheduleSegment {
  shiftId: number | null;
  jobId: number;
  label: string;
  isMentored?: boolean;
  startTime: string | null;
  endTime: string | null;
  durationHours?: number;
  breakMinutes?: number;
}

export interface PublishedScheduleEntry {
  kind: "shift" | "absence";
  empId: string;
  date: string;
  label: string;
  assignmentIds: number[];
  absenceTypeId: number | null;
  startTime: string | null;
  endTime: string | null;
  durationHours: number;
  segments?: PublishedScheduleSegment[];
}

type PublishedAssignmentDefinition = Pick<
  AssignmentDefinition,
  "label" | "defaultStartTime" | "defaultEndTime"
>;

type PublishedScheduleLoaderArgs = {
  orgId?: string;
  employeeId?: string;
  employeeIds?: string[];
  startDate?: string;
  endDate?: string;
  endDateExclusive?: string;
  limit?: number;
  orderAscending?: boolean;
  extraSelects?: string[];
};

type PublishedScheduleRecord = PublishedShiftRow & Record<string, unknown>;
type NormalizedPublishedScheduleRow = DbScheduleCell & Record<string, unknown>;

function buildNormalizedPublishedShiftSelect(extraSelects: string[] = []): string {
  return [
    "id",
    "emp_id",
    "date",
    "org_id",
    "focus_area_id",
    `snapshots:schedule_cell_snapshots(
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
            job_id,
            is_mentored
      )
    )`,
    ...extraSelects,
  ].join(", ");
}

function getPublishedSnapshot(row: NormalizedPublishedScheduleRow): DbScheduleCellSnapshot | null {
  return (
    ((row.snapshots as DbScheduleCellSnapshot[] | null | undefined) ?? []).find(
      (snapshot) => snapshot.snapshot_kind === "published",
    ) ?? null
  );
}

export function mapNormalizedScheduleCellToPublishedShiftRow(
  row: NormalizedPublishedScheduleRow,
  segmentDetailsByPair: Map<string, PublishedScheduleSegment> = new Map(),
): PublishedScheduleRecord | null {
  const publishedSnapshot = getPublishedSnapshot(row);
  if (!publishedSnapshot) return null;

  const orderedSegments = [...(publishedSnapshot.segments ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  return {
    ...row,
    published_shift_ids: orderedSegments.map((segment) => segment.shift_id ?? null),
    published_job_ids: orderedSegments.map((segment) => segment.job_id),
    resolvedAssignmentIds: [],
    resolvedSegments: orderedSegments
      .map((segment): PublishedScheduleSegment | null => {
        const detail = segmentDetailsByPair.get(
          buildShiftJobPairKey(segment.shift_id ?? null, segment.job_id),
        );
        return detail ? { ...detail, isMentored: segment.is_mentored ?? false } : null;
      })
      .filter((segment): segment is PublishedScheduleSegment => segment != null),
    published_absence_type_id:
      publishedSnapshot.state_kind === "absence"
        ? (publishedSnapshot.absence_type_id ?? null)
        : null,
    published_custom_start_time: publishedSnapshot.custom_start_time ?? null,
    published_custom_end_time: publishedSnapshot.custom_end_time ?? null,
  };
}

function buildPublishedSegmentDetails(input: {
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
}): Map<string, PublishedScheduleSegment> {
  const detailsByPair = new Map<string, PublishedScheduleSegment>();

  const addDetails = (job: JobDefinition, shift: ShiftCategory | null) => {
    const times = resolveJobTimesForShift(job, shift);
    const durationHours =
      times.startTime && times.endTime
        ? Math.max(
            0,
            durationFromTimes(times.startTime, times.endTime) - (shift?.breakMinutes ?? 0) / 60,
          )
        : shift == null
          ? (job.defaultDurationHours ?? 0) + (job.defaultDurationMinutes ?? 0) / 60
          : 0;
    const displayParts = buildShiftDisplayParts({
      shift,
      job,
      shiftDisplayMode: "name",
    });

    detailsByPair.set(buildShiftJobPairKey(shift?.id ?? null, job.id), {
      shiftId: shift?.id ?? null,
      jobId: job.id,
      label: formatAssignableShiftOptionLabel(displayParts),
      startTime: times.startTime,
      endTime: times.endTime,
      durationHours,
      breakMinutes: shift?.breakMinutes ?? 0,
    });
  };

  for (const job of input.jobs) {
    if (job.archivedAt || isRegularStaffSystemJob(job)) continue;
    const mode = job.assignmentMode ?? "with_shift";
    if (mode !== "shiftless") {
      for (const shift of getJobPlacementShiftPool(job, input.shiftCategories, input.focusAreas)) {
        addDetails(job, shift);
      }
    }
    if (mode !== "with_shift") {
      addDetails(job, null);
    }
  }

  return detailsByPair;
}

async function fetchPublishedSegmentDetailsByOrg(
  client: SupabaseClient,
  orgId: string,
): Promise<Map<string, PublishedScheduleSegment>> {
  const [focusAreaResult, shiftResult, jobResult] = await Promise.all([
    client.from("focus_areas").select(FOCUS_AREA_COLS).eq("org_id", orgId),
    client.from("shift_categories").select(SHIFT_CATEGORY_COLS).eq("org_id", orgId),
    client.from("jobs").select(JOB_COLS).eq("org_id", orgId),
  ]);

  if (focusAreaResult.error) throw focusAreaResult.error;
  if (shiftResult.error) throw shiftResult.error;
  if (jobResult.error) throw jobResult.error;

  return buildPublishedSegmentDetails({
    focusAreas: ((focusAreaResult.data ?? []) as DbFocusArea[]).map(rowToFocusArea),
    shiftCategories: ((shiftResult.data ?? []) as DbShiftCategory[]).map(rowToShiftCategory),
    jobs: ((jobResult.data ?? []) as DbJobDefinition[]).map(rowToJobDefinition),
  });
}

async function fetchNormalizedPublishedShiftRows(
  client: SupabaseClient,
  args: PublishedScheduleLoaderArgs,
): Promise<PublishedScheduleRecord[]> {
  let query = client
    .from("schedule_cells")
    .select(buildNormalizedPublishedShiftSelect(args.extraSelects))
    .order("date", { ascending: args.orderAscending ?? true });

  if (args.orgId) {
    query = query.eq("org_id", args.orgId);
  }
  if (args.employeeId) {
    query = query.eq("emp_id", args.employeeId);
  } else if ((args.employeeIds?.length ?? 0) > 0) {
    query = query.in("emp_id", args.employeeIds ?? []);
  }
  if (args.startDate) {
    query = query.gte("date", args.startDate);
  }
  if (args.endDate) {
    query = query.lte("date", args.endDate);
  }
  if (args.endDateExclusive) {
    query = query.lt("date", args.endDateExclusive);
  }
  if (args.limit != null) {
    query = query.limit(args.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as NormalizedPublishedScheduleRow[];
  const orgIds = Array.from(new Set(rows.map((row) => row.org_id).filter(Boolean)));

  const segmentDetailsByOrg = new Map<string, Map<string, PublishedScheduleSegment>>();
  if (orgIds.length > 0) {
    await Promise.all(
      orgIds.map(async (orgId) => {
        segmentDetailsByOrg.set(orgId, await fetchPublishedSegmentDetailsByOrg(client, orgId));
      }),
    );
  }

  return rows
    .map((row) =>
      mapNormalizedScheduleCellToPublishedShiftRow(
        row,
        segmentDetailsByOrg.get(row.org_id) ?? new Map(),
      ),
    )
    .filter((row): row is PublishedScheduleRecord => row != null);
}

export async function fetchPublishedShiftRows(
  client: SupabaseClient,
  args: PublishedScheduleLoaderArgs,
): Promise<PublishedScheduleRecord[]> {
  return fetchNormalizedPublishedShiftRows(client, args);
}

function pickPipeTime(value: string | null | undefined, which: "first" | "last"): string | null {
  if (!value) return null;
  const parts = value.split("|").filter(Boolean);
  if (parts.length === 0) return null;
  return which === "first" ? (parts[0] ?? null) : (parts[parts.length - 1] ?? null);
}

function getFallbackTime(
  assignmentIds: number[],
  assignmentById: Map<number, PublishedAssignmentDefinition>,
  part: "start" | "end",
): string | null {
  if (assignmentIds.length === 0) return null;
  const preset =
    part === "start"
      ? assignmentById.get(assignmentIds[0]!)
      : assignmentById.get(assignmentIds[assignmentIds.length - 1]!);

  if (!preset) return null;

  return part === "start" ? (preset.defaultStartTime ?? null) : (preset.defaultEndTime ?? null);
}

function resolveShiftLabel(
  assignmentIds: number[],
  assignmentById: Map<number, PublishedAssignmentDefinition>,
): string {
  return assignmentIds.map((id) => assignmentById.get(id)?.label ?? "?").join("/");
}

function durationFromTimes(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0;
  const [startHour = 0, startMinute = 0] = startTime.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  return Math.max(0, (end - start) / 60);
}

function splitPipeTimes(value: string | null | undefined): string[] {
  return value?.split("|").map((part) => part.trim()) ?? [];
}

function resolveSegmentDurationHours(
  segment: PublishedScheduleSegment,
  index: number,
  customStarts: string[],
  customEnds: string[],
): number {
  const hasCustomStart = customStarts.length > 0;
  const hasCustomEnd = customEnds.length > 0;
  const customStart = hasCustomStart ? (customStarts[index] ?? "") : "";
  const customEnd = hasCustomEnd ? (customEnds[index] ?? "") : "";
  const startTime = customStart || segment.startTime;
  const endTime = customEnd || segment.endTime;

  if (startTime && endTime) {
    return Math.max(0, durationFromTimes(startTime, endTime) - (segment.breakMinutes ?? 0) / 60);
  }

  return segment.durationHours ?? 0;
}

export function hasPublishedScheduleContent(row: PublishedShiftRow): boolean {
  return (row.resolvedAssignmentIds?.length ?? 0) > 0 || row.published_absence_type_id != null;
}

export function resolvePublishedScheduleEntry(
  row: PublishedShiftRow,
  assignmentById: Map<number, PublishedAssignmentDefinition>,
  absenceTypeById: Map<number, string> = new Map(),
): PublishedScheduleEntry | null {
  const assignmentIds = row.resolvedAssignmentIds ?? [];
  const segments = row.resolvedSegments ?? [];
  const absenceTypeId = row.published_absence_type_id ?? null;
  const customStarts = splitPipeTimes(row.published_custom_start_time);
  const customEnds = splitPipeTimes(row.published_custom_end_time);

  if (assignmentIds.length === 0 && segments.length === 0 && absenceTypeId == null) {
    return null;
  }

  if (absenceTypeId != null) {
    return {
      kind: "absence",
      empId: row.emp_id,
      date: row.date,
      label: absenceTypeById.get(absenceTypeId) ?? "OFF",
      assignmentIds: [],
      absenceTypeId,
      startTime: null,
      endTime: null,
      durationHours: 0,
      segments: [],
    };
  }

  const startTime =
    pickPipeTime(row.published_custom_start_time, "first") ??
    segments[0]?.startTime ??
    getFallbackTime(assignmentIds, assignmentById, "start");
  const endTime =
    pickPipeTime(row.published_custom_end_time, "last") ??
    segments.at(-1)?.endTime ??
    getFallbackTime(assignmentIds, assignmentById, "end");
  const label =
    segments.length > 0
      ? segments.map((segment) => segment.label || "?").join("/")
      : resolveShiftLabel(assignmentIds, assignmentById);
  const segmentDurationHours = segments.reduce(
    (sum, segment, index) =>
      sum + resolveSegmentDurationHours(segment, index, customStarts, customEnds),
    0,
  );
  const durationHours =
    segments.length > 0
      ? segmentDurationHours
      : assignmentIds.length > 0
        ? computeShiftDurationHours(
            assignmentIds,
            assignmentById as Map<number, AssignmentDefinition>,
            row.published_custom_start_time ?? null,
            row.published_custom_end_time ?? null,
          )
        : durationFromTimes(startTime, endTime);

  return {
    kind: "shift",
    empId: row.emp_id,
    date: row.date,
    label,
    assignmentIds: assignmentIds,
    absenceTypeId: null,
    startTime,
    endTime,
    durationHours,
    segments,
  };
}
