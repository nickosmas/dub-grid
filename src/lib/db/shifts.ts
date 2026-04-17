import {
  supabase, OptimisticLockError, resolveCodeLabels, logAudit,
} from "./shared";
import type { DbShift } from "./types";
import { classifyPersistedDraftShift } from "@/lib/draft-utils";
import type { ShiftMap, DraftKind } from "@/types";

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
  shiftCodeMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
): Promise<ShiftMap> {
  assertDateRange(startDate, endDate);
  // Intentionally does NOT filter employees.archived_at — historical shifts for
  // terminated employees must remain visible in past schedule views. Write policies
  // (admin_insert_shifts, admin_update_shifts) enforce archived_at IS NULL at the
  // RLS layer, so no new shifts can be created for archived employees.
  let query = supabase
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_absence_type_id, published_absence_type_id, draft_is_delete, version, series_id, from_recurring, draft_custom_start_time, draft_custom_end_time, published_custom_start_time, published_custom_end_time, created_by, updated_by, created_at, updated_at, employees!inner(org_id)")
    .eq("employees.org_id", orgId);
  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  const { data, error } = await query;
  if (error) throw error;

  const atMap = absenceTypeMap ?? new Map<number, string>();
  const map: ShiftMap = {};
  for (const row of data as DbShift[]) {
    const draftIds = row.draft_shift_code_ids ?? [];
    const pubIds = row.published_shift_code_ids ?? [];
    const draftAbsId = row.draft_absence_type_id ?? null;
    const pubAbsId = row.published_absence_type_id ?? null;
    const draftStartTime = row.draft_custom_start_time ?? null;
    const draftEndTime = row.draft_custom_end_time ?? null;
    const pubStartTime = row.published_custom_start_time ?? null;
    const pubEndTime = row.published_custom_end_time ?? null;
    const hasTimeDraft = draftStartTime != null || draftEndTime != null;
    const hasDraft = draftIds.length > 0 || draftAbsId != null || row.draft_is_delete || hasTimeDraft;

    // Schedulers see draft preferentially. Staff only see published.
    const effectiveIds = isScheduler
      ? (hasDraft ? draftIds : pubIds)
      : pubIds;
    const effectiveAbsId = isScheduler
      ? (hasDraft ? draftAbsId : pubAbsId)
      : pubAbsId;
    const effectiveStartTime = isScheduler
      ? (draftStartTime ?? pubStartTime)
      : pubStartTime;
    const effectiveEndTime = isScheduler
      ? (draftEndTime ?? pubEndTime)
      : pubEndTime;
    const draftKind: DraftKind = classifyPersistedDraftShift(row);
    const isDraft = draftKind !== null;

    const publishedLabel = pubAbsId != null
      ? (atMap.get(pubAbsId) ?? '?')
      : pubIds.length > 0 ? resolveCodeLabels(pubIds, shiftCodeMap) : '';

    const hasContent =
      effectiveIds.length > 0
      || effectiveAbsId != null
      || (isScheduler && draftKind === "deleted");

    if (hasContent) {
      const label = draftKind === "deleted" && isScheduler
        ? "OFF"
        : effectiveAbsId != null
          ? (atMap.get(effectiveAbsId) ?? '?')
          : resolveCodeLabels(effectiveIds, shiftCodeMap);

      map[`${row.emp_id}_${row.date}`] = {
        label,
        shiftCodeIds: effectiveIds,
        isDraft,
        isDelete: row.draft_is_delete,
        draftKind,
        publishedShiftCodeIds: pubIds,
        publishedLabel,
        absenceTypeId: effectiveAbsId,
        publishedAbsenceTypeId: pubAbsId,
        seriesId: row.series_id ?? null,
        fromRecurring: row.from_recurring ?? false,
        customStartTime: effectiveStartTime,
        customEndTime: effectiveEndTime,
        publishedCustomStartTime: pubStartTime,
        publishedCustomEndTime: pubEndTime,
        version: row.version,
        createdBy: row.created_by ?? null,
        updatedBy: row.updated_by ?? null,
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
      };
    }
  }
  return map;
}

/**
 * Checks if any shift codes in the array have overlapping default time ranges.
 * Returns the first overlapping pair or null if no conflicts.
 * Mirrors the DB trigger logic for immediate client-side feedback.
 */
export async function checkShiftCodeOverlap(
  shiftCodeIds: number[],
): Promise<{ labelA: string; labelB: string } | null> {
  if (shiftCodeIds.length < 2) return null;

  const { data: codes, error } = await supabase
    .from("shift_codes")
    .select("id, label, default_start_time, default_end_time")
    .in("id", shiftCodeIds);

  if (error || !codes) return null;

  // Convert TIME string "HH:MM:SS" to minutes from midnight
  function toMinutes(time: string | null): number | null {
    if (!time) return null;
    const parts = time.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  const parsed = codes
    .map((c: { id: number; label: string; default_start_time: string | null; default_end_time: string | null }) => ({
      id: c.id,
      label: c.label,
      start: toMinutes(c.default_start_time),
      end: toMinutes(c.default_end_time),
    }))
    .filter((c: { start: number | null; end: number | null }) => c.start !== null && c.end !== null);

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
  shiftCodeIds: number[],
  orgId: string,
  customStartTime?: string | null,
  customEndTime?: string | null,
  expectedVersion?: number,
  absenceTypeId?: number | null,
): Promise<void> {
  // Client-side overlap check for immediate feedback
  if (shiftCodeIds.length >= 2 && absenceTypeId == null) {
    const overlap = await checkShiftCodeOverlap(shiftCodeIds);
    if (overlap) {
      throw new Error(
        `Shift codes "${overlap.labelA}" and "${overlap.labelB}" have overlapping time ranges`,
      );
    }
  }

  const payload: Record<string, unknown> = {
    emp_id: empId,
    date,
    org_id: orgId,
    draft_shift_code_ids: absenceTypeId != null ? [] : shiftCodeIds,
    draft_absence_type_id: absenceTypeId ?? null,
    draft_is_delete: false,
  };
  if (customStartTime !== undefined) payload.draft_custom_start_time = customStartTime;
  if (customEndTime !== undefined) payload.draft_custom_end_time = customEndTime;

  if (expectedVersion !== undefined) {
    // Existing shift: use update with optimistic lock
    payload.version = expectedVersion + 1;
    const { data, error } = await supabase
      .from("shifts")
      .update(payload)
      .eq("org_id", orgId)
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("version", expectedVersion)
      .select("version")
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        const { data: currentShift } = await supabase
          .from("shifts")
          .select("version")
          .eq("emp_id", empId)
          .eq("date", date)
          .single();
        throw new OptimisticLockError(
          `${empId}:${date}`,
          expectedVersion,
          currentShift?.version,
        );
      }
      throw error;
    }
    if (!data) {
      throw new OptimisticLockError(`${empId}:${date}`, expectedVersion);
    }
  } else {
    // New shift: insert only — do NOT upsert, to avoid silently overwriting
    // a concurrent insert by another user without incrementing the version.
    const { error } = await supabase
      .from("shifts")
      .insert(payload);
    if (error) {
      // 23505 = unique_violation (row already exists from a concurrent insert)
      if (error.code === "23505") {
        throw new OptimisticLockError(`${empId}:${date}`, 0);
      }
      throw error;
    }
  }
  const action = expectedVersion !== undefined ? "shift.updated" : "shift.created";
  void logAudit(action, "shift", `${empId}:${date}`, { shiftCodeIds, absenceTypeId }, orgId);
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
  const payload: Record<string, unknown> = {
    emp_id: empId,
    date,
    org_id: orgId,
    draft_custom_start_time: customStartTime,
    draft_custom_end_time: customEndTime,
  };

  if (expectedVersion !== undefined) {
    payload.version = expectedVersion + 1;
    const { data, error } = await supabase
      .from("shifts")
      .update(payload)
      .eq("org_id", orgId)
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("version", expectedVersion)
      .select("version")
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        const { data: currentShift } = await supabase
          .from("shifts")
          .select("version")
          .eq("org_id", orgId)
          .eq("emp_id", empId)
          .eq("date", date)
          .single();
        throw new OptimisticLockError(
          `${empId}:${date}`,
          expectedVersion,
          currentShift?.version,
        );
      }
      throw error;
    }
    if (!data) {
      throw new OptimisticLockError(`${empId}:${date}`, expectedVersion);
    }
  } else {
    const { error } = await supabase
      .from("shifts")
      .upsert(payload, { onConflict: "emp_id,date" });
    if (error) throw error;
  }
}

export async function deleteShift(empId: string, date: string, orgId: string, expectedVersion?: number): Promise<void> {
  // Soft delete: set draft_is_delete so the publish RPC knows to clear it.
  // Uses update (not upsert) to avoid creating orphaned rows when no shift exists.
  const payload: Record<string, unknown> = {
    draft_shift_code_ids: [],
    draft_absence_type_id: null,
    draft_is_delete: true,
  };

  if (expectedVersion !== undefined) {
    payload.version = expectedVersion + 1;
    const { data, error } = await supabase
      .from("shifts")
      .update(payload)
      .eq("org_id", orgId)
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("version", expectedVersion)
      .select("version")
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        const { data: currentShift } = await supabase
          .from("shifts")
          .select("version")
          .eq("org_id", orgId)
          .eq("emp_id", empId)
          .eq("date", date)
          .single();
        throw new OptimisticLockError(
          `${empId}:${date}`,
          expectedVersion,
          currentShift?.version,
        );
      }
      throw error;
    }
    if (!data) {
      throw new OptimisticLockError(`${empId}:${date}`, expectedVersion);
    }
  } else {
    const { error } = await supabase
      .from("shifts")
      .update(payload)
      .eq("org_id", orgId)
      .eq("emp_id", empId)
      .eq("date", date);
    if (error) throw error;
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
  shiftCodeIds: number[],
  absenceTypeId?: number | null,
  dragMode: "move" | "copy" = "move",
  expectedVersion?: number,
): Promise<void> {
  const { error } = await supabase.rpc("move_shift", {
    p_org_id: orgId,
    p_source_emp_id: sourceEmpId,
    p_source_date: sourceDate,
    p_target_emp_id: targetEmpId,
    p_target_date: targetDate,
    p_shift_code_ids: shiftCodeIds,
    p_absence_type_id: absenceTypeId ?? null,
    p_drag_mode: dragMode,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) {
    if (error.message?.includes("Optimistic lock failed")) {
      throw new OptimisticLockError(
        `${sourceEmpId}:${sourceDate}`,
        expectedVersion ?? 0,
      );
    }
    throw error;
  }
  void logAudit("shift.moved", "shift", `${sourceEmpId}:${sourceDate}`, {
    targetEmpId,
    targetDate,
    shiftCodeIds,
    absenceTypeId: absenceTypeId ?? null,
    dragMode,
  }, orgId);
}
