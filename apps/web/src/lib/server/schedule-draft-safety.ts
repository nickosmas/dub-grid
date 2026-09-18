import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotePublishChangeState } from "@dubgrid/contracts";
import { countShiftsAddedToPublishedEntry, type DraftBreakdown } from "@/lib/draft-utils";
import type { DbScheduleCell } from "@/lib/db/types";
import { fetchAllRows, type PagedQueryResult } from "@/lib/db/shared";
import { getServiceClient } from "@/lib/supabase-service";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";

const POSTGREST_MUTATION_BATCH_SIZE = 50;

function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += POSTGREST_MUTATION_BATCH_SIZE) {
    chunks.push(ids.slice(i, i + POSTGREST_MUTATION_BATCH_SIZE));
  }
  return chunks;
}

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
      "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))",
    )
    .eq("org_id", input.orgId);

  if (input.startDate) scheduleCellQuery = scheduleCellQuery.gte("date", input.startDate);
  if (input.endDate) scheduleCellQuery = scheduleCellQuery.lte("date", input.endDate);
  if (input.updatedBy) scheduleCellQuery = scheduleCellQuery.eq("updated_by", input.updatedBy);

  const { data: scheduleCellRows, error: scheduleCellError } = await scheduleCellQuery;
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
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
      isScheduler: true,
      assignmentLabelMap: new Map<number, string>(),
      absenceTypeMap: new Map<number, string>(),
    });
    const kind = entry?.draftKind ?? null;
    if (kind === "new") newShifts += 1;
    if (kind === "modified" && entry) {
      // Same rule as the banner: shifts added beside a published one are new.
      const added = countShiftsAddedToPublishedEntry(entry);
      if (added > 0) newShifts += added;
      else modifiedShifts += 1;
    }
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
}): Promise<string | null> {
  const client = input.client ?? getServiceClient();
  const { data, error } = await client.rpc("publish_schedule", {
    p_org_id: input.orgId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_actor_id: input.actorId ?? null,
  });

  if (error) throw error;
  // The RPC returns the publish_history row it created, which the note-change
  // rows have to hang off.
  return typeof data === "string" ? data : null;
}

/** A note about to be published, read before the publish consumes its draft row. */
export interface PendingNotePublishChange {
  empId: string;
  date: string;
  kind: "new" | "deleted";
  updatedBy: string | null;
  state: NotePublishChangeState;
}

interface PendingNoteRow {
  id: number;
  emp_id: string;
  date: string;
  focus_area_id: number | null;
  indicator_type_id: number;
  status: string;
  updated_by: string | null;
  indicator_types: { name: string | null; color: string | null } | null;
}

/**
 * Reads the note changes a publish is about to commit.
 *
 * Must run BEFORE `publishScheduleDirect`, for the same reason
 * `fetchScheduleDraftBreakdown` does: the RPC promotes draft notes and deletes
 * the ones marked for removal, so afterwards there is nothing left to describe.
 */
export async function fetchPendingNotePublishChanges(input: {
  orgId: string;
  startDate: string;
  endDate: string;
  serviceClient?: SupabaseClient;
}): Promise<PendingNotePublishChange[]> {
  const serviceClient = input.serviceClient ?? getServiceClient();
  // Paged, not capped: a silently truncated read loses the history for every
  // note past the cap, and the publish that consumed them cannot be replayed.
  const buildPage = (from: number, to: number) =>
    serviceClient
      .from("schedule_notes")
      .select(
        "id, emp_id, date, focus_area_id, indicator_type_id, status, updated_by, indicator_types(name, color)",
      )
      .eq("org_id", input.orgId)
      .gte("date", input.startDate)
      .lte("date", input.endDate)
      .in("status", ["draft", "draft_deleted"])
      .order("id", { ascending: true })
      .range(from, to);

  const rows = await fetchAllRows<PendingNoteRow>(
    buildPage as unknown as (
      from: number,
      to: number,
    ) => PromiseLike<PagedQueryResult<PendingNoteRow>>,
  );

  return rows.map((row) => ({
    empId: row.emp_id,
    date: row.date,
    kind: row.status === "draft_deleted" ? ("deleted" as const) : ("new" as const),
    updatedBy: row.updated_by,
    state: {
      type: "note" as const,
      indicatorTypeId: row.indicator_type_id,
      focusAreaId: row.focus_area_id,
      indicatorName: row.indicator_types?.name ?? "Note",
      indicatorColor: row.indicator_types?.color ?? "#94a3b8",
    },
  }));
}

/**
 * Records published note changes against the publish they belong to.
 *
 * This lives here rather than inside `publish_schedule` because an edit to that
 * RPC only reaches a provisioned database through a full reset. The rows reuse
 * the existing `schedule_publish_changes` shape: the note payload sits in the
 * state column its direction implies, and readers tell the two apart by its
 * `type` discriminator.
 */
export async function recordNotePublishChanges(input: {
  orgId: string;
  publishHistoryId: string;
  changes: PendingNotePublishChange[];
  serviceClient?: SupabaseClient;
}): Promise<void> {
  if (input.changes.length === 0) return;
  const serviceClient = input.serviceClient ?? getServiceClient();
  const { error } = await serviceClient.from("schedule_publish_changes").insert(
    input.changes.map((change) => ({
      publish_history_id: input.publishHistoryId,
      org_id: input.orgId,
      emp_id: change.empId,
      date: change.date,
      kind: change.kind,
      from_state: change.kind === "deleted" ? change.state : null,
      to_state: change.kind === "deleted" ? null : change.state,
      updated_by: change.updatedBy,
    })),
  );

  if (error) throw error;
}

/**
 * Deletes draft schedule state. `startDate`/`endDate` bound it to a date range
 * the same way `publishScheduleDirect` bounds a publish — callers that show the
 * user a count for one window must pass that window, or they delete far more
 * than they counted. Omitting both discards every date in the org, which only
 * unattended tooling should ask for.
 */
export async function discardScheduleDraftsDirect(input: {
  orgId: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  serviceClient?: SupabaseClient;
}): Promise<void> {
  const serviceClient = input.serviceClient ?? getServiceClient();
  let scheduleCellQuery = serviceClient
    .from("schedule_cells")
    .select("id, version, snapshots:schedule_cell_snapshots(id, snapshot_kind)")
    .eq("org_id", input.orgId);

  if (input.startDate) scheduleCellQuery = scheduleCellQuery.gte("date", input.startDate);
  if (input.endDate) scheduleCellQuery = scheduleCellQuery.lte("date", input.endDate);
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
    const draftSnapshot = (cell.snapshots ?? []).find(
      (snapshot) => snapshot.snapshot_kind === "draft",
    );
    if (!draftSnapshot) continue;

    const hasPublished = (cell.snapshots ?? []).some(
      (snapshot) => snapshot.snapshot_kind === "published",
    );
    if (hasPublished) {
      draftSnapshotIdsToDelete.push(draftSnapshot.id);
      cellsToTouch.push({ id: cell.id, version: cell.version });
    } else {
      cellIdsToDelete.push(cell.id);
    }
  }

  if (draftSnapshotIdsToDelete.length > 0) {
    for (const batch of chunkIds(draftSnapshotIdsToDelete)) {
      const { error: deleteDraftsError } = await serviceClient
        .from("schedule_cell_snapshots")
        .delete()
        .in("id", batch);
      if (deleteDraftsError) throw deleteDraftsError;
    }
  }

  if (cellIdsToDelete.length > 0) {
    for (const batch of chunkIds(cellIdsToDelete)) {
      const { error: deleteCellsError } = await serviceClient
        .from("schedule_cells")
        .delete()
        .in("id", batch);
      if (deleteCellsError) throw deleteCellsError;
    }
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
  if (input.startDate) noteDeleteQuery = noteDeleteQuery.gte("date", input.startDate);
  if (input.endDate) noteDeleteQuery = noteDeleteQuery.lte("date", input.endDate);
  if (input.userId) noteDeleteQuery = noteDeleteQuery.eq("updated_by", input.userId);
  const { error: noteDeleteError } = await noteDeleteQuery;
  if (noteDeleteError) throw noteDeleteError;

  let noteRevertQuery = serviceClient
    .from("schedule_notes")
    .update({ status: "published" })
    .eq("org_id", input.orgId)
    .eq("status", "draft_deleted");
  if (input.startDate) noteRevertQuery = noteRevertQuery.gte("date", input.startDate);
  if (input.endDate) noteRevertQuery = noteRevertQuery.lte("date", input.endDate);
  if (input.userId) noteRevertQuery = noteRevertQuery.eq("updated_by", input.userId);
  const { error: noteRevertError } = await noteRevertQuery;
  if (noteRevertError) throw noteRevertError;
}
