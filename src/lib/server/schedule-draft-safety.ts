import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyPersistedDraftShift,
  hasPublishedShiftContent,
  type DraftBreakdown,
} from "@/lib/draft-utils";
import type { DbShift } from "@/lib/db/types";
import { getServiceClient } from "@/lib/supabase-service";

const DISCARD_DELETE_BATCH_SIZE = 50;
const POSTGREST_UNSAFE = /[(),."\\]/;

type DraftShiftRow = Omit<
  Pick<
    DbShift,
    | "emp_id"
    | "date"
    | "draft_shift_code_ids"
    | "published_shift_code_ids"
    | "draft_absence_type_id"
    | "published_absence_type_id"
    | "draft_is_delete"
    | "draft_custom_start_time"
    | "draft_custom_end_time"
    | "published_custom_start_time"
    | "published_custom_end_time"
    | "version"
  >,
  "version"
> & {
  version?: number;
};

type DraftShiftQueryRow = DraftShiftRow & {
  updated_by?: string | null;
  employees?: Array<{ org_id: string }>;
};

function assertSafeFilterValue(value: string, label: string): void {
  if (POSTGREST_UNSAFE.test(value)) {
    throw new Error(`Unsafe PostgREST filter value for ${label}`);
  }
}

function hasPublishedState(shift: DraftShiftRow): boolean {
  return hasPublishedShiftContent(shift);
}

export function hasResidualDraftState(shift: DraftShiftRow): boolean {
  const draftIds = shift.draft_shift_code_ids ?? [];
  const draftAbsId = shift.draft_absence_type_id ?? null;
  const draftStartTime = shift.draft_custom_start_time ?? null;
  const draftEndTime = shift.draft_custom_end_time ?? null;

  return (
    shift.draft_is_delete
    || draftIds.length > 0
    || draftAbsId != null
    || draftStartTime != null
    || draftEndTime != null
  );
}

export function classifyDraftShift(
  shift: DraftShiftRow,
): "new" | "modified" | "deleted" | null {
  return classifyPersistedDraftShift(shift);
}

export async function fetchScheduleDraftBreakdown(input: {
  orgId: string;
  startDate?: string;
  endDate?: string;
  updatedBy?: string;
  serviceClient?: SupabaseClient;
}): Promise<DraftBreakdown> {
  const serviceClient = input.serviceClient ?? getServiceClient();
  let shiftQuery = serviceClient
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_absence_type_id, published_absence_type_id, draft_is_delete, draft_custom_start_time, draft_custom_end_time, published_custom_start_time, published_custom_end_time, updated_by, employees!inner(org_id)")
    .eq("employees.org_id", input.orgId);

  if (input.startDate) shiftQuery = shiftQuery.gte("date", input.startDate);
  if (input.endDate) shiftQuery = shiftQuery.lte("date", input.endDate);
  if (input.updatedBy) shiftQuery = shiftQuery.eq("updated_by", input.updatedBy);

  const { data: shiftRows, error: shiftError } = await shiftQuery;
  if (shiftError) throw shiftError;

  let noteQuery = serviceClient
    .from("schedule_notes")
    .select("status, updated_by")
    .eq("org_id", input.orgId);

  if (input.startDate) noteQuery = noteQuery.gte("date", input.startDate);
  if (input.endDate) noteQuery = noteQuery.lte("date", input.endDate);
  if (input.updatedBy) noteQuery = noteQuery.eq("updated_by", input.updatedBy);

  const { data: noteRows, error: noteError } = await noteQuery;
  if (noteError) throw noteError;

  let newShifts = 0;
  let modifiedShifts = 0;
  let deletedShifts = 0;

  for (const row of (shiftRows ?? []) as DraftShiftQueryRow[]) {
    const kind = classifyDraftShift(row);
    if (kind === "new") newShifts += 1;
    if (kind === "modified") modifiedShifts += 1;
    if (kind === "deleted") deletedShifts += 1;
  }

  let newNotes = 0;
  let deletedNotes = 0;
  for (const row of noteRows ?? []) {
    if (row.status === "draft") newNotes += 1;
    if (row.status === "draft_deleted") deletedNotes += 1;
  }

  return {
    newShifts,
    modifiedShifts,
    deletedShifts,
    newNotes,
    deletedNotes,
    totalChanges: newShifts + modifiedShifts + deletedShifts + newNotes + deletedNotes,
  };
}

export async function publishScheduleDirect(input: {
  orgId: string;
  startDate: string;
  endDate: string;
  actorId?: string;
  client?: SupabaseClient;
}): Promise<void> {
  const client = input.client ?? getServiceClient();
  const { error } = await client.rpc("publish_schedule", {
    p_org_id: input.orgId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_actor_id: input.actorId ?? null,
  });

  if (error) throw error;
}

export async function discardScheduleDraftsDirect(input: {
  orgId: string;
  userId?: string;
  serviceClient?: SupabaseClient;
}): Promise<void> {
  const serviceClient = input.serviceClient ?? getServiceClient();
  let shiftQuery = serviceClient
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_absence_type_id, published_absence_type_id, draft_is_delete, draft_custom_start_time, draft_custom_end_time, published_custom_start_time, published_custom_end_time, version, updated_by, employees!inner(org_id)")
    .eq("employees.org_id", input.orgId);

  if (input.userId) shiftQuery = shiftQuery.eq("updated_by", input.userId);

  const { data: shifts, error: fetchError } = await shiftQuery;
  if (fetchError) throw fetchError;

  const toUpsert: {
    emp_id: string;
    date: string;
    draft_shift_code_ids: number[];
    published_shift_code_ids: number[];
    draft_absence_type_id: number | null;
    published_absence_type_id: number | null;
    draft_is_delete: boolean;
    draft_custom_start_time: string | null;
    draft_custom_end_time: string | null;
    version: number;
  }[] = [];
  const toDelete: { emp_id: string; date: string }[] = [];

  for (const shift of (shifts ?? []) as DraftShiftQueryRow[]) {
    if (!hasResidualDraftState(shift)) continue;

    const hasPublished = hasPublishedState(shift);
    const pubIds = shift.published_shift_code_ids ?? [];
    const pubAbsId = shift.published_absence_type_id ?? null;
    const pubStartTime = shift.published_custom_start_time ?? null;
    const pubEndTime = shift.published_custom_end_time ?? null;

    if (hasPublished) {
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
        version: (shift.version ?? 0) + 1,
      });
    } else {
      toDelete.push({ emp_id: shift.emp_id, date: shift.date });
    }
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await serviceClient
      .from("shifts")
      .upsert(toUpsert, { onConflict: "emp_id,date" });
    if (upsertError) throw upsertError;
  }

  if (toDelete.length > 0) {
    for (const entry of toDelete) {
      assertSafeFilterValue(entry.emp_id, "emp_id");
      assertSafeFilterValue(entry.date, "date");
    }

    for (let index = 0; index < toDelete.length; index += DISCARD_DELETE_BATCH_SIZE) {
      const batch = toDelete.slice(index, index + DISCARD_DELETE_BATCH_SIZE);
      const orClauses = batch
        .map((entry) => `and(emp_id.eq.${entry.emp_id},date.eq.${entry.date})`)
        .join(",");

      const { error: deleteError } = await serviceClient
        .from("shifts")
        .delete()
        .or(orClauses);
      if (deleteError) throw deleteError;
    }
  }

  let noteDeleteQuery = serviceClient
    .from("schedule_notes")
    .delete()
    .eq("org_id", input.orgId)
    .eq("status", "draft");
  if (input.userId) noteDeleteQuery = noteDeleteQuery.eq("updated_by", input.userId);
  const { error: noteDeleteError } = await noteDeleteQuery;
  if (noteDeleteError) throw noteDeleteError;

  let noteRevertQuery = serviceClient
    .from("schedule_notes")
    .update({ status: "published" })
    .eq("org_id", input.orgId)
    .eq("status", "draft_deleted");
  if (input.userId) noteRevertQuery = noteRevertQuery.eq("updated_by", input.userId);
  const { error: noteRevertError } = await noteRevertQuery;
  if (noteRevertError) throw noteRevertError;
}
