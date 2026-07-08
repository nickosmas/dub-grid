import { supabase, OptimisticLockError, logAudit, fetchAllRows } from "./shared";
import { fetchAssignmentDefinitions } from "./config";
import type { DbScheduleCell } from "./types";
import type { ScheduleCellInput, ScheduleCellSegmentInput, ShiftMap } from "@/types";
import {
  buildShiftJobPairKey,
  createAssignmentDefinitionIdByPairMap,
  type SegmentCompatibilityMaps,
} from "@/lib/shift-job-segments";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";

const MAX_RANGE_DAYS = 366;

function assertDateRange(startDate?: string, endDate?: string): void {
  if (startDate && endDate) {
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    if (diffMs > MAX_RANGE_DAYS * 86_400_000) {
      throw new Error(`Shift query range exceeds ${MAX_RANGE_DAYS} days`);
    }
  }
}

export async function fetchShifts(
  orgId: string,
  isScheduler: boolean,
  assignmentLabelMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
  segmentCompatibility?: SegmentCompatibilityMaps | null,
): Promise<ShiftMap> {
  assertDateRange(startDate, endDate);
  return fetchNormalizedShifts(
    orgId,
    isScheduler,
    assignmentLabelMap,
    absenceTypeMap,
    startDate,
    endDate,
    segmentCompatibility,
  );
}

async function fetchNormalizedShifts(
  orgId: string,
  isScheduler: boolean,
  assignmentLabelMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
  segmentCompatibility?: SegmentCompatibilityMaps | null,
): Promise<ShiftMap> {
  const buildPage = (from: number, to: number) => {
    let query = supabase
      .from("schedule_cells")
      .select(
        "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))",
      )
      .eq("org_id", orgId);
    if (startDate) query = query.gte("date", startDate);
    if (endDate) query = query.lte("date", endDate);
    return query
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  };
  // A single unpaged query here would silently truncate at PostgREST's
  // max_rows cap (200 OK, rows just missing) once an org/date window has
  // more schedule_cells than the configured limit — fetchAllRows paginates
  // past that regardless of what the cap is set to.
  const data = await fetchAllRows<DbScheduleCell>(buildPage);

  let assignmentIdByPair: Map<string, number> | undefined;
  if (!segmentCompatibility && data.length > 0) {
    assignmentIdByPair = createAssignmentDefinitionIdByPairMap(
      await fetchAssignmentDefinitions(orgId, true),
    );
  }

  const atMap = absenceTypeMap ?? new Map<number, string>();
  const map: ShiftMap = {};
  for (const row of data) {
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
      isScheduler,
      assignmentLabelMap,
      assignmentIdByPair,
      absenceTypeMap: atMap,
      segmentCompatibility,
    });
    if (entry) {
      map[`${row.emp_id}_${row.date}`] = entry;
    }
  }
  return map;
}

function sortSegments(segments: ScheduleCellSegmentInput[]): ScheduleCellSegmentInput[] {
  return [...segments].sort((left, right) => left.position - right.position);
}

async function resolveAssignmentDefinitionIdsForSegments(
  orgId: string,
  segments: ScheduleCellSegmentInput[],
): Promise<number[]> {
  if (segments.length === 0) return [];

  const orderedSegments = sortSegments(segments);
  const codeByPair = createAssignmentDefinitionIdByPairMap(
    await fetchAssignmentDefinitions(orgId, true),
  );

  return orderedSegments
    .map((segment) => codeByPair.get(buildShiftJobPairKey(segment.shiftId, segment.jobId)) ?? null)
    .filter((assignmentId): assignmentId is number => assignmentId != null);
}

async function resolveScheduleCellStorage(
  orgId: string,
  input: ScheduleCellInput,
): Promise<{
  shiftIds: Array<number | null>;
  jobIds: number[];
  isMentoredFlags: boolean[];
  assignmentIds: number[];
  absenceTypeId: number | null;
  customStartTime: string | null;
  customEndTime: string | null;
}> {
  if (input.kind === "deleted") {
    return {
      shiftIds: [],
      jobIds: [],
      isMentoredFlags: [],
      assignmentIds: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
    };
  }

  if (input.kind === "absence") {
    return {
      shiftIds: [],
      jobIds: [],
      isMentoredFlags: [],
      assignmentIds: [],
      absenceTypeId: input.absenceTypeId ?? null,
      customStartTime: null,
      customEndTime: null,
    };
  }

  const orderedSegments = sortSegments(input.segments);
  return {
    shiftIds: orderedSegments.map((segment) => segment.shiftId),
    jobIds: orderedSegments.map((segment) => segment.jobId),
    isMentoredFlags: orderedSegments.map((segment) => segment.isMentored ?? false),
    assignmentIds: await resolveAssignmentDefinitionIdsForSegments(orgId, orderedSegments),
    absenceTypeId: null,
    customStartTime: input.customStartTime ?? null,
    customEndTime: input.customEndTime ?? null,
  };
}

type ScheduleCellSnapshotPayload = {
  cell_id: string;
  org_id: string;
  emp_id: string;
  date: string;
  version: number;
  focus_area_id: number | null;
  series_id: string | null;
  from_recurring: boolean;
  state_kind: "worked" | "absence" | "deleted";
  absence_type_id: number | null;
  custom_start_time: string | null;
  custom_end_time: string | null;
  shift_ids: Array<number | null>;
  job_ids: number[];
  is_mentored_flags: boolean[];
};

async function fetchScheduleCellSnapshotPayload(
  orgId: string,
  empId: string,
  date: string,
  snapshotKind: "draft" | "published",
): Promise<ScheduleCellSnapshotPayload | null> {
  const { data, error } = await supabase.rpc("get_schedule_cell_snapshot_payload", {
    p_org_id: orgId,
    p_emp_id: empId,
    p_date: date,
    p_snapshot_kind: snapshotKind,
  });

  if (error) throw error;
  const rows = (data ?? []) as ScheduleCellSnapshotPayload[];
  return rows[0] ?? null;
}

async function readCurrentScheduleCellVersion(
  orgId: string,
  empId: string,
  date: string,
): Promise<number | undefined> {
  const { data, error } = await supabase
    .from("schedule_cells")
    .select("version")
    .eq("org_id", orgId)
    .eq("emp_id", empId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  return (data?.version as number | undefined) ?? undefined;
}

async function throwOptimisticLock(
  empId: string,
  date: string,
  orgId: string,
  expectedVersion: number,
): Promise<never> {
  throw new OptimisticLockError(
    `${empId}:${date}`,
    expectedVersion,
    await readCurrentScheduleCellVersion(orgId, empId, date),
  );
}

/**
 * Checks if any assignment definitions in the array have overlapping default time ranges.
 * Returns the first overlapping pair or null if no conflicts.
 * Mirrors the DB trigger logic for immediate client-side feedback.
 */
export async function checkAssignmentDefinitionOverlap(
  orgId: string,
  assignmentIds: number[],
): Promise<{ labelA: string; labelB: string } | null> {
  if (assignmentIds.length < 2) return null;

  const codeById = new Map(
    (await fetchAssignmentDefinitions(orgId, true)).map((assignment) => [
      assignment.id,
      assignment,
    ]),
  );

  // Convert TIME string "HH:MM:SS" to minutes from midnight
  function toMinutes(time: string | null): number | null {
    if (!time) return null;
    const parts = time.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  const parsed = assignmentIds
    .map((assignmentId) => codeById.get(assignmentId) ?? null)
    .filter((assignment): assignment is NonNullable<typeof assignment> => assignment != null)
    .map((assignment) => ({
      id: assignment.id,
      label: assignment.label,
      start: toMinutes(assignment.defaultStartTime ?? null),
      end: toMinutes(assignment.defaultEndTime ?? null),
    }))
    .filter(
      (c: { start: number | null; end: number | null }) => c.start !== null && c.end !== null,
    );

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];
      // Normalise overnight shifts: if end <= start, add 24h
      const aEnd = a.end! <= a.start! ? a.end! + 1440 : a.end!;
      const bEnd = b.end! <= b.start! ? b.end! + 1440 : b.end!;
      if (a.start! < bEnd && b.start! < aEnd) {
        return { labelA: a.label, labelB: b.label };
      }
    }
  }
  return null;
}

export async function upsertShift(
  empId: string,
  date: string,
  input: ScheduleCellInput,
  orgId: string,
  expectedVersion?: number,
): Promise<void> {
  if (input.kind === "deleted") {
    await deleteShift(empId, date, orgId, expectedVersion);
    return;
  }

  const {
    shiftIds,
    jobIds,
    isMentoredFlags,
    assignmentIds,
    absenceTypeId,
    customStartTime,
    customEndTime,
  } = await resolveScheduleCellStorage(orgId, input);
  // Client-side overlap check for immediate feedback
  if (assignmentIds.length >= 2 && absenceTypeId == null) {
    const overlap = await checkAssignmentDefinitionOverlap(orgId, assignmentIds);
    if (overlap) {
      throw new Error(
        `Assignments "${overlap.labelA}" and "${overlap.labelB}" have overlapping time ranges`,
      );
    }
  }
  const { error } = await supabase.rpc("write_schedule_cell_snapshot", {
    p_org_id: orgId,
    p_emp_id: empId,
    p_date: date,
    p_snapshot_kind: "draft",
    p_state_kind: input.kind,
    p_shift_ids: shiftIds,
    p_job_ids: jobIds,
    p_is_mentored_flags: isMentoredFlags,
    p_absence_type_id: absenceTypeId ?? null,
    p_custom_start_time: customStartTime ?? null,
    p_custom_end_time: customEndTime ?? null,
    p_series_id: input.seriesId ?? null,
    p_from_recurring: input.fromRecurring ?? false,
    p_expected_version: expectedVersion ?? 0,
  });
  if (error) {
    if (error.message?.includes("Optimistic lock failed")) {
      await throwOptimisticLock(empId, date, orgId, expectedVersion ?? 0);
    }
    throw error;
  }
  const action = expectedVersion !== undefined ? "shift.updated" : "shift.created";
  void logAudit(
    action,
    "shift",
    `${empId}:${date}`,
    { input, assignmentIds, absenceTypeId },
    orgId,
  );
}

/** Updates only the draft custom start/end time for an existing shift row. */
export async function upsertShiftTimes(
  empId: string,
  date: string,
  customStartTime: string | null,
  customEndTime: string | null,
  orgId: string,
  expectedVersion?: number,
): Promise<void> {
  const draftPayload = await fetchScheduleCellSnapshotPayload(orgId, empId, date, "draft");
  const publishedPayload = await fetchScheduleCellSnapshotPayload(orgId, empId, date, "published");
  const sourcePayload =
    draftPayload?.state_kind === "worked"
      ? draftPayload
      : publishedPayload?.state_kind === "worked"
        ? publishedPayload
        : null;

  if (!sourcePayload) {
    throw new Error("Cannot set custom times without a worked schedule cell");
  }

  const { error } = await supabase.rpc("write_schedule_cell_snapshot", {
    p_org_id: orgId,
    p_emp_id: empId,
    p_date: date,
    p_snapshot_kind: "draft",
    p_state_kind: "worked",
    p_shift_ids: sourcePayload.shift_ids ?? [],
    p_job_ids: sourcePayload.job_ids ?? [],
    p_is_mentored_flags: sourcePayload.is_mentored_flags ?? [],
    p_absence_type_id: null,
    p_custom_start_time: customStartTime,
    p_custom_end_time: customEndTime,
    p_series_id: sourcePayload.series_id ?? null,
    p_from_recurring: sourcePayload.from_recurring ?? false,
    p_focus_area_id: sourcePayload.focus_area_id ?? null,
    p_expected_version: expectedVersion ?? sourcePayload.version ?? 0,
  });

  if (error) {
    if (error.message?.includes("Optimistic lock failed")) {
      await throwOptimisticLock(empId, date, orgId, expectedVersion ?? sourcePayload.version ?? 0);
    }
    throw error;
  }
}

export async function deleteShift(
  empId: string,
  date: string,
  orgId: string,
  expectedVersion?: number,
): Promise<void> {
  const { error } = await supabase.rpc("delete_schedule_cell_draft", {
    p_org_id: orgId,
    p_emp_id: empId,
    p_date: date,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) {
    if (error.message?.includes("Optimistic lock failed")) {
      await throwOptimisticLock(empId, date, orgId, expectedVersion ?? 0);
    }
    throw error;
  }
  void logAudit("shift.deleted", "shift", `${empId}:${date}`, {}, orgId);
}

/**
 * Atomically moves a shift from one employee+date to another.
 * Uses a SECURITY DEFINER RPC with advisory locks to prevent partial failures.
 */
export async function moveShift(
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
  const {
    shiftIds,
    jobIds,
    isMentoredFlags,
    assignmentIds,
    absenceTypeId,
    customStartTime,
    customEndTime,
  } = await resolveScheduleCellStorage(orgId, input);
  const { error } = await supabase.rpc("move_shift", {
    p_org_id: orgId,
    p_source_emp_id: sourceEmpId,
    p_source_date: sourceDate,
    p_target_emp_id: targetEmpId,
    p_target_date: targetDate,
    p_kind: input.kind,
    p_shift_ids: shiftIds,
    p_job_ids: jobIds,
    p_is_mentored_flags: isMentoredFlags,
    p_absence_type_id: absenceTypeId ?? null,
    p_custom_start_time: customStartTime ?? null,
    p_custom_end_time: customEndTime ?? null,
    p_drag_mode: dragMode,
    p_expected_version: expectedVersion ?? null,
    p_target_expected_version: targetExpectedVersion ?? null,
    p_target_was_empty: targetWasEmpty ?? false,
  });
  if (error) {
    if (error.message?.includes("Optimistic lock failed")) {
      throw new OptimisticLockError(`${sourceEmpId}:${sourceDate}`, expectedVersion ?? 0);
    }
    throw error;
  }
  void logAudit(
    "shift.moved",
    "shift",
    `${sourceEmpId}:${sourceDate}`,
    {
      targetEmpId,
      targetDate,
      input,
      assignmentIds,
      absenceTypeId: absenceTypeId ?? null,
      dragMode,
    },
    orgId,
  );
}
