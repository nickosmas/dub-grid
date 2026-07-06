import {
  supabase, logAudit, formatDateKey,
  fetchAllRows,
} from "./shared";
import type { DbScheduleNote, RecurringDraft } from "./types";
import { generateSeriesDates } from "./mappers";
import { upsertShift, deleteShift } from "./shifts";
import type {
  PublishChange,
  PublishHistoryEntry,
  PublishHistoryEntryWithName,
  RecurringScheduleDraft,
  ScheduleCellInput,
  ScheduleNote,
  SeriesFrequency,
  ShiftSeries,
} from "@/types";

const SHIFT_SERIES_UPSERT_BATCH_SIZE = 25;

/**
 * Run an async task over each item in capped-concurrency batches. Used to turn
 * per-cell schedule writes (each an independent RPC with its own optimistic
 * version) from N sequential round-trips into ceil(N / size) parallel batches,
 * without overwhelming the connection pool. Tasks run left-to-right within the
 * overall ordering; failures reject as soon as a batch settles.
 */
async function runInBatches<T>(
  items: T[],
  size: number,
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(task));
  }
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

// ── Schedule Notes ───────────────────────────────────────────────────────────

export async function fetchScheduleNotes(orgId: string, startDate?: string, endDate?: string): Promise<ScheduleNote[]> {
  const buildPage = (from: number, to: number) => {
    let query = supabase
      .from("schedule_notes")
      .select("id, org_id, emp_id, date, indicator_type_id, focus_area_id, status, created_by, created_at, updated_at")
      .eq("org_id", orgId);
    if (startDate) query = query.gte("date", startDate);
    if (endDate) query = query.lte("date", endDate);
    return query
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  };
  // See fetchNormalizedShifts in shifts.ts — an unpaged query here silently
  // truncates at PostgREST's max_rows cap instead of erroring.
  const data = await fetchAllRows<DbScheduleNote>(buildPage);

  return data.map((row) => ({
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

  const typedCells = (cells ?? []) as Array<{ emp_id: string; date: string; version: number }>;
  await runInBatches(typedCells, SHIFT_SERIES_UPSERT_BATCH_SIZE, (cell) =>
    upsertShift(cell.emp_id, cell.date, nextInput, orgId, cell.version),
  );

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
  await runInBatches(typedCells, SHIFT_SERIES_UPSERT_BATCH_SIZE, (cell) =>
    deleteShift(cell.emp_id, cell.date, orgId, cell.version),
  );

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
