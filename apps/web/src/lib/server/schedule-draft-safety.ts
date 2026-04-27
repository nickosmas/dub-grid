import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftBreakdown } from "@/lib/draft-utils";
import type { DbScheduleCell } from "@/lib/db/types";
import { getServiceClient } from "@/lib/supabase-service";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";

export async function fetchScheduleDraftBreakdown(input: {
  orgId: string;
  startDate?: string;
  endDate?: string;
  updatedBy?: string;
  serviceClient?: SupabaseClient;
}): Promise<DraftBreakdown> {
  const serviceClient = input.serviceClient ?? getServiceClient();
  let scheduleCellQuery = serviceClient
    .from("schedule_cells")
    .select(
      "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, created_at, updated_at))",
    )
    .eq("org_id", input.orgId);

  if (input.startDate) scheduleCellQuery = scheduleCellQuery.gte("date", input.startDate);
  if (input.endDate) scheduleCellQuery = scheduleCellQuery.lte("date", input.endDate);
  if (input.updatedBy) scheduleCellQuery = scheduleCellQuery.eq("updated_by", input.updatedBy);

  const { data: scheduleCellRows, error: scheduleCellError } =
    await scheduleCellQuery;
  if (scheduleCellError) throw scheduleCellError;

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

  for (const row of (scheduleCellRows ?? []) as DbScheduleCell[]) {
    const kind = mapNormalizedScheduleCellRowToScheduleEntry(
      row,
      {
        isScheduler: true,
        assignmentLabelMap: new Map<number, string>(),
        absenceTypeMap: new Map<number, string>(),
      },
    )?.draftKind ?? null;
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
  let scheduleCellQuery = serviceClient
    .from("schedule_cells")
    .select("id, version, snapshots:schedule_cell_snapshots(id, snapshot_kind)")
    .eq("org_id", input.orgId);

  if (input.userId) scheduleCellQuery = scheduleCellQuery.eq("updated_by", input.userId);

  const { data: scheduleCells, error: fetchError } = await scheduleCellQuery;
  if (fetchError) throw fetchError;

  const cells = (scheduleCells ?? []) as Array<{
    id: string;
    version: number;
    snapshots?: Array<{ id: string; snapshot_kind: "draft" | "published" }>;
  }>;

  const draftSnapshotIdsToDelete: string[] = [];
  const cellIdsToDelete: string[] = [];
  const cellsToTouch: Array<{ id: string; version: number }> = [];

  for (const cell of cells) {
    const draftSnapshot = (cell.snapshots ?? []).find((snapshot) => snapshot.snapshot_kind === "draft");
    if (!draftSnapshot) continue;

    const hasPublished = (cell.snapshots ?? []).some((snapshot) => snapshot.snapshot_kind === "published");
    if (hasPublished) {
      draftSnapshotIdsToDelete.push(draftSnapshot.id);
      cellsToTouch.push({ id: cell.id, version: cell.version });
    } else {
      cellIdsToDelete.push(cell.id);
    }
  }

  if (draftSnapshotIdsToDelete.length > 0) {
    const { error: deleteDraftsError } = await serviceClient
      .from("schedule_cell_snapshots")
      .delete()
      .in("id", draftSnapshotIdsToDelete);
    if (deleteDraftsError) throw deleteDraftsError;
  }

  if (cellIdsToDelete.length > 0) {
    const { error: deleteCellsError } = await serviceClient
      .from("schedule_cells")
      .delete()
      .in("id", cellIdsToDelete);
    if (deleteCellsError) throw deleteCellsError;
  }

  for (const cell of cellsToTouch) {
    const { error: touchError } = await serviceClient
      .from("schedule_cells")
      .update({
        version: cell.version + 1,
        updated_by: input.userId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cell.id)
      .eq("version", cell.version);
    if (touchError) throw touchError;
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
