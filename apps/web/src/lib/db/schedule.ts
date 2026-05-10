import {
  supabase, logAudit, formatDateKey,
  RECURRING_SHIFT_COLS,
} from "./shared";
import { fetchJobDefinitions, fetchShiftCategories } from "./config";
import type { DbRecurringShift, DbScheduleNote, RecurringDraft, DbScheduleCell } from "./types";
import { rowToRecurringShift, generateSeriesDates } from "./mappers";
import { upsertShift, deleteShift } from "./shifts";
import type { DraftBreakdown } from "@/lib/draft-utils";
import { formatClientErrorMessage } from "@/lib/client-facing";
import {
  joinShiftJobSegmentLabels,
  resolveShiftJobSegments,
  createShiftJobCompatibilityMaps,
  type SegmentCompatibilityMaps,
} from "@/lib/shift-job-segments";
import type {
  PublishChange,
  PublishHistoryEntry,
  PublishHistoryEntryWithName,
  RecurringScheduleDraft,
  RecurringShift,
  ScheduleCellInput,
  ScheduleNote,
  SeriesFrequency,
  ShiftSeries,
} from "@/types";

const SHIFT_SERIES_UPSERT_BATCH_SIZE = 25;

interface ScheduleDraftSummaryResponse {
  summary?: DraftBreakdown;
  error?: string;
  code?: string;
}

export class ScheduleDraftConflictError extends Error {
  constructor(public readonly latestSummary: DraftBreakdown) {
    super("Schedule drafts changed elsewhere.");
    this.name = "ScheduleDraftConflictError";
  }
}

async function parseScheduleSummaryResponse(
  response: Response,
): Promise<ScheduleDraftSummaryResponse | null> {
  try {
    return (await response.json()) as ScheduleDraftSummaryResponse;
  } catch {
    return null;
  }
}

function getScheduleDraftSummaryErrorMessage(
  response: Response,
  body: ScheduleDraftSummaryResponse | null,
): string {
  if (response.status === 429) {
    return "Too many schedule review requests. Please wait a moment and try again.";
  }

  if (response.status === 503) {
    return "Schedule review is temporarily unavailable. Please try again.";
  }

  return formatClientErrorMessage(body?.error, "Failed to load schedule draft summary");
}

type CreateShiftSeriesOptions = {
  onProgress?: (progress: number) => void;
  batchSize?: number;
};

function normalizeScheduleCellInput(
  input: ScheduleCellInput,
  extra?: Partial<Pick<ScheduleCellInput, "seriesId" | "fromRecurring">>,
): ScheduleCellInput {
  const seriesId = extra?.seriesId ?? input.seriesId ?? null;
  const fromRecurring = extra?.fromRecurring ?? input.fromRecurring ?? false;

  if (input.kind === "deleted") {
    return {
      kind: "deleted",
      segments: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId,
      fromRecurring,
    };
  }

  if (input.kind === "absence") {
    return {
      kind: "absence",
      segments: [],
      absenceTypeId: input.absenceTypeId ?? null,
      customStartTime: null,
      customEndTime: null,
      seriesId,
      fromRecurring,
    };
  }

  return {
    kind: "worked",
    segments: [...input.segments]
      .sort((left, right) => left.position - right.position)
      .map((segment, index) => ({
        shiftId: segment.shiftId,
        jobId: segment.jobId,
        position: index,
        isMentored: segment.isMentored ?? false,
      })),
    absenceTypeId: null,
    customStartTime: input.customStartTime ?? null,
    customEndTime: input.customEndTime ?? null,
    seriesId,
    fromRecurring,
  };
}

function getWorkedAssignments(input: ScheduleCellInput): Array<{
  shiftId: number | null;
  jobId: number;
}> {
  if (input.kind !== "worked") {
    return [];
  }

  return [...input.segments]
    .sort((left, right) => left.position - right.position)
    .map((segment) => ({
      shiftId: segment.shiftId,
      jobId: segment.jobId,
    }));
}

function buildRecurringStateFromRow(
  row: DbRecurringShift,
): ScheduleCellInput | null {
  return normalizeScheduleCellInput(row.state, {
    seriesId: row.state.seriesId ?? null,
    fromRecurring: row.state.fromRecurring ?? true,
  });
}

function getRecurringInputShiftLabel(
  input: ScheduleCellInput,
  args: {
    absenceTypeLabelMap: Map<number, string>;
    segmentCompatibility: SegmentCompatibilityMaps;
  }
): { label: string; absenceTypeId?: number } | null {
  if (input.kind === "absence") {
    const absenceTypeId = input.absenceTypeId ?? null;
    if (absenceTypeId == null) return null;
    return {
      label: args.absenceTypeLabelMap.get(absenceTypeId) ?? "?",
      absenceTypeId,
    };
  }

  const assignments = getWorkedAssignments(input);
  if (assignments.length === 0) return null;

  const label = joinShiftJobSegmentLabels(
    resolveShiftJobSegments(
      {
        shiftIds: assignments.map((assignment) => assignment.shiftId),
        jobIds: assignments.map((assignment) => assignment.jobId),
      },
      args.segmentCompatibility,
    ),
  );

  return {
    label,
  };
}

async function fetchScheduleCellVersionsForDates(
  orgId: string,
  empId: string,
  dates: string[],
): Promise<Map<string, number>> {
  if (dates.length === 0) return new Map();

  const { data, error } = await supabase
    .from("schedule_cells")
    .select("date, version")
    .eq("org_id", orgId)
    .eq("emp_id", empId)
    .in("date", dates);

  if (error) throw error;

  return new Map(
    ((data ?? []) as Array<{ date: string; version: number }>).map((row) => [
      row.date,
      row.version,
    ]),
  );
}

function cellBlocksRecurringFill(cell: DbScheduleCell): boolean {
  const snapshots = cell.snapshots ?? [];
  const draft = snapshots.find((snapshot) => snapshot.snapshot_kind === "draft");
  if (draft) {
    return draft.state_kind !== "deleted";
  }

  return snapshots.some(
    (snapshot) => snapshot.snapshot_kind === "published",
  );
}

// ── Publish ──────────────────────────────────────────────────────────────────

export async function publishSchedule(
  orgId: string,
  startDate: Date,
  endDate: Date,
  expectedSummary?: DraftBreakdown,
): Promise<DraftBreakdown> {
  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);
  const response = await fetch("/api/shifts/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgId,
      startDate: startKey,
      endDate: endKey,
      expectedSummary,
    }),
  });

  const body = await parseScheduleSummaryResponse(response);

  if (response.status === 409 && body?.summary) {
    throw new ScheduleDraftConflictError(body.summary);
  }

  if (!response.ok || !body?.summary) {
    throw new Error(formatClientErrorMessage(body?.error, "Failed to publish schedule"));
  }

  return body.summary;
}

export async function fetchScheduleDraftSummary(input: {
  orgId: string;
  scope?: "all" | "mine";
  startDate?: string;
  endDate?: string;
}): Promise<DraftBreakdown> {
  const params = new URLSearchParams({ orgId: input.orgId });
  if (input.scope) params.set("scope", input.scope);
  if (input.startDate) params.set("startDate", input.startDate);
  if (input.endDate) params.set("endDate", input.endDate);

  const response = await fetch(`/api/shifts/draft-summary?${params.toString()}`);
  const body = await parseScheduleSummaryResponse(response);

  if (!response.ok || !body?.summary) {
    throw new Error(getScheduleDraftSummaryErrorMessage(response, body));
  }

  return body.summary;
}

/**
 * Fetch publish history entries since a given timestamp (or last 24 hours as fallback).
 * Returns newest-first. An empty array means nothing was published recently.
 */
export async function fetchRecentPublishHistory(
  orgId: string,
  since?: string | null,
): Promise<PublishHistoryEntry[]> {
  const cutoff = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("publish_history")
    .select("id, org_id, published_by, start_date, end_date, change_count, changes, published_at")
    .eq("org_id", orgId)
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((row: any) => ({
    id: row.id,
    publishedBy: row.published_by,
    startDate: row.start_date,
    endDate: row.end_date,
    changeCount: row.change_count,
    changes: row.changes as PublishChange[],
    publishedAt: row.published_at,
  }));
}

/**
 * Returns date ranges that have been published at least once for the given org
 * and date window. Used to gate coverage-gap open shifts so they only appear
 * after the schedule has been published for those dates.
 */
export async function fetchPublishedDateRanges(
  orgId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ startDate: string; endDate: string }[]> {
  const { data, error } = await supabase
    .from("publish_history")
    .select("start_date, end_date")
    .eq("org_id", orgId)
    .lte("start_date", rangeEnd)
    .gte("end_date", rangeStart);
  if (error) throw error;
  if (!data || data.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((row: any) => ({
    startDate: row.start_date,
    endDate: row.end_date,
  }));
}

/**
 * Fire-and-forget: records when the current user last viewed the schedule.
 */
export async function updateScheduleLastViewed(orgId: string): Promise<void> {
  await supabase.rpc("update_schedule_last_viewed", { p_org_id: orgId });
}

/**
 * Returns when the current user last viewed the schedule (ISO string or null).
 */
export async function getScheduleLastViewed(orgId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_schedule_last_viewed", { p_org_id: orgId });
  if (error) throw error;
  return data as string | null;
}

/**
 * Fetch paginated publish history with publisher names resolved.
 */
export async function fetchPublishHistory(
  orgId: string,
  limit = 20,
  offset = 0,
): Promise<PublishHistoryEntryWithName[]> {
  const { data, error } = await supabase.rpc("get_publish_history", {
    p_org_id: orgId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    publishedBy: row.published_by,
    publishedByName: row.published_by_name,
    startDate: row.start_date,
    endDate: row.end_date,
    changeCount: row.change_count,
    changes: row.changes as PublishChange[],
    publishedAt: row.published_at,
  }));
}

export async function discardScheduleDrafts(
  orgId: string,
  userId?: string,
  expectedSummary?: DraftBreakdown,
): Promise<DraftBreakdown> {
  const response = await fetch("/api/shifts/discard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgId,
      scope: userId ? "mine" : "all",
      expectedSummary,
    }),
  });

  const body = await parseScheduleSummaryResponse(response);

  if (response.status === 409 && body?.summary) {
    throw new ScheduleDraftConflictError(body.summary);
  }

  if (!response.ok || !body?.summary) {
    throw new Error(formatClientErrorMessage(body?.error, "Failed to discard schedule drafts"));
  }

  return body.summary;
}

// ── Schedule Notes ───────────────────────────────────────────────────────────

export async function fetchScheduleNotes(orgId: string, startDate?: string, endDate?: string): Promise<ScheduleNote[]> {
  let query = supabase
    .from("schedule_notes")
    .select("id, org_id, emp_id, date, indicator_type_id, focus_area_id, status, created_by, created_at, updated_at")
    .eq("org_id", orgId);
  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  const { data, error } = await query;
  if (error) throw error;

  return (data as DbScheduleNote[]).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    empId: row.emp_id,
    date: row.date,
    indicatorTypeId: row.indicator_type_id,
    focusAreaId: row.focus_area_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertScheduleNote(
  orgId: string,
  empId: string,
  date: string,
  indicatorTypeId: number,
  focusAreaId: number,
  existingStatus?: 'published' | 'draft' | 'draft_deleted',
): Promise<void> {
  let status: 'draft' | 'published' | 'draft_deleted' = 'draft';

  // If we are "adding" a note that was marked for deletion, set it back to published
  if (existingStatus === 'draft_deleted') {
    status = 'published';
  }

  const { error } = await supabase.from("schedule_notes").upsert(
    {
      org_id: orgId,
      emp_id: empId,
      date,
      indicator_type_id: indicatorTypeId,
      focus_area_id: focusAreaId,
      status,
    },
    { onConflict: "emp_id,date,indicator_type_id,focus_area_id" },
  );
  if (error) throw error;
  void logAudit("schedule_note.upserted", "schedule_note", `${empId}_${date}`, { indicatorTypeId, focusAreaId, status }, orgId);
}

export async function deleteScheduleNote(
  orgId: string,
  empId: string,
  date: string,
  indicatorTypeId: number,
  focusAreaId: number,
  existingStatus?: 'published' | 'draft' | 'draft_deleted',
): Promise<void> {
  if (existingStatus === 'draft') {
    // If it was a new draft note, just delete it
    const { error } = await supabase
      .from("schedule_notes")
      .delete()
      .eq("org_id", orgId)
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("indicator_type_id", indicatorTypeId)
      .eq("focus_area_id", focusAreaId);
    if (error) throw error;
  } else {
    // If it was already published, mark it as draft_deleted
    const { error } = await supabase
      .from("schedule_notes")
      .update({ status: 'draft_deleted' })
      .eq("org_id", orgId)
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("indicator_type_id", indicatorTypeId)
      .eq("focus_area_id", focusAreaId);
    if (error) throw error;
  }
  void logAudit("schedule_note.deleted", "schedule_note", `${empId}_${date}`, { indicatorTypeId, focusAreaId, existingStatus }, orgId);
}

// ── Recurring Shifts ─────────────────────────────────────────────────────────

export async function fetchRecurringShifts(
  orgId: string,
  empId?: string,
  assignmentLabelMap?: Map<number, string>,
  includeArchived = false,
  absenceTypeMap?: Map<number, string>,
): Promise<RecurringShift[]> {
  let query = supabase
    .from("recurring_shifts")
    .select(RECURRING_SHIFT_COLS)
    .eq("org_id", orgId)
    .order("day_of_week")
    .order("effective_from", { ascending: false });
  if (!includeArchived) query = query.is("archived_at", null);
  if (empId) query = query.eq("emp_id", empId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const [shiftCategories, jobs] = await Promise.all([
    fetchShiftCategories(orgId, true),
    fetchJobDefinitions(orgId, true),
  ]);
  const segmentCompatibility = createShiftJobCompatibilityMaps(
    {
      shiftCategories,
      jobs,
      shiftDisplayMode: "code",
    },
  );
  return (data as DbRecurringShift[]).map((row) =>
    rowToRecurringShift(
      row,
      assignmentLabelMap ?? new Map(),
      absenceTypeMap,
      segmentCompatibility,
    ),
  );
}

export async function upsertRecurringShift(
  empId: string,
  orgId: string,
  dayOfWeek: number,
  input: ScheduleCellInput,
  effectiveFrom: string,
): Promise<void> {
  const normalizedInput = normalizeScheduleCellInput(input, {
    seriesId: input.seriesId ?? null,
    fromRecurring: true,
  });
  if (normalizedInput.kind === "worked" && normalizedInput.segments.length === 0) {
    throw new Error("Recurring schedules require at least one worked segment");
  }

  // Atomic RPC: archives existing active rows and inserts the new one
  // in a single transaction, preventing template loss on insert failure.
  const { error } = await supabase.rpc("upsert_recurring_shift", {
    p_emp_id: empId,
    p_org_id: orgId,
    p_day_of_week: dayOfWeek,
    p_state: normalizedInput,
    p_effective_from: effectiveFrom,
  });
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("upsert_recurring_shift")) {
      throw new Error("Recurring schedule saves require the latest database migration. Apply the current Supabase migrations and try again.");
    }
    throw new Error(error.message);
  }
  void logAudit(
    "recurring_shift.upserted",
    "recurring_shift",
    empId,
    { dayOfWeek, input: normalizedInput, effectiveFrom },
    orgId,
  );
}

export async function deleteRecurringShift(empId: string, dayOfWeek: number, orgId?: string): Promise<void> {
  let query = supabase
    .from("recurring_shifts")
    .update({ archived_at: new Date().toISOString() })
    .eq("emp_id", empId)
    .eq("day_of_week", dayOfWeek)
    .is("archived_at", null);
  if (orgId) query = query.eq("org_id", orgId);
  const { error } = await query;
  if (error) throw new Error(error.message);
  void logAudit("recurring_shift.deleted", "recurring_shift", empId, { dayOfWeek }, orgId);
}

/**
 * Applies recurring shift templates to a date range as drafts.
 * Reads fresh recurring templates and canonical schedule cell snapshots from the DB
 * so the fill behavior matches the visible grid state.
 */
export async function applyRecurringSchedules(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ empId: string; date: string; label: string; absenceTypeId?: number }[]> {
  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);

  const [{ data: recurringRows, error: recurringError }, { data: existingCells, error: cellError }] = await Promise.all([
    supabase
      .from("recurring_shifts")
      .select(RECURRING_SHIFT_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .lte("effective_from", endKey)
      .or(`effective_until.is.null,effective_until.gte.${startKey}`),
    supabase
      .from("schedule_cells")
      .select(
        "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))",
      )
      .eq("org_id", orgId)
      .gte("date", startKey)
      .lte("date", endKey),
  ]);

  if (recurringError) throw new Error(recurringError.message);
  if (cellError) throw new Error(cellError.message);

  const recurring = (recurringRows ?? []) as DbRecurringShift[];
  const cellsByKey = new Map<string, DbScheduleCell>();
  for (const cell of (existingCells ?? []) as DbScheduleCell[]) {
    cellsByKey.set(`${cell.emp_id}_${cell.date}`, cell);
  }

  const absenceTypeIds = Array.from(
    new Set(
      recurring
        .map((row) =>
          row.state.kind === "absence" ? (row.state.absenceTypeId ?? null) : null,
        )
        .filter((id): id is number => id != null),
    ),
  );
  const [shiftCategories, jobs, { data: absenceRows, error: absenceError }] = await Promise.all([
    fetchShiftCategories(orgId, true),
    fetchJobDefinitions(orgId, true),
    absenceTypeIds.length > 0
      ? supabase.from("absence_types").select("id, name").in("id", absenceTypeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (absenceError) throw new Error(absenceError.message);

  const segmentCompatibility = createShiftJobCompatibilityMaps({
    shiftCategories,
    jobs,
    shiftDisplayMode: "code",
  });
  const absenceTypeLabelMap = new Map(
    ((absenceRows ?? []) as Array<{ id: number; name: string }>).map((row) => [
      row.id,
      row.name,
    ]),
  );

  const templatesByEmpAndDay = new Map<string, DbRecurringShift>();
  for (const row of recurring) {
    const key = `${row.emp_id}_${row.day_of_week}`;
    const current = templatesByEmpAndDay.get(key);
    if (!current || row.effective_from > current.effective_from) {
      templatesByEmpAndDay.set(key, row);
    }
  }

  const generated: { empId: string; date: string; label: string; absenceTypeId?: number }[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateKey = formatDateKey(current);
    const dayOfWeek = current.getDay();

    for (const template of templatesByEmpAndDay.values()) {
      if (template.day_of_week !== dayOfWeek) continue;
      if (template.effective_from > dateKey) continue;
      if (template.effective_until != null && template.effective_until < dateKey) continue;

      const cellKey = `${template.emp_id}_${dateKey}`;
      const existingCell = cellsByKey.get(cellKey);
      if (existingCell && cellBlocksRecurringFill(existingCell)) {
        continue;
      }

      const input = buildRecurringStateFromRow(template);

      if (!input) continue;

      await upsertShift(
        template.emp_id,
        dateKey,
        input,
        orgId,
        existingCell?.version,
      );

      const resolvedLabel = getRecurringInputShiftLabel(input, {
        absenceTypeLabelMap,
        segmentCompatibility,
      });
      if (resolvedLabel) {
        generated.push({
          empId: template.emp_id,
          date: dateKey,
          label: resolvedLabel.label,
          absenceTypeId: resolvedLabel.absenceTypeId,
        });
      }

      cellsByKey.set(cellKey, {
        ...(existingCell ?? {
          id: crypto.randomUUID(),
          emp_id: template.emp_id,
          date: dateKey,
          org_id: orgId,
          version: 0,
          series_id: null,
          from_recurring: true,
          created_by: null,
          updated_by: null,
          created_at: null,
          updated_at: null,
        }),
        version: existingCell?.version ?? 0,
        from_recurring: true,
        snapshots: [
          {
            id: crypto.randomUUID(),
            cell_id: existingCell?.id ?? crypto.randomUUID(),
            org_id: orgId,
            snapshot_kind: "draft",
            state_kind: input.kind,
            absence_type_id: input.kind === "absence" ? input.absenceTypeId : null,
            custom_start_time: null,
            custom_end_time: null,
            segments:
              input.kind === "worked"
                ? input.segments.map((segment) => ({
                    id: crypto.randomUUID(),
                    snapshot_id: crypto.randomUUID(),
                    org_id: orgId,
                    position: segment.position,
                    shift_id: segment.shiftId,
                    job_id: segment.jobId,
                    is_mentored: segment.isMentored ?? false,
                  }))
                : [],
          },
        ],
      });
    }

    current.setDate(current.getDate() + 1);
  }

  void logAudit("recurring_schedule.applied", "recurring_shift", null, {
    startDate: startKey,
    endDate: endKey,
    count: generated.length,
  }, orgId);
  return generated;
}

// ── Recurring Shifts Draft Sessions ───────────────────────────────────────────

export async function getRecurringDraft(orgId: string, userId: string): Promise<RecurringDraft | null> {
  const { data, error } = await supabase
    .from("recurring_shifts_draft_sessions")
    .select("id, org_id, saved_by, draft_data, saved_at")
    .eq("org_id", orgId)
    .eq("saved_by", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    orgId: data.org_id,
    savedBy: data.saved_by,
    draftData: data.draft_data as RecurringScheduleDraft,
    savedAt: data.saved_at,
  };
}

export async function saveRecurringDraft(
  orgId: string,
  savedBy: string,
  draftData: RecurringScheduleDraft,
): Promise<void> {
  const { data: existing } = await supabase
    .from("recurring_shifts_draft_sessions")
    .select("id")
    .eq("org_id", orgId)
    .eq("saved_by", savedBy)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("recurring_shifts_draft_sessions")
      .update({
        saved_by: savedBy,
        draft_data: draftData,
        saved_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("recurring_shifts_draft_sessions")
      .insert({
        org_id: orgId,
        saved_by: savedBy,
        draft_data: draftData,
        saved_at: new Date().toISOString(),
      });
    if (error) throw error;
  }
}

export async function deleteRecurringDraft(orgId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_shifts_draft_sessions")
    .delete()
    .eq("org_id", orgId)
    .eq("saved_by", userId);
  if (error) throw error;
}

// ── Shift Series ──────────────────────────────────────────────────────────────

export async function createShiftSeries(
  empId: string,
  orgId: string,
  input: ScheduleCellInput,
  shiftLabel: string,
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
  options?: CreateShiftSeriesOptions,
): Promise<ShiftSeries> {
  // Pre-generate the UUID so we can link occurrence rows without needing RETURNING.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const normalizedInput = normalizeScheduleCellInput(input, {
    seriesId: id,
    fromRecurring: false,
  });
  const isAbsence = normalizedInput.kind === "absence";
  const reportProgress = options?.onProgress;
  const workedAssignments = getWorkedAssignments(normalizedInput);

  if (isAbsence && (normalizedInput.absenceTypeId ?? null) == null) {
    throw new Error("Shift series requires an absence type");
  }
  if (!isAbsence && workedAssignments.length === 0) {
    throw new Error("Shift series requires at least one worked segment");
  }

  reportProgress?.(5);

  // 1. Create the series master record
  const { error } = await supabase
    .from("shift_series")
    .insert({
      id,
      emp_id: empId,
      org_id: orgId,
      state: normalizedInput,
      frequency,
      days_of_week: daysOfWeek,
      start_date: startDate,
      end_date: endDate,
      max_occurrences: maxOccurrences,
    });
  if (error) throw new Error(error.message);

  // 2. Generate and upsert occurrence rows
  const dates = generateSeriesDates(frequency, daysOfWeek, startDate, endDate, maxOccurrences);
  reportProgress?.(dates.length > 0 ? 15 : 100);
  if (dates.length > 0) {
    const batchSize = options?.batchSize ?? SHIFT_SERIES_UPSERT_BATCH_SIZE;

    const existingVersions = await fetchScheduleCellVersionsForDates(orgId, empId, dates);
    const baseInput = normalizedInput;

    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = dates.slice(i, i + batchSize);
      await Promise.all(
        batch.map((date) =>
          upsertShift(
            empId,
            date,
            baseInput,
            orgId,
            existingVersions.get(date),
          ),
        ),
      );

      const inserted = Math.min(dates.length, i + batch.length);
      reportProgress?.(15 + Math.round((inserted / dates.length) * 85));
    }
  }

  void logAudit(
    "shift_series.created",
    "shift_series",
    id,
    { empId, input, frequency, startDate, endDate, occurrences: dates.length },
    orgId,
  );

  // 3. Return a constructed ShiftSeries
  return {
    id,
    empId,
    orgId,
    input: {
      ...normalizedInput,
    },
    state: normalizedInput,
    presentation: null,
    absenceTypeId: isAbsence ? (normalizedInput.absenceTypeId ?? null) : null,
    shiftLabel,
    frequency,
    daysOfWeek,
    startDate,
    endDate,
    maxOccurrences,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates the draft snapshot for every schedule cell in a series (bulk edit all).
 */
export async function updateSeriesAllShifts(
  seriesId: string,
  input: ScheduleCellInput,
  orgId: string,
): Promise<void> {
  const normalizedInput = normalizeScheduleCellInput(input, {
    seriesId,
    fromRecurring: false,
  });
  if (normalizedInput.kind === "worked" && normalizedInput.segments.length === 0) {
    throw new Error("Series updates require at least one worked segment");
  }

  const { data: cells, error: cellError } = await supabase
    .from("schedule_cells")
    .select("emp_id, date, version")
    .eq("org_id", orgId)
    .eq("series_id", seriesId);
  if (cellError) throw new Error(cellError.message);

  const nextInput = normalizedInput;

  for (const cell of (cells ?? []) as Array<{ emp_id: string; date: string; version: number }>) {
    await upsertShift(cell.emp_id, cell.date, nextInput, orgId, cell.version);
  }

  const { error } = await supabase
    .from("shift_series")
    .update({
      state: nextInput,
    })
    .eq("org_id", orgId)
    .eq("id", seriesId);
  if (error) throw new Error(error.message);
  void logAudit("shift_series.updated", "shift_series", seriesId, { input: nextInput }, orgId);
}

/**
 * Deletes all schedule cells in a series by writing draft deleted snapshots.
 * Also archives the series master record (soft-delete).
 */
export async function deleteShiftSeries(seriesId: string, orgId: string): Promise<number> {
  const { data: cells, error: cellError } = await supabase
    .from("schedule_cells")
    .select("emp_id, date, version")
    .eq("org_id", orgId)
    .eq("series_id", seriesId);
  if (cellError) throw new Error(cellError.message);

  const typedCells = (cells ?? []) as Array<{ emp_id: string; date: string; version: number }>;
  for (const cell of typedCells) {
    await deleteShift(cell.emp_id, cell.date, orgId, cell.version);
  }

  const { error } = await supabase
    .from("shift_series")
    .update({
      archived_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("id", seriesId);
  if (error) throw new Error(error.message);

  const { error: clearSeriesError } = await supabase
    .from("schedule_cells")
    .update({ series_id: null })
    .eq("org_id", orgId)
    .eq("series_id", seriesId);
  if (clearSeriesError) throw new Error(clearSeriesError.message);

  const deletedCount = typedCells.length;
  void logAudit("shift_series.archived", "shift_series", seriesId, { shiftsAffected: deletedCount }, orgId);
  return deletedCount;
}
