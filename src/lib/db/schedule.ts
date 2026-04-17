import {
  supabase, logAudit, formatDateKey,
  RECURRING_SHIFT_COLS,
} from "./shared";
import type { DbRecurringShift, DbShift, DbScheduleNote, RecurringDraft } from "./types";
import { rowToRecurringShift, generateSeriesDates } from "./mappers";
import type { DraftBreakdown } from "@/lib/draft-utils";
import type {
  ScheduleNote, RecurringShift, ShiftSeries, SeriesFrequency,
  PublishHistoryEntry, PublishHistoryEntryWithName, PublishChange,
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

type CreateShiftSeriesOptions = {
  onProgress?: (progress: number) => void;
  batchSize?: number;
};

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
    throw new Error(body?.error || "Failed to publish schedule");
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
    throw new Error(body?.error || "Failed to load schedule draft summary");
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
    throw new Error(body?.error || "Failed to discard schedule drafts");
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
  shiftCodeMap?: Map<number, string>,
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
  return (data as DbRecurringShift[]).map(r => rowToRecurringShift(r, shiftCodeMap ?? new Map(), absenceTypeMap));
}

export async function upsertRecurringShift(
  empId: string,
  orgId: string,
  dayOfWeek: number,
  shiftCodeId: number | null,
  effectiveFrom: string,
  absenceTypeId?: number | null,
): Promise<void> {
  // Atomic RPC: archives existing active rows and inserts the new one
  // in a single transaction, preventing template loss on insert failure.
  const { error } = await supabase.rpc("upsert_recurring_shift", {
    p_emp_id: empId,
    p_org_id: orgId,
    p_day_of_week: dayOfWeek,
    p_shift_code_id: absenceTypeId != null ? null : (shiftCodeId ?? null),
    p_absence_type_id: absenceTypeId ?? null,
    p_effective_from: effectiveFrom,
  });
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("upsert_recurring_shift")) {
      throw new Error("Recurring schedule saves require the latest database migration. Apply the current Supabase migrations and try again.");
    }
    throw new Error(error.message);
  }
  void logAudit("recurring_shift.upserted", "recurring_shift", empId, { dayOfWeek, shiftCodeId, absenceTypeId, effectiveFrom }, orgId);
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
 * Delegates to the `apply_recurring_schedules` SECURITY DEFINER RPC which:
 * - Checks canApplyRecurringSchedule permission
 * - Uses DST-safe PostgreSQL DATE arithmetic
 * - Reads fresh recurring_shifts + shifts from DB (no stale client data)
 * - Picks most recent template per employee via effectiveFrom DESC
 * - Skips archived shift codes
 */
export async function applyRecurringSchedules(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ empId: string; date: string; label: string; shiftCodeId?: number; absenceTypeId?: number }[]> {
  const { data, error } = await supabase.rpc("apply_recurring_schedules", {
    p_org_id: orgId,
    p_start_date: formatDateKey(startDate),
    p_end_date: formatDateKey(endDate),
  });
  if (error) throw new Error(error.message);
  const shifts = (data?.shifts ?? []) as { empId: string; date: string; label: string; shiftCodeId?: number; absenceTypeId?: number }[];
  void logAudit("recurring_schedule.applied", "recurring_shift", null, { startDate: formatDateKey(startDate), endDate: formatDateKey(endDate), count: shifts.length }, orgId);
  return shifts;
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
    draftData: data.draft_data as Record<string, Record<number, string>>,
    savedAt: data.saved_at,
  };
}

export async function saveRecurringDraft(
  orgId: string,
  savedBy: string,
  draftData: Record<string, Record<number, string>>,
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
  shiftCodeId: number | null,
  shiftLabel: string,
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
  absenceTypeId?: number | null,
  options?: CreateShiftSeriesOptions,
): Promise<ShiftSeries> {
  // Pre-generate the UUID so we can link occurrence rows without needing RETURNING.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const isAbsence = absenceTypeId != null;
  const reportProgress = options?.onProgress;

  reportProgress?.(5);

  // 1. Create the series master record
  const { error } = await supabase
    .from("shift_series")
    .insert({
      id,
      emp_id: empId,
      org_id: orgId,
      shift_code_id: isAbsence ? null : shiftCodeId,
      absence_type_id: isAbsence ? absenceTypeId : null,
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
    const rows = dates.map(date => ({
      emp_id: empId,
      date,
      draft_shift_code_ids: isAbsence ? [] : [shiftCodeId!],
      draft_absence_type_id: isAbsence ? absenceTypeId : null,
      draft_is_delete: false,
      org_id: orgId,
      series_id: id,
    }));
    const batchSize = options?.batchSize ?? SHIFT_SERIES_UPSERT_BATCH_SIZE;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from("shifts")
        .upsert(batch, { onConflict: "emp_id,date" });
      if (insertError) throw new Error(insertError.message);

      const inserted = Math.min(rows.length, i + batch.length);
      reportProgress?.(15 + Math.round((inserted / rows.length) * 85));
    }
  }

  void logAudit("shift_series.created", "shift_series", id, { empId, shiftCodeId, absenceTypeId, frequency, startDate, endDate, occurrences: dates.length }, orgId);

  // 3. Return a constructed ShiftSeries
  return {
    id,
    empId,
    orgId,
    shiftCodeId: isAbsence ? null : shiftCodeId,
    absenceTypeId: isAbsence ? absenceTypeId : null,
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
 * Updates draft_shift_code_ids (or draft_absence_type_id) for all shifts in a series (bulk edit all).
 */
export async function updateSeriesAllShifts(
  seriesId: string,
  newShiftCodeId: number | null,
  orgId: string,
  newAbsenceTypeId?: number | null,
): Promise<void> {
  const { error } = await supabase.rpc("update_series_all_shifts", {
    p_series_id: seriesId,
    p_new_shift_code_id: newShiftCodeId,
    p_org_id: orgId,
    p_new_absence_type_id: newAbsenceTypeId ?? null,
  });
  if (error) throw new Error(error.message);
  void logAudit("shift_series.updated", "shift_series", seriesId, { newShiftCodeId, newAbsenceTypeId }, orgId);
}

/**
 * Deletes all shifts in a series (sets draft_is_delete for all).
 * Also archives the series master record (soft-delete).
 */
export async function deleteShiftSeries(seriesId: string, orgId: string): Promise<number> {
  const { data, error } = await supabase.rpc("delete_shift_series", {
    p_series_id: seriesId,
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);

  const deletedCount = Number(data ?? 0);
  void logAudit("shift_series.archived", "shift_series", seriesId, { shiftsAffected: deletedCount }, orgId);
  return deletedCount;
}
