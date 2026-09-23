import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  DbRecurringShift,
  DbScheduleCell,
  DbScheduleNote,
  DbShiftRequest,
} from "@dubgrid/db-types";
import { API_ERRORS } from "@dubgrid/client-errors";
import { MAX_SERIES_OCCURRENCES } from "@/lib/constants";
import { scheduleCellStateSchema } from "@dubgrid/contracts";
import { requireOrgPermissions, resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiErrorResponse } from "@/lib/error-handling";
import { fetchAssignmentIdByPairMap, fetchAssignmentLabelMap } from "@/app/api/shared/schedule";
import { rowToShiftRequest } from "@/lib/db/mappers";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import { formatDateKey, iterateDateRange } from "@/lib/utils";
import { RECURRING_SHIFT_COLS, fetchAllRows } from "@/lib/db/shared";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import type { AuditAction, AuditResourceType } from "@/lib/audit";
import logger from "@/lib/logger";
import type {
  GridOpenShift,
  ScheduleCellInput,
  ScheduleCellStateEntry,
  ScheduleNote,
  SeriesFrequency,
  ShiftSeries,
  ShiftRequestStatus,
  ShiftRequestType,
} from "@/types";

export const dynamic = "force-dynamic";

/** Fire-and-forget audit log write — never blocks or throws on the hot schedule-edit path. */
function logScheduleAudit(
  serviceClient: SupabaseClient,
  entry: {
    orgId: string;
    actorId: string;
    actorEmail: string | null;
    action: AuditAction;
    resourceType: AuditResourceType;
    resourceId: string | null;
    details: Record<string, unknown>;
  },
): void {
  try {
    void serviceClient
      .from("audit_log")
      .insert({
        org_id: entry.orgId,
        actor_id: entry.actorId,
        actor_email: entry.actorEmail,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        details: entry.details,
      })
      .then(({ error }) => {
        if (error) {
          logger.error({ error, action: entry.action }, "Schedule audit log write failed");
        }
      });
  } catch (error) {
    logger.error({ error, action: entry.action }, "Schedule audit log write failed");
  }
}

const mapEntrySchema = z.array(z.tuple([z.number().int(), z.string()]));
const noteStatusSchema = z.enum(["published", "draft", "draft_deleted"]);
const seriesFrequencySchema = z.enum(["daily", "weekly", "biweekly"]);
const dragModeSchema = z.enum(["move", "copy"]);
const deleteShiftBatchItemSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string().date(),
  expectedVersion: z.number().int().nonnegative().optional(),
});

/**
 * Opt-in on a write: "also hand back the cells you just changed".
 *
 * The caller supplies the same label maps `fetchShifts` takes, because the
 * response entries are built by the identical mapper and have to come out
 * byte-for-byte the same shape. Optional, so a caller that doesn't need the
 * echo (drag/drop, bulk delete) pays nothing for it.
 *
 * This is what lets the shift editor close on the write response instead of
 * blocking on a refetch of the org's whole loaded window.
 */
const cellEchoSchema = z.object({
  isScheduler: z.boolean(),
  assignmentLabels: mapEntrySchema,
  absenceTypeLabels: mapEntrySchema.optional(),
});

const requestActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("fetchShifts"),
    orgId: z.string().uuid(),
    isScheduler: z.boolean(),
    assignmentLabels: mapEntrySchema,
    absenceTypeLabels: mapEntrySchema.optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  }),
  z.object({
    action: z.literal("fetchScheduleNotes"),
    orgId: z.string().uuid(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  }),
  z.object({
    action: z.literal("fetchCalloffOpenShifts"),
    orgId: z.string().uuid(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    assignmentLabels: mapEntrySchema,
  }),
  z.object({
    action: z.literal("getScheduleLastViewed"),
    orgId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("updateScheduleLastViewed"),
    orgId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("upsertShift"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    date: z.string().date(),
    input: scheduleCellStateSchema,
    expectedVersion: z.number().int().nonnegative().optional(),
    echo: cellEchoSchema.optional(),
    /**
     * Set when the write replaces the cell's shift wholesale rather than
     * editing it, which a paste does. An ordinary edit keeps its indicators;
     * a replacement cannot, because they described the shift being displaced.
     */
    clearNotes: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("importPreviousSchedule"),
    orgId: z.string().uuid(),
    sourceStartDate: z.string().date(),
    sourceEndDate: z.string().date(),
    targetStartDate: z.string().date(),
    targetEndDate: z.string().date(),
    dryRun: z.boolean(),
  }),
  z.object({
    action: z.literal("deleteShift"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    date: z.string().date(),
    expectedVersion: z.number().int().nonnegative().optional(),
    echo: cellEchoSchema.optional(),
  }),
  z.object({
    action: z.literal("deleteShifts"),
    orgId: z.string().uuid(),
    shifts: z.array(deleteShiftBatchItemSchema).min(1).max(50),
  }),
  z.object({
    action: z.literal("upsertShiftTimes"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    date: z.string().date(),
    customStartTime: z.string().nullable(),
    customEndTime: z.string().nullable(),
    expectedVersion: z.number().int().nonnegative().optional(),
    echo: cellEchoSchema.optional(),
  }),
  z.object({
    action: z.literal("moveShift"),
    orgId: z.string().uuid(),
    sourceEmpId: z.string().uuid(),
    sourceDate: z.string().date(),
    targetEmpId: z.string().uuid(),
    targetDate: z.string().date(),
    input: scheduleCellStateSchema,
    dragMode: dragModeSchema.optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
    targetExpectedVersion: z.number().int().nonnegative().optional(),
    targetWasEmpty: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("createShiftSeries"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    input: scheduleCellStateSchema,
    shiftLabel: z.string(),
    frequency: seriesFrequencySchema,
    daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable(),
    startDate: z.string().date(),
    endDate: z.string().date().nullable(),
    maxOccurrences: z.number().int().positive().max(MAX_SERIES_OCCURRENCES).nullable(),
  }),
  z.object({
    action: z.literal("updateSeriesAllShifts"),
    orgId: z.string().uuid(),
    seriesId: z.string().uuid(),
    input: scheduleCellStateSchema,
    echoCell: z.object({ employeeId: z.string().uuid(), date: z.string().date() }).optional(),
    echo: cellEchoSchema.optional(),
  }),
  z.object({
    action: z.literal("deleteShiftSeries"),
    orgId: z.string().uuid(),
    seriesId: z.string().uuid(),
    echoCell: z.object({ employeeId: z.string().uuid(), date: z.string().date() }).optional(),
    echo: cellEchoSchema.optional(),
  }),
  z.object({
    action: z.literal("applyRecurringSchedules"),
    orgId: z.string().uuid(),
    startDate: z.string().date(),
    endDate: z.string().date(),
  }),
  z.object({
    action: z.literal("upsertScheduleNote"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    date: z.string().date(),
    indicatorTypeId: z.number().int(),
    focusAreaId: z.number().int(),
    existingStatus: noteStatusSchema.optional(),
  }),
  z.object({
    action: z.literal("deleteScheduleNote"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    date: z.string().date(),
    indicatorTypeId: z.number().int(),
    focusAreaId: z.number().int(),
    existingStatus: noteStatusSchema.optional(),
  }),
]);

const requestSchema = requestActionSchema.refine(
  (data) => {
    if (data.action !== "createShiftSeries" || data.endDate === null) return true;
    const days = (Date.parse(data.endDate) - Date.parse(data.startDate)) / 86_400_000;
    // Allow the slowest supported cadence, one occurrence every two weeks.
    return days >= 0 && days <= MAX_SERIES_OCCURRENCES * 14;
  },
  { path: ["endDate"], message: "Series date range exceeds the supported limit" },
);

const MAX_RANGE_DAYS = 366;

class OptimisticLockConflictError extends Error {
  constructor(
    public readonly shiftId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion?: number,
  ) {
    super("Optimistic lock failed");
  }
}

/**
 * True for the `assert_non_overlapping_work_assignment_times` rejection raised by
 * `write_schedule_cell_snapshot`. Only orgs with `enforce_conflict_prevention` on
 * can hit it, so it is a scheduling rule the admin turned on, not a server fault.
 */
function isOverlapConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("have overlapping time ranges");
}

type ScheduleServiceClient = Extract<
  Awaited<ReturnType<typeof requireOrgPermissions>>,
  { serviceClient: unknown }
>["serviceClient"];

/**
 * Strips the unpublished half of a cell for a caller who may not see drafts.
 *
 * The mapper hands back both snapshots regardless of `isScheduler` (the editor
 * client needs the pair to render a diff), so a viewer's response carried the
 * draft even when `effective` correctly resolved to the published one. Rebuild
 * the draft-derived fields from `published` alone rather than deleting keys, so
 * the entry keeps the shape every consumer already expects.
 */
function redactDraftForViewer(entry: ScheduleCellStateEntry): ScheduleCellStateEntry {
  const published = entry.published ?? null;
  return {
    ...entry,
    draft: null,
    draftKind: null,
    isDraft: false,
    isDelete: false,
    // Both fall back through the draft in buildScheduleCellEntry, so a cell
    // published outside a series but drafted into one would otherwise leak the
    // pending series through these two fields alone.
    seriesId: published?.seriesId ?? null,
    fromRecurring: published?.fromRecurring ?? false,
    createdBy: null,
    updatedBy: null,
  };
}

function assertDateRange(startDate?: string, endDate?: string): void {
  if (!startDate || !endDate) {
    return;
  }

  const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  if (diffMs > MAX_RANGE_DAYS * 86_400_000) {
    throw new Error(`Shift query range exceeds ${MAX_RANGE_DAYS} days`);
  }
}

function sortSegments(input: ScheduleCellInput["segments"]) {
  return [...input].sort((left, right) => left.position - right.position);
}

function normalizeScheduleInput(
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
    segments: sortSegments(input.segments).map((segment, index) => ({
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

function getScheduleCellStorage(input: ScheduleCellInput) {
  if (input.kind === "deleted") {
    return {
      shiftIds: [] as Array<number | null>,
      jobIds: [] as number[],
      isMentoredFlags: [] as boolean[],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
    };
  }

  if (input.kind === "absence") {
    return {
      shiftIds: [] as Array<number | null>,
      jobIds: [] as number[],
      isMentoredFlags: [] as boolean[],
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
    absenceTypeId: null,
    customStartTime: input.customStartTime ?? null,
    customEndTime: input.customEndTime ?? null,
  };
}

async function readCurrentScheduleCellVersion(
  serviceClient: ScheduleServiceClient,
  orgId: string,
  employeeId: string,
  date: string,
): Promise<number | undefined> {
  const { data, error } = await serviceClient
    .from("schedule_cells")
    .select("version")
    .eq("org_id", orgId)
    .eq("emp_id", employeeId)
    .eq("date", date)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data?.version as number | undefined) ?? undefined;
}

async function raiseOptimisticConflict(
  serviceClient: ScheduleServiceClient,
  orgId: string,
  employeeId: string,
  date: string,
  expectedVersion: number,
): Promise<never> {
  throw new OptimisticLockConflictError(
    `${employeeId}:${date}`,
    expectedVersion,
    await readCurrentScheduleCellVersion(serviceClient, orgId, employeeId, date),
  );
}

async function writeShiftSnapshot(
  serviceClient: ScheduleServiceClient,
  input: {
    orgId: string;
    employeeId: string;
    date: string;
    state: ScheduleCellInput;
    expectedVersion?: number;
  },
): Promise<void> {
  if (input.state.kind === "deleted") {
    await deleteShiftSnapshot(serviceClient, input);
    return;
  }

  const state = normalizeScheduleInput(input.state);
  const { shiftIds, jobIds, isMentoredFlags, absenceTypeId, customStartTime, customEndTime } =
    getScheduleCellStorage(state);

  const { error } = await serviceClient.rpc("write_schedule_cell_snapshot", {
    p_org_id: input.orgId,
    p_emp_id: input.employeeId,
    p_date: input.date,
    p_snapshot_kind: "draft",
    p_state_kind: state.kind,
    p_shift_ids: shiftIds,
    p_job_ids: jobIds,
    p_is_mentored_flags: isMentoredFlags,
    p_absence_type_id: absenceTypeId,
    p_custom_start_time: customStartTime,
    p_custom_end_time: customEndTime,
    p_series_id: state.seriesId ?? null,
    p_from_recurring: state.fromRecurring ?? false,
    p_expected_version: input.expectedVersion ?? null,
  });

  if (error) {
    if (error.message?.includes("Optimistic lock failed")) {
      await raiseOptimisticConflict(
        serviceClient,
        input.orgId,
        input.employeeId,
        input.date,
        input.expectedVersion ?? 0,
      );
    }
    throw error;
  }
}

/** The nested select `fetchShifts` uses, so echoed cells map identically. */
const SCHEDULE_CELL_SELECT =
  "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))";

type CellEcho = z.infer<typeof cellEchoSchema>;

/**
 * Reads back the cells a write just touched, in the exact shape `fetchShifts`
 * returns them.
 *
 * This is what lets a caller skip the refetch: it already knows which cells it
 * changed, so it merges these into its map and is done. A key mapping to `null`
 * means the cell no longer has content and should be dropped from the map —
 * the same thing a refetch would have conveyed by the key's absence.
 *
 * One indexed read of at most a handful of rows, versus the whole loaded window.
 */
async function readEchoedCells(
  serviceClient: ScheduleServiceClient,
  orgId: string,
  cells: Array<{ employeeId: string; date: string }>,
  echo: CellEcho,
): Promise<Record<string, unknown | null>> {
  const wanted = new Set(cells.map((cell) => `${cell.employeeId}_${cell.date}`));
  const result: Record<string, unknown | null> = {};
  // Seed every requested key as null so a cell the write emptied is reported
  // as removed rather than silently omitted.
  for (const key of wanted) result[key] = null;

  const { data, error } = await serviceClient
    .from("schedule_cells")
    .select(SCHEDULE_CELL_SELECT)
    .eq("org_id", orgId)
    .in(
      "emp_id",
      cells.map((cell) => cell.employeeId),
    )
    .in(
      "date",
      cells.map((cell) => cell.date),
    );

  if (error) throw error;

  const assignmentIdByPair = await fetchAssignmentIdByPairMap(serviceClient, orgId);
  const assignmentLabelMap = new Map<number, string>(echo.assignmentLabels);
  const absenceTypeMap = new Map<number, string>(echo.absenceTypeLabels ?? []);

  for (const row of (data ?? []) as DbScheduleCell[]) {
    const key = `${row.emp_id}_${row.date}`;
    // The two `.in(...)` filters are a cross product, so a multi-cell echo can
    // return pairs nobody asked for. Keep only the requested ones.
    if (!wanted.has(key)) continue;
    result[key] = mapNormalizedScheduleCellRowToScheduleEntry(row, {
      isScheduler: echo.isScheduler,
      assignmentLabelMap,
      assignmentIdByPair,
      absenceTypeMap,
    });
  }

  return result;
}

/**
 * Builds the write response, echoing changed cells when the caller asked for
 * them. A failure to read them back is non-fatal: the write already committed,
 * and a caller that gets no `cells` falls back to refetching.
 */
async function writeResponse(
  serviceClient: ScheduleServiceClient,
  orgId: string,
  cells: Array<{ employeeId: string; date: string }>,
  echo: CellEcho | undefined,
): Promise<NextResponse> {
  if (!echo) return NextResponse.json({ success: true });

  try {
    const echoed = await readEchoedCells(serviceClient, orgId, cells, echo);
    return NextResponse.json({ success: true, cells: echoed });
  } catch (error) {
    logger.error({ error, orgId }, "Failed to echo changed schedule cells after write");
    return NextResponse.json({ success: true });
  }
}

async function deleteShiftSnapshot(
  serviceClient: ScheduleServiceClient,
  input: {
    orgId: string;
    employeeId: string;
    date: string;
    expectedVersion?: number;
  },
): Promise<void> {
  const { error } = await serviceClient.rpc("delete_schedule_cell_draft", {
    p_org_id: input.orgId,
    p_emp_id: input.employeeId,
    p_date: input.date,
    p_expected_version: input.expectedVersion ?? null,
  });

  if (error) {
    if (error.message?.includes("Optimistic lock failed")) {
      await raiseOptimisticConflict(
        serviceClient,
        input.orgId,
        input.employeeId,
        input.date,
        input.expectedVersion ?? 0,
      );
    }
    throw error;
  }
}

async function fetchScheduleCellSnapshotPayload(
  serviceClient: ScheduleServiceClient,
  orgId: string,
  employeeId: string,
  date: string,
  snapshotKind: "draft" | "published",
) {
  const { data, error } = await serviceClient.rpc("get_schedule_cell_snapshot_payload", {
    p_org_id: orgId,
    p_emp_id: employeeId,
    p_date: date,
    p_snapshot_kind: snapshotKind,
  });
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as Array<{
    version: number;
    focus_area_id: number | null;
    series_id: string | null;
    from_recurring: boolean;
    state_kind: "worked" | "absence" | "deleted";
    shift_ids: Array<number | null>;
    job_ids: number[];
    is_mentored_flags: boolean[];
  }>;
  return rows[0] ?? null;
}

/**
 * An indicator describes a shift, so a cell has to be carrying one before it
 * can be tagged. A draft shift counts: schedulers tag while they build.
 */
async function cellHasWorkedShift(
  serviceClient: ScheduleServiceClient,
  orgId: string,
  employeeId: string,
  date: string,
): Promise<boolean> {
  const [draftPayload, publishedPayload] = await Promise.all([
    fetchScheduleCellSnapshotPayload(serviceClient, orgId, employeeId, date, "draft"),
    fetchScheduleCellSnapshotPayload(serviceClient, orgId, employeeId, date, "published"),
  ]);
  // A draft supersedes the published cell, including a draft that clears it.
  return draftPayload
    ? draftPayload.state_kind === "worked"
    : publishedPayload?.state_kind === "worked";
}

/**
 * Notes cannot outlive the shift they describe, so removing or relocating a
 * cell's shift takes its notes with it. This follows the rule a single note
 * delete uses: a draft row disappears outright, while a published one becomes
 * draft_deleted so the next publish finalises it and discarding drafts
 * restores it. schedule_notes has no foreign key to the cell, so nothing in
 * the database does this for us.
 */
async function clearScheduleNotesForCells(
  serviceClient: ScheduleServiceClient,
  orgId: string,
  cells: Array<{ employeeId: string; date: string }>,
): Promise<void> {
  await Promise.all(
    cells.map(async ({ employeeId, date }) => {
      const { error: draftError } = await serviceClient
        .from("schedule_notes")
        .delete()
        .eq("org_id", orgId)
        .eq("emp_id", employeeId)
        .eq("date", date)
        .eq("status", "draft");
      if (draftError) {
        throw draftError;
      }

      const { error: publishedError } = await serviceClient
        .from("schedule_notes")
        .update({ status: "draft_deleted" })
        .eq("org_id", orgId)
        .eq("emp_id", employeeId)
        .eq("date", date)
        .eq("status", "published");
      if (publishedError) {
        throw publishedError;
      }
    }),
  );
}

function cellBlocksRecurringFill(cell: DbScheduleCell): boolean {
  const snapshots = cell.snapshots ?? [];
  // Any draft blocks the fill, including an explicit delete — a manager who
  // cleared a day shouldn't have it silently resurrected by a later apply.
  const hasDraft = snapshots.some((snapshot) => snapshot.snapshot_kind === "draft");
  if (hasDraft) {
    return true;
  }

  return snapshots.some((snapshot) => snapshot.snapshot_kind === "published");
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const data = parsed.data;

  // Redirect body.orgId to the sandbox if the caller is in sandbox
  // mode, so every downstream `.eq("org_id", data.orgId)` targets the
  // sandbox rather than the unrefreshed-JWT-derived real org.
  // Captured so the switch arms below authorize against the caller this block
  // already verified. requireOrgPermissions otherwise re-runs getUser(), which
  // is a network round trip to Supabase Auth, not a cookie read.
  let actor: User | undefined;
  {
    const auth = await requireAuthenticatedUser(req);
    if (!("response" in auth)) {
      actor = auth.user;
      const effective = await resolveEffectiveOrgId(req, auth.user.id, data.orgId);
      if (effective !== data.orgId) {
        (data as { orgId: string }).orgId = effective;
      }
    }
  }

  try {
    switch (data.action) {
      case "fetchShifts": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewSchedule,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        assertDateRange(data.startDate, data.endDate);
        // Draft visibility is the session's to decide, not the request body's.
        // `isScheduler` arrives from the client, so honouring it let any member
        // of the org read the unpublished schedule just by asking for it.
        const isScheduler = auth.permissions.canEditShifts;
        const assignmentLabelMap = new Map<number, string>(data.assignmentLabels);
        const absenceTypeMap = new Map<number, string>(data.absenceTypeLabels ?? []);
        const assignmentIdByPair = await fetchAssignmentIdByPairMap(auth.serviceClient, data.orgId);

        const buildPage = (from: number, to: number) => {
          let query = auth.serviceClient
            .from("schedule_cells")
            .select(
              "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))",
            )
            .eq("org_id", data.orgId);
          if (data.startDate) {
            query = query.gte("date", data.startDate);
          }
          if (data.endDate) {
            query = query.lte("date", data.endDate);
          }
          return query
            .order("date", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);
        };
        // A single unpaged query here would silently truncate at PostgREST's
        // max_rows cap (200 OK, rows just missing) once an org/date window
        // has more schedule_cells than the configured limit.
        const rows = await fetchAllRows<DbScheduleCell>(buildPage);

        const shifts: Record<string, unknown> = {};
        for (const row of rows) {
          const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
            isScheduler,
            assignmentLabelMap,
            assignmentIdByPair,
            absenceTypeMap,
          });
          if (entry) {
            shifts[`${row.emp_id}_${row.date}`] = isScheduler ? entry : redactDraftForViewer(entry);
          }
        }

        return NextResponse.json({ shifts });
      }

      case "fetchScheduleNotes": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewSchedule,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        const buildNotesPage = (from: number, to: number) => {
          let query = auth.serviceClient
            .from("schedule_notes")
            .select(
              "id, org_id, emp_id, date, indicator_type_id, focus_area_id, status, created_by, updated_by, created_at, updated_at",
            )
            .eq("org_id", data.orgId);
          if (data.startDate) {
            query = query.gte("date", data.startDate);
          }
          if (data.endDate) {
            query = query.lte("date", data.endDate);
          }
          return query
            .order("date", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);
        };
        const noteRows = await fetchAllRows<DbScheduleNote>(buildNotesPage);
        // The service client reads past the row policy, so the same rule is
        // applied here: a viewer never sees a draft note, and a note pending
        // removal is still the published note to them.
        const canSeeDraftNotes = auth.permissions.canEditShifts || auth.permissions.canEditNotes;
        const visibleRows = canSeeDraftNotes
          ? noteRows
          : noteRows.filter((row) => row.status !== "draft");

        return NextResponse.json({
          notes: visibleRows.map((row) => ({
            id: row.id,
            orgId: row.org_id,
            empId: row.emp_id,
            date: row.date,
            indicatorTypeId: row.indicator_type_id,
            focusAreaId: row.focus_area_id,
            status: !canSeeDraftNotes && row.status === "draft_deleted" ? "published" : row.status,
            createdBy: row.created_by,
            updatedBy: row.updated_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        });
      }

      case "fetchCalloffOpenShifts": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewSchedule,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        const { data: rows, error } = await auth.serviceClient
          .from("shift_requests")
          .select(
            `*, requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name, focus_area_ids)`,
          )
          .eq("org_id", data.orgId)
          .eq("type", "pickup")
          .eq("status", "open")
          .not("parent_request_id", "is", null)
          .gte("requester_shift_date", data.startDate)
          .lte("requester_shift_date", data.endDate);
        if (error) {
          throw error;
        }

        const assignmentLabelMap = new Map<number, string>(data.assignmentLabels);
        const assignmentIdByPair = await fetchAssignmentIdByPairMap(auth.serviceClient, data.orgId);

        const openShifts = ((rows ?? []) as Record<string, unknown>[])
          .map((row): GridOpenShift | null => {
            const requester = row.requester as {
              first_name: string;
              last_name: string;
              focus_area_ids: number[];
            } | null;
            const mapped: DbShiftRequest = {
              id: row.id as string,
              org_id: row.org_id as string,
              type: row.type as ShiftRequestType,
              status: row.status as ShiftRequestStatus,
              requester_emp_id: row.requester_emp_id as string,
              requester_shift_date: row.requester_shift_date as string,
              requester_state: row.requester_state as ScheduleCellInput,
              target_emp_id: (row.target_emp_id as string | null) ?? null,
              target_shift_date: (row.target_shift_date as string | null) ?? null,
              target_state: (row.target_state as ScheduleCellInput | null | undefined) ?? null,
              absence_type_id: (row.absence_type_id as number | null) ?? null,
              parent_request_id: (row.parent_request_id as string | null) ?? null,
              admin_user_id: (row.admin_user_id as string | null) ?? null,
              admin_note: (row.admin_note as string | null) ?? null,
              expires_at: row.expires_at as string,
              resolved_at: (row.resolved_at as string | null) ?? null,
              created_at: row.created_at as string,
              updated_at: row.updated_at as string,
              requester_first_name: requester?.first_name,
              requester_last_name: requester?.last_name,
              target_first_name: null,
              target_last_name: null,
            };
            const request = rowToShiftRequest(
              mapped,
              assignmentLabelMap,
              undefined,
              assignmentIdByPair,
            );
            const resolvedFocusAreaId =
              request.requesterFocusAreaId ?? requester?.focus_area_ids?.[0];
            if (resolvedFocusAreaId == null) {
              return null;
            }
            return {
              id: request.id,
              source: "calloff",
              date: request.requesterShiftDate,
              focusAreaId: resolvedFocusAreaId,
              shiftIds: request.requesterShiftIds,
              jobIds: request.requesterJobIds,
              assignmentIds: request.requesterAssignmentDefinitionIds,
              assignmentLabel: request.requesterShiftLabel,
              customStartTime: request.requesterCustomStartTime,
              customEndTime: request.requesterCustomEndTime,
              calledOffBy: request.requesterName || undefined,
              requestId: request.id,
              needed: 1,
            } satisfies GridOpenShift;
          })
          .filter((item): item is GridOpenShift => item != null);

        return NextResponse.json({ openShifts });
      }

      case "getScheduleLastViewed": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewSchedule,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        const { data: value, error } = await auth.userClient.rpc("get_schedule_last_viewed", {
          p_org_id: data.orgId,
        });
        if (error) {
          throw error;
        }

        return NextResponse.json({ lastViewed: (value as string | null) ?? null });
      }

      case "updateScheduleLastViewed": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewSchedule,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        const { error } = await auth.userClient.rpc("update_schedule_last_viewed", {
          p_org_id: data.orgId,
        });
        if (error) {
          throw error;
        }
        return NextResponse.json({ success: true });
      }

      case "upsertShift": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canEditShifts,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        await writeShiftSnapshot(auth.userClient, {
          orgId: data.orgId,
          employeeId: data.employeeId,
          date: data.date,
          state: data.input,
          expectedVersion: data.expectedVersion,
        });
        if (data.clearNotes) {
          await clearScheduleNotesForCells(auth.serviceClient, data.orgId, [
            { employeeId: data.employeeId, date: data.date },
          ]);
        }
        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: data.expectedVersion !== undefined ? "shift.updated" : "shift.created",
          resourceType: "shift",
          resourceId: `${data.employeeId}:${data.date}`,
          details: { input: data.input },
        });
        return writeResponse(
          auth.serviceClient,
          data.orgId,
          [{ employeeId: data.employeeId, date: data.date }],
          data.echo,
        );
      }

      case "importPreviousSchedule": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canEditShifts,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        assertDateRange(data.sourceStartDate, data.sourceEndDate);
        assertDateRange(data.targetStartDate, data.targetEndDate);

        const { data: rows, error } = await auth.userClient.rpc("import_previous_schedule", {
          p_org_id: data.orgId,
          p_source_start: data.sourceStartDate,
          p_source_end: data.sourceEndDate,
          p_target_start: data.targetStartDate,
          p_target_end: data.targetEndDate,
          p_dry_run: data.dryRun,
        });
        if (error) {
          throw error;
        }

        const outcomes = (
          (rows ?? []) as Array<{
            emp_id: string;
            source_date: string;
            target_date: string;
            outcome: string;
            reason: string | null;
          }>
        ).map((row) => ({
          employeeId: row.emp_id,
          sourceDate: row.source_date,
          targetDate: row.target_date,
          outcome: row.outcome,
          reason: row.reason,
        }));

        return NextResponse.json({ success: true, outcomes });
      }

      case "deleteShift": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canEditShifts,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        await deleteShiftSnapshot(auth.userClient, {
          orgId: data.orgId,
          employeeId: data.employeeId,
          date: data.date,
          expectedVersion: data.expectedVersion,
        });
        await clearScheduleNotesForCells(auth.serviceClient, data.orgId, [
          { employeeId: data.employeeId, date: data.date },
        ]);
        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: "shift.deleted",
          resourceType: "shift",
          resourceId: `${data.employeeId}:${data.date}`,
          details: {},
        });
        return writeResponse(
          auth.serviceClient,
          data.orgId,
          [{ employeeId: data.employeeId, date: data.date }],
          data.echo,
        );
      }

      case "deleteShifts": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canEditShifts,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        // Parallel, not sequential. Each delete is its own RPC round trip against
        // a distinct (employee, date) cell, so there is no ordering dependency
        // between them; awaiting one at a time made a bulk delete N serial round
        // trips. A single batched RPC would be better still, but that needs a new
        // database function and the schema is fixed at migrations 001-004.
        //
        // Error semantics do shift slightly: the loop stopped at the first
        // failure, leaving later cells untouched, whereas every delete is now
        // attempted and the first rejection is what surfaces. For a bulk delete
        // that is the friendlier half of the trade, and either way the client
        // sees an optimistic-conflict error and refetches.
        await Promise.all(
          data.shifts.map(async (shift) => {
            await deleteShiftSnapshot(auth.userClient, {
              orgId: data.orgId,
              employeeId: shift.employeeId,
              date: shift.date,
              expectedVersion: shift.expectedVersion,
            });
            await clearScheduleNotesForCells(auth.serviceClient, data.orgId, [
              { employeeId: shift.employeeId, date: shift.date },
            ]);
            logScheduleAudit(auth.serviceClient, {
              orgId: data.orgId,
              actorId: auth.actor.id,
              actorEmail: auth.actor.email ?? null,
              action: "shift.deleted",
              resourceType: "shift",
              resourceId: `${shift.employeeId}:${shift.date}`,
              details: {},
            });
          }),
        );
        return NextResponse.json({ success: true, count: data.shifts.length });
      }

      case "upsertShiftTimes": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canEditShifts,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        // Two independent reads of the same cell — nothing in the published
        // lookup depends on the draft one, so they go together rather than as
        // two serial round trips.
        const [draftPayload, publishedPayload] = await Promise.all([
          fetchScheduleCellSnapshotPayload(
            auth.serviceClient,
            data.orgId,
            data.employeeId,
            data.date,
            "draft",
          ),
          fetchScheduleCellSnapshotPayload(
            auth.serviceClient,
            data.orgId,
            data.employeeId,
            data.date,
            "published",
          ),
        ]);
        const sourcePayload =
          draftPayload?.state_kind === "worked"
            ? draftPayload
            : publishedPayload?.state_kind === "worked"
              ? publishedPayload
              : null;
        if (!sourcePayload) {
          return NextResponse.json(
            { error: "Cannot set custom times without a worked schedule cell" },
            { status: 400 },
          );
        }

        const { error } = await auth.userClient.rpc("write_schedule_cell_snapshot", {
          p_org_id: data.orgId,
          p_emp_id: data.employeeId,
          p_date: data.date,
          p_snapshot_kind: "draft",
          p_state_kind: "worked",
          p_shift_ids: sourcePayload.shift_ids ?? [],
          p_job_ids: sourcePayload.job_ids ?? [],
          p_is_mentored_flags: sourcePayload.is_mentored_flags ?? [],
          p_absence_type_id: null,
          p_custom_start_time: data.customStartTime,
          p_custom_end_time: data.customEndTime,
          p_series_id: sourcePayload.series_id ?? null,
          p_from_recurring: sourcePayload.from_recurring ?? false,
          p_focus_area_id: sourcePayload.focus_area_id ?? null,
          p_expected_version: data.expectedVersion ?? sourcePayload.version ?? 0,
        });
        if (error) {
          if (error.message?.includes("Optimistic lock failed")) {
            await raiseOptimisticConflict(
              auth.serviceClient,
              data.orgId,
              data.employeeId,
              data.date,
              data.expectedVersion ?? sourcePayload.version ?? 0,
            );
          }
          throw error;
        }

        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: "shift.updated",
          resourceType: "shift",
          resourceId: `${data.employeeId}:${data.date}`,
          details: { customStartTime: data.customStartTime, customEndTime: data.customEndTime },
        });
        return writeResponse(
          auth.serviceClient,
          data.orgId,
          [{ employeeId: data.employeeId, date: data.date }],
          data.echo,
        );
      }

      case "moveShift": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canEditShifts,
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        const state = normalizeScheduleInput(data.input);
        const { shiftIds, jobIds, isMentoredFlags, absenceTypeId, customStartTime, customEndTime } =
          getScheduleCellStorage(state);
        const { error } = await auth.userClient.rpc("move_shift", {
          p_org_id: data.orgId,
          p_source_emp_id: data.sourceEmpId,
          p_source_date: data.sourceDate,
          p_target_emp_id: data.targetEmpId,
          p_target_date: data.targetDate,
          p_kind: state.kind,
          p_shift_ids: shiftIds,
          p_job_ids: jobIds,
          p_is_mentored_flags: isMentoredFlags,
          p_absence_type_id: absenceTypeId,
          p_custom_start_time: customStartTime,
          p_custom_end_time: customEndTime,
          p_drag_mode: data.dragMode ?? "move",
          p_expected_version: data.expectedVersion ?? null,
          p_target_expected_version: data.targetExpectedVersion ?? null,
          p_target_was_empty: data.targetWasEmpty ?? false,
        });
        if (error) {
          if (error.message?.includes("Optimistic lock failed")) {
            throw new OptimisticLockConflictError(
              `${data.sourceEmpId}:${data.sourceDate}`,
              data.expectedVersion ?? 0,
            );
          }
          throw error;
        }

        // Indicators describe the shift that was sitting in a cell, so they
        // never travel with it and never outlive it. The target is always
        // cleared: whatever it holds now, it is not the shift its old notes
        // described, and the arriving shift brings none of its own. The source
        // is cleared only when the shift actually leaves it, which a copy does
        // not do. A swap is a move onto an occupied target, so both ends clear.
        // move_shift itself never touches schedule_notes.
        await clearScheduleNotesForCells(auth.serviceClient, data.orgId, [
          ...(data.dragMode === "copy"
            ? []
            : [{ employeeId: data.sourceEmpId, date: data.sourceDate }]),
          { employeeId: data.targetEmpId, date: data.targetDate },
        ]);

        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: "shift.moved",
          resourceType: "shift",
          resourceId: `${data.sourceEmpId}:${data.sourceDate}`,
          details: {
            targetEmpId: data.targetEmpId,
            targetDate: data.targetDate,
            dragMode: data.dragMode ?? "move",
          },
        });
        return NextResponse.json({ success: true });
      }

      case "createShiftSeries": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            (permissions.canEditShifts && permissions.canManageShiftSeries),
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        const requestedId = crypto.randomUUID();
        const now = new Date().toISOString();
        const normalizedInput = normalizeScheduleInput(data.input, {
          seriesId: requestedId,
          fromRecurring: false,
        });

        if (normalizedInput.kind === "absence" && (normalizedInput.absenceTypeId ?? null) == null) {
          return NextResponse.json(
            { error: "Shift series requires an absence type" },
            { status: 400 },
          );
        }
        if (normalizedInput.kind === "worked" && normalizedInput.segments.length === 0) {
          return NextResponse.json(
            { error: "Shift series requires at least one worked segment" },
            { status: 400 },
          );
        }

        const { data: createdSeriesId, error } = await auth.userClient.rpc("create_shift_series", {
          p_series_id: requestedId,
          p_emp_id: data.employeeId,
          p_org_id: data.orgId,
          p_state: normalizedInput,
          p_frequency: data.frequency,
          p_days_of_week: data.daysOfWeek,
          p_start_date: data.startDate,
          p_end_date: data.endDate,
          p_max_occurrences: data.maxOccurrences,
        });
        if (error) {
          throw error;
        }

        const id = typeof createdSeriesId === "string" ? createdSeriesId : requestedId;
        const seriesInput = {
          ...normalizedInput,
          seriesId: id,
        };

        const series: ShiftSeries = {
          id,
          empId: data.employeeId,
          orgId: data.orgId,
          state: seriesInput,
          presentation: null,
          input: seriesInput,
          absenceTypeId:
            seriesInput.kind === "absence" ? (seriesInput.absenceTypeId ?? null) : null,
          shiftLabel: data.shiftLabel,
          frequency: data.frequency as SeriesFrequency,
          daysOfWeek: data.daysOfWeek,
          startDate: data.startDate,
          endDate: data.endDate,
          maxOccurrences: data.maxOccurrences,
          createdAt: now,
          updatedAt: now,
        };

        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: "shift_series.created",
          resourceType: "shift_series",
          resourceId: id,
          details: {
            empId: data.employeeId,
            frequency: data.frequency,
            startDate: data.startDate,
            endDate: data.endDate,
          },
        });

        return NextResponse.json({ series });
      }

      case "updateSeriesAllShifts": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            (permissions.canEditShifts && permissions.canManageShiftSeries),
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        const normalizedInput = normalizeScheduleInput(data.input, {
          seriesId: data.seriesId,
          fromRecurring: false,
        });
        if (normalizedInput.kind === "worked" && normalizedInput.segments.length === 0) {
          return NextResponse.json(
            { error: "Series updates require at least one worked segment" },
            { status: 400 },
          );
        }

        const { error } = await auth.userClient.rpc("update_series_all_shifts", {
          p_series_id: data.seriesId,
          p_org_id: data.orgId,
          p_state: normalizedInput,
        });
        if (error) {
          throw error;
        }

        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: "shift_series.updated",
          resourceType: "shift_series",
          resourceId: data.seriesId,
          details: { input: normalizedInput },
        });
        return writeResponse(
          auth.serviceClient,
          data.orgId,
          data.echoCell ? [data.echoCell] : [],
          data.echoCell ? data.echo : undefined,
        );
      }

      case "deleteShiftSeries": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            (permissions.canEditShifts && permissions.canManageShiftSeries),
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        // Read the series' cells before the RPC removes the rows that identify
        // them, so their notes can be cleared afterwards. delete_shift_series
        // returns only a count, and the echo covers a single cell.
        const { data: seriesCells, error: seriesCellsError } = await auth.serviceClient
          .from("schedule_cells")
          .select("emp_id, date")
          .eq("org_id", data.orgId)
          .eq("series_id", data.seriesId);
        if (seriesCellsError) {
          throw seriesCellsError;
        }

        const { data: deletedCount, error } = await auth.userClient.rpc("delete_shift_series", {
          p_series_id: data.seriesId,
          p_org_id: data.orgId,
        });
        if (error) {
          throw error;
        }

        await clearScheduleNotesForCells(
          auth.serviceClient,
          data.orgId,
          ((seriesCells ?? []) as Array<{ emp_id: string; date: string }>).map((cell) => ({
            employeeId: cell.emp_id,
            date: cell.date,
          })),
        );

        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: "shift_series.archived",
          resourceType: "shift_series",
          resourceId: data.seriesId,
          details: { shiftsAffected: Number(deletedCount ?? 0) },
        });
        const seriesEcho =
          data.echoCell && data.echo
            ? await readEchoedCells(
                auth.serviceClient,
                data.orgId,
                [data.echoCell],
                data.echo,
              ).catch((error) => {
                logger.error(
                  { error, orgId: data.orgId },
                  "Failed to echo cell after series delete",
                );
                return null;
              })
            : null;
        return NextResponse.json({
          deletedCount: Number(deletedCount ?? 0),
          ...(seriesEcho ? { cells: seriesEcho } : {}),
        });
      }

      case "applyRecurringSchedules": {
        // Series and recurring applies write grid cells, so they need Schedule
        // edit as well as their own key. The toolbar already requires both;
        // without this the API alone let a recurring-only admin fill the grid.
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            (permissions.canEditShifts && permissions.canApplyRecurringSchedule),
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        assertDateRange(data.startDate, data.endDate);
        const buildExistingCellsPage = (from: number, to: number) =>
          auth.serviceClient
            .from("schedule_cells")
            .select(
              "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))",
            )
            .eq("org_id", data.orgId)
            .gte("date", data.startDate)
            .lte("date", data.endDate)
            .order("date", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);

        const [{ data: recurringRows, error: recurringError }, cells] = await Promise.all([
          auth.serviceClient
            .from("recurring_shifts")
            .select(RECURRING_SHIFT_COLS)
            .eq("org_id", data.orgId)
            .is("archived_at", null)
            .lte("effective_from", data.endDate)
            .or(`effective_until.is.null,effective_until.gte.${data.startDate}`),
          // A single unpaged query here would silently truncate at PostgREST's
          // max_rows cap, causing already-scheduled cells to be treated as
          // empty and overwritten by the recurring fill below.
          fetchAllRows<DbScheduleCell>(buildExistingCellsPage),
        ]);
        if (recurringError) {
          throw recurringError;
        }

        const templatesByEmpAndDay = new Map<string, DbRecurringShift>();
        for (const row of (recurringRows ?? []) as DbRecurringShift[]) {
          const key = `${row.emp_id}_${row.day_of_week}`;
          const current = templatesByEmpAndDay.get(key);
          if (!current || row.effective_from > current.effective_from) {
            templatesByEmpAndDay.set(key, row);
          }
        }

        const cellsByKey = new Map<string, DbScheduleCell>();
        for (const cell of cells) {
          cellsByKey.set(`${cell.emp_id}_${cell.date}`, cell);
        }

        const absenceTypeIds = Array.from(
          new Set(
            ((recurringRows ?? []) as DbRecurringShift[])
              .map((row) =>
                row.state.kind === "absence" ? (row.state.absenceTypeId ?? null) : null,
              )
              .filter((id): id is number => id != null),
          ),
        );
        const { data: absenceRows, error: absenceError } = absenceTypeIds.length
          ? await auth.serviceClient
              .from("absence_types")
              .select("id, name")
              .in("id", absenceTypeIds)
          : { data: [], error: null };
        if (absenceError) {
          throw absenceError;
        }
        const absenceTypeLabelMap = new Map(
          ((absenceRows ?? []) as Array<{ id: number; name: string }>).map((row) => [
            row.id,
            row.name,
          ]),
        );
        const [assignmentIdByPair, assignmentLabelMap] = await Promise.all([
          fetchAssignmentIdByPairMap(auth.serviceClient, data.orgId),
          fetchAssignmentLabelMap(auth.serviceClient, data.orgId),
        ]);

        const generated: Array<{
          empId: string;
          date: string;
          label: string;
          absenceTypeId?: number;
        }> = [];

        const writeJobs: Array<() => Promise<void>> = [];

        for (const { dateKey, dayOfWeek } of iterateDateRange(
          new Date(`${data.startDate}T00:00:00`),
          new Date(`${data.endDate}T00:00:00`),
        )) {
          for (const template of templatesByEmpAndDay.values()) {
            if (template.day_of_week !== dayOfWeek) {
              continue;
            }
            if (template.effective_from > dateKey) {
              continue;
            }
            if (template.effective_until && template.effective_until < dateKey) {
              continue;
            }

            const cellKey = `${template.emp_id}_${dateKey}`;
            const existingCell = cellsByKey.get(cellKey);
            if (existingCell && cellBlocksRecurringFill(existingCell)) {
              continue;
            }

            const normalizedInput = normalizeScheduleInput(template.state, {
              seriesId: template.state.seriesId ?? null,
              fromRecurring: true,
            });

            writeJobs.push(async () => {
              await writeShiftSnapshot(auth.userClient, {
                orgId: data.orgId,
                employeeId: template.emp_id,
                date: dateKey,
                state: normalizedInput,
                expectedVersion: existingCell?.version,
              });

              if (normalizedInput.kind === "absence") {
                const absenceTypeId = normalizedInput.absenceTypeId ?? null;
                if (absenceTypeId != null) {
                  generated.push({
                    empId: template.emp_id,
                    date: dateKey,
                    label: absenceTypeLabelMap.get(absenceTypeId) ?? "?",
                    absenceTypeId,
                  });
                }
              } else if (normalizedInput.kind === "worked") {
                const assignmentIds = normalizedInput.segments
                  .map(
                    (segment) =>
                      assignmentIdByPair.get(`${segment.shiftId ?? "null"}:${segment.jobId}`) ??
                      null,
                  )
                  .filter((value): value is number => value != null);
                generated.push({
                  empId: template.emp_id,
                  date: dateKey,
                  label: assignmentIds.map((id) => assignmentLabelMap.get(id) ?? "?").join("/"),
                });
              }
            });
          }
        }

        // Independent per (employee, date) cell — write in bounded concurrent
        // batches instead of one round trip at a time, which serialized what
        // can be hundreds of writes for a large org or date range.
        const WRITE_CONCURRENCY = 8;
        for (let i = 0; i < writeJobs.length; i += WRITE_CONCURRENCY) {
          await Promise.all(writeJobs.slice(i, i + WRITE_CONCURRENCY).map((job) => job()));
        }

        if (generated.length > 0) {
          logScheduleAudit(auth.serviceClient, {
            orgId: data.orgId,
            actorId: auth.actor.id,
            actorEmail: auth.actor.email ?? null,
            action: "recurring_schedule.applied",
            resourceType: "schedule",
            resourceId: null,
            details: {
              startDate: data.startDate,
              endDate: data.endDate,
              generatedCount: generated.length,
            },
          });
        }

        return NextResponse.json({ generated });
      }

      case "upsertScheduleNote": {
        // A schedule note is an indicator on a cell, so writing one needs the
        // indicators key as well as notes. The cell editor gates the picker on
        // indicators; this keeps the API in step with it.
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            (permissions.canEditNotes && permissions.canEditScheduleIndicators),
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        if (
          !(await cellHasWorkedShift(auth.serviceClient, data.orgId, data.employeeId, data.date))
        ) {
          return NextResponse.json(
            { error: "Cannot add an indicator to a cell without a shift" },
            { status: 400 },
          );
        }

        const status = data.existingStatus === "draft_deleted" ? "published" : "draft";
        const { error } = await auth.serviceClient.from("schedule_notes").upsert(
          {
            org_id: data.orgId,
            emp_id: data.employeeId,
            date: data.date,
            indicator_type_id: data.indicatorTypeId,
            focus_area_id: data.focusAreaId,
            status,
          },
          { onConflict: "emp_id,date,indicator_type_id,focus_area_id" },
        );
        if (error) {
          throw error;
        }

        void dispatchNotificationEvent(auth.actor.id, {
          action: "schedule_note_changed",
          orgId: data.orgId,
          empId: data.employeeId,
          date: data.date,
          mode: "upsert",
          status,
        });
        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: "schedule_note.upserted",
          resourceType: "schedule_note",
          resourceId: `${data.employeeId}_${data.date}`,
          details: {
            indicatorTypeId: data.indicatorTypeId,
            focusAreaId: data.focusAreaId,
            status,
          },
        });

        return NextResponse.json({ success: true });
      }

      case "deleteScheduleNote": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            (permissions.canEditNotes && permissions.canEditScheduleIndicators),
          { actor },
        );
        if ("response" in auth) {
          return auth.response;
        }

        if (data.existingStatus === "draft") {
          const { error } = await auth.serviceClient
            .from("schedule_notes")
            .delete()
            .eq("org_id", data.orgId)
            .eq("emp_id", data.employeeId)
            .eq("date", data.date)
            .eq("indicator_type_id", data.indicatorTypeId)
            .eq("focus_area_id", data.focusAreaId);
          if (error) {
            throw error;
          }
        } else {
          const { error } = await auth.serviceClient
            .from("schedule_notes")
            .update({ status: "draft_deleted" })
            .eq("org_id", data.orgId)
            .eq("emp_id", data.employeeId)
            .eq("date", data.date)
            .eq("indicator_type_id", data.indicatorTypeId)
            .eq("focus_area_id", data.focusAreaId);
          if (error) {
            throw error;
          }
        }

        // Only fire when removing a previously-published note — draft
        // deletes are editor-only state changes.
        void dispatchNotificationEvent(auth.actor.id, {
          action: "schedule_note_changed",
          orgId: data.orgId,
          empId: data.employeeId,
          date: data.date,
          mode: "delete",
          status: data.existingStatus === "draft" ? "draft" : "published",
        });
        logScheduleAudit(auth.serviceClient, {
          orgId: data.orgId,
          actorId: auth.actor.id,
          actorEmail: auth.actor.email ?? null,
          action: "schedule_note.deleted",
          resourceType: "schedule_note",
          resourceId: `${data.employeeId}_${data.date}`,
          details: {
            indicatorTypeId: data.indicatorTypeId,
            focusAreaId: data.focusAreaId,
            existingStatus: data.existingStatus,
          },
        });

        return NextResponse.json({ success: true });
      }
    }
  } catch (error) {
    if (isOverlapConflictError(error)) {
      return NextResponse.json(
        {
          error:
            "These shift times overlap. Adjust the times, or turn off conflict prevention in Settings under Schedule Rules.",
          code: "SHIFT_OVERLAP",
        },
        { status: 409 },
      );
    }

    if (error instanceof OptimisticLockConflictError) {
      return NextResponse.json(
        {
          error: "Schedule changed elsewhere. Refresh and try again.",
          code: "OPTIMISTIC_LOCK",
          shiftId: error.shiftId,
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        },
        { status: 409 },
      );
    }

    return apiErrorResponse(error, "Schedule request failed");
  }
}
