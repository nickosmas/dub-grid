import {
  supabase, logAudit, formatDateKey, arraysEqual, assertSafeFilterValue,
  RECURRING_SHIFT_COLS,
} from "./shared";
import type { DbRecurringShift, DbShift, DbScheduleNote, RecurringDraft } from "./types";
import { rowToRecurringShift, generateSeriesDates } from "./mappers";
import type {
  ScheduleNote, RecurringShift, ShiftSeries, SeriesFrequency,
  PublishHistoryEntry, PublishHistoryEntryWithName, PublishChange,
} from "@/types";

// ── Publish ──────────────────────────────────────────────────────────────────

export async function publishSchedule(
  orgId: string,
  startDate: Date,
  endDate: Date
): Promise<string | null> {
  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);
  const { data, error } = await supabase.rpc("publish_schedule", {
    p_org_id: orgId,
    p_start_date: startKey,
    p_end_date: endKey,
  });
  if (error) throw error;
  void logAudit("schedule.published", "schedule", orgId, {
    startDate: startKey,
    endDate: endKey,
  }, orgId);
  return data as string | null;
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
): Promise<void> {
  // 1. Fetch shifts — scoped to this user if userId provided, otherwise all org drafts
  let query = supabase
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_absence_type_id, published_absence_type_id, draft_is_delete, draft_custom_start_time, draft_custom_end_time, published_custom_start_time, published_custom_end_time, employees!inner(org_id)")
    .eq("employees.org_id", orgId);
  if (userId) query = query.eq("updated_by", userId);
  const { data: shifts, error: fetchError } = await query;

  if (fetchError) throw fetchError;
  if (!shifts || shifts.length === 0) return;

  // 2. Identify which rows need updating or deleting
  const toUpsert: { emp_id: string; date: string; draft_shift_code_ids: number[]; published_shift_code_ids: number[]; draft_absence_type_id: number | null; published_absence_type_id: number | null; draft_is_delete: boolean; draft_custom_start_time: string | null; draft_custom_end_time: string | null }[] = [];
  const toDelete: { emp_id: string; date: string }[] = [];

  for (const shift of shifts as DbShift[]) {
    const draftIds = shift.draft_shift_code_ids ?? [];
    const pubIds = shift.published_shift_code_ids ?? [];
    const draftAbsId = shift.draft_absence_type_id ?? null;
    const pubAbsId = shift.published_absence_type_id ?? null;
    const draftStartTime = shift.draft_custom_start_time ?? null;
    const draftEndTime = shift.draft_custom_end_time ?? null;
    const pubStartTime = shift.published_custom_start_time ?? null;
    const pubEndTime = shift.published_custom_end_time ?? null;
    const hasDraftChange = shift.draft_is_delete ||
      (draftIds.length > 0 && !arraysEqual(draftIds, pubIds)) ||
      (draftAbsId != null && draftAbsId !== pubAbsId) ||
      (draftStartTime != null && draftStartTime !== pubStartTime) ||
      (draftEndTime != null && draftEndTime !== pubEndTime);

    if (hasDraftChange) {
      if (pubIds.length > 0 || pubAbsId != null) {
        // Was edited from an existing published shift, restore the original
        toUpsert.push({
          emp_id: shift.emp_id,
          date: shift.date,
          draft_shift_code_ids: pubIds,
          published_shift_code_ids: pubIds,
          draft_absence_type_id: pubAbsId,
          published_absence_type_id: pubAbsId,
          draft_is_delete: false,
          draft_custom_start_time: pubStartTime,
          draft_custom_end_time: pubEndTime,
        });
      } else {
        // Was created as a draft but never published
        toDelete.push({ emp_id: shift.emp_id, date: shift.date });
      }
    }
  }

  // 3. Execute bulk operations
  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("shifts")
      .upsert(toUpsert, { onConflict: "emp_id,date" });
    if (upsertError) throw upsertError;
  }

  if (toDelete.length > 0) {
    for (const d of toDelete) {
      assertSafeFilterValue(d.emp_id, "emp_id");
      assertSafeFilterValue(d.date, "date");
    }
    const orClauses = toDelete.map(d => `and(emp_id.eq.${d.emp_id},date.eq.${d.date})`).join(",");
    const { error: deleteError } = await supabase
      .from("shifts")
      .delete()
      .or(orClauses);
    if (deleteError) throw deleteError;
  }

  // 4. Handle Schedule Notes Drafts
  let noteDeleteQuery = supabase
    .from("schedule_notes")
    .delete()
    .eq("org_id", orgId)
    .eq("status", "draft");
  if (userId) noteDeleteQuery = noteDeleteQuery.eq("updated_by", userId);
  const { error: noteDeleteError } = await noteDeleteQuery;

  if (noteDeleteError) throw noteDeleteError;

  let noteRevertQuery = supabase
    .from("schedule_notes")
    .update({ status: "published" })
    .eq("org_id", orgId)
    .eq("status", "draft_deleted");
  if (userId) noteRevertQuery = noteRevertQuery.eq("updated_by", userId);
  const { error: noteRevertError } = await noteRevertQuery;

  if (noteRevertError) throw noteRevertError;

  void logAudit("schedule.drafts_discarded", "schedule", null, { shiftsReverted: toUpsert.length, shiftsDeleted: toDelete.length, scope: userId ? "mine" : "all" }, orgId);
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
  if (error) throw new Error(error.message);
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

export async function getRecurringDraft(orgId: string): Promise<RecurringDraft | null> {
  const { data, error } = await supabase
    .from("recurring_shifts_draft_sessions")
    .select("id, org_id, saved_by, draft_data, saved_at")
    .eq("org_id", orgId)
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

export async function deleteRecurringDraft(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_shifts_draft_sessions")
    .delete()
    .eq("org_id", orgId);
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
): Promise<ShiftSeries> {
  // Pre-generate the UUID so we can link occurrence rows without needing RETURNING.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const isAbsence = absenceTypeId != null;

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
    const { error: insertError } = await supabase
      .from("shifts")
      .upsert(rows, { onConflict: "emp_id,date" });
    if (insertError) throw new Error(insertError.message);
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
  const isAbsence = newAbsenceTypeId != null;
  const shiftUpdate = isAbsence
    ? { draft_shift_code_ids: [], draft_absence_type_id: newAbsenceTypeId, draft_is_delete: false }
    : { draft_shift_code_ids: [newShiftCodeId!], draft_absence_type_id: null, draft_is_delete: false };

  const { error } = await supabase
    .from("shifts")
    .update(shiftUpdate)
    .eq("org_id", orgId)
    .eq("series_id", seriesId);
  if (error) throw new Error(error.message);

  const seriesUpdate = isAbsence
    ? { shift_code_id: null, absence_type_id: newAbsenceTypeId }
    : { shift_code_id: newShiftCodeId, absence_type_id: null };

  const { error: seriesError } = await supabase
    .from("shift_series")
    .update(seriesUpdate)
    .eq("org_id", orgId)
    .eq("id", seriesId);
  if (seriesError) throw new Error(seriesError.message);
  void logAudit("shift_series.updated", "shift_series", seriesId, { newShiftCodeId, newAbsenceTypeId }, orgId);
}

/**
 * Deletes all shifts in a series (sets draft_is_delete for all).
 * Also archives the series master record (soft-delete).
 */
export async function deleteShiftSeries(seriesId: string, orgId: string): Promise<number> {
  const { data, error } = await supabase
    .from("shifts")
    .update({ draft_is_delete: true, draft_shift_code_ids: [], series_id: null })
    .eq("org_id", orgId)
    .eq("series_id", seriesId)
    .select("emp_id");
  if (error) throw new Error(error.message);

  const { error: seriesError } = await supabase
    .from("shift_series")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", seriesId);
  if (seriesError) throw new Error(seriesError.message);

  void logAudit("shift_series.archived", "shift_series", seriesId, { shiftsAffected: data?.length ?? 0 }, orgId);
  return data?.length ?? 0;
}
