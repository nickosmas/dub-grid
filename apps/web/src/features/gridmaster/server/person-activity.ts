import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbRecurringShift, DbScheduleCell } from "@/lib/db/types";
import { scheduleStateLabel } from "@/lib/db/mappers";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import { fetchAssignmentLabelMap, fetchSegmentResolutionMaps } from "@/app/api/shared/schedule";
import type { ScheduleCellInput } from "@/types";
import type {
  GridmasterPersonSchedule,
  GridmasterProfileChangeRequest,
  GridmasterPublishChange,
  GridmasterScheduleIndicator,
  GridmasterScheduledDay,
  GridmasterShiftRequest,
} from "../person-record";
import { resolveActors } from "./person-record";

const DAYS_BACK = 28;
const DAYS_AHEAD = 56;
/** How far back publish changes and settled requests go; open requests always show. */
const HISTORY_DAYS = 90;
const OPEN_REQUEST_STATUSES = new Set(["open", "pending_approval"]);
const DAY_MS = 86_400_000;

const CELL_COLUMNS =
  "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))";

type Row = Record<string, unknown>;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function rowsOrThrow<T>(result: { data: unknown; error: unknown }): T[] {
  if (result.error) throw result.error;
  return (result.data ?? []) as T[];
}

async function loadLabelMaps(client: SupabaseClient, orgId: string) {
  const [codeMap, resolution, absenceResult] = await Promise.all([
    fetchAssignmentLabelMap(client, orgId),
    fetchSegmentResolutionMaps(client, orgId),
    client.from("absence_types").select("id, name").eq("org_id", orgId),
  ]);
  const absenceTypeMap = new Map(
    rowsOrThrow<{ id: number; name: string }>(absenceResult).map((row) => [row.id, row.name]),
  );
  return { codeMap, absenceTypeMap, ...resolution };
}

type LabelMaps = Awaited<ReturnType<typeof loadLabelMaps>>;

/**
 * A publish change carries a cell state or, for a schedule note, the note
 * itself. A row neither shape reads is shown as unknown rather than failing
 * the whole section (F-97).
 */
function stateLabel(state: unknown, maps: LabelMaps): string | null {
  if (!state || typeof state !== "object") return null;
  const note = state as { type?: unknown; indicatorName?: unknown };
  if (note.type === "note") {
    return typeof note.indicatorName === "string" && note.indicatorName
      ? `Schedule note: ${note.indicatorName}`
      : "Schedule note";
  }
  try {
    return scheduleStateLabel(state as ScheduleCellInput, maps);
  } catch {
    return "Unknown";
  }
}

function employeeName(row: { first_name?: string | null; last_name?: string | null } | null) {
  const name = `${row?.first_name ?? ""} ${row?.last_name ?? ""}`.trim();
  return name || null;
}

/** Publish changes, shift requests and profile change requests for one staff record. */
async function loadRequestsAndChanges(
  client: SupabaseClient,
  orgId: string,
  employeeId: string,
  maps: LabelMaps,
  nowMs: number,
) {
  const cutoff = new Date(nowMs - HISTORY_DAYS * DAY_MS).toISOString();
  // Every open request, and the rest from the last 90 days, bounded in the query (F-92).
  const openOrRecent = `or(status.in.(${[...OPEN_REQUEST_STATUSES].join(",")}),created_at.gte.${cutoff})`;
  const [changeResult, requestResult, profileResult] = await Promise.all([
    client
      .from("schedule_publish_changes")
      .select(
        "date, kind, from_state, to_state, publish:publish_history!inner(published_at, published_by)",
      )
      .eq("org_id", orgId)
      .eq("emp_id", employeeId)
      .gte("publish.published_at", cutoff)
      .order("date", { ascending: false }),
    client
      .from("shift_requests")
      .select(
        "id, type, status, requester_emp_id, target_emp_id, requester_shift_date, target_shift_date, admin_user_id, admin_note, created_at, resolved_at",
      )
      .eq("org_id", orgId)
      .or(
        [`requester_emp_id.eq.${employeeId}`, `target_emp_id.eq.${employeeId}`]
          .map((side) => `and(${side},${openOrRecent})`)
          .join(","),
      )
      .order("created_at", { ascending: false }),
    client
      .from("profile_change_requests")
      .select(
        "id, request_type, status, requested_changes, request_note, resolver_note, resolver_user_id, created_at, resolved_at",
      )
      .eq("org_id", orgId)
      .eq("requester_employee_id", employeeId)
      .or(`status.eq.pending,created_at.gte.${cutoff}`)
      .order("created_at", { ascending: false }),
  ]);

  const publishChanges = rowsOrThrow<Row>(changeResult)
    .map((row): GridmasterPublishChange => {
      const publish = row.publish as { published_at: string; published_by: string | null };
      return {
        publishedAt: publish.published_at,
        date: row.date as string,
        kind: row.kind as string,
        from: stateLabel(row.from_state, maps),
        to: stateLabel(row.to_state, maps),
        publishedBy: publish.published_by ?? null,
      };
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const requestRows = rowsOrThrow<Row>(requestResult);
  const partnerIds = [
    ...new Set(
      requestRows
        .map((row) =>
          row.requester_emp_id === employeeId ? row.target_emp_id : row.requester_emp_id,
        )
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const partners = new Map<string, string | null>();
  if (partnerIds.length > 0) {
    const partnerRows = rowsOrThrow<Row>(
      await client
        .from("employees")
        .select("id, first_name, last_name")
        .eq("org_id", orgId)
        .in("id", partnerIds),
    );
    for (const row of partnerRows) {
      partners.set(row.id as string, employeeName(row as never));
    }
  }
  const shiftRequests = requestRows.map((row): GridmasterShiftRequest => {
    const isRequester = row.requester_emp_id === employeeId;
    const partnerId = (isRequester ? row.target_emp_id : row.requester_emp_id) as string | null;
    return {
      id: row.id as string,
      type: row.type as GridmasterShiftRequest["type"],
      status: row.status as string,
      side: isRequester ? "requester" : "target",
      partner: partnerId ? (partners.get(partnerId) ?? null) : null,
      shiftDate:
        ((isRequester ? row.requester_shift_date : row.target_shift_date) as string | null) ?? null,
      partnerShiftDate:
        ((isRequester ? row.target_shift_date : row.requester_shift_date) as string | null) ?? null,
      adminNote: (row.admin_note as string | null) ?? null,
      settledBy: (row.admin_user_id as string | null) ?? null,
      createdAt: row.created_at as string,
      resolvedAt: (row.resolved_at as string | null) ?? null,
    };
  });

  const profileChangeRequests = rowsOrThrow<Row>(profileResult).map(
    (row): GridmasterProfileChangeRequest => ({
      id: row.id as string,
      type: row.request_type as string,
      status: row.status as string,
      requested: (row.requested_changes as Record<string, unknown> | null) ?? {},
      note: (row.request_note as string | null) ?? null,
      resolverNote: (row.resolver_note as string | null) ?? null,
      resolvedBy: (row.resolver_user_id as string | null) ?? null,
      createdAt: row.created_at as string,
      resolvedAt: (row.resolved_at as string | null) ?? null,
    }),
  );

  return { publishChanges, shiftRequests, profileChangeRequests };
}

function toScheduledDay(row: DbScheduleCell, maps: LabelMaps): GridmasterScheduledDay | null {
  const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
    isScheduler: true,
    assignmentLabelMap: maps.codeMap,
    assignmentIdByPair: maps.assignmentIdByPair,
    absenceTypeMap: maps.absenceTypeMap,
    segmentCompatibility: maps.segmentCompatibility,
  });
  if (!entry) return null;
  const published = entry.published ? entry.published.label : null;
  const draft = entry.draft ? entry.draft.label : null;
  const worked = entry.draft ?? entry.published;
  return {
    date: row.date,
    published,
    // The draft only says something when it differs from what is published.
    draft: draft !== null && draft !== published ? draft : null,
    customStart: worked?.customStartTime ?? null,
    customEnd: worked?.customEndTime ?? null,
    source: row.series_id ? "series" : row.from_recurring ? "recurring" : "manual",
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * One staff record's schedule in its own organization, for the Gridmaster
 * person page. Null when the staff record does not exist. Every read is scoped
 * by the record's id and its organization.
 */
export async function loadPersonSchedule(
  client: SupabaseClient,
  employeeId: string,
  nowMs: number = Date.now(),
): Promise<GridmasterPersonSchedule | null> {
  const { data: employee, error } = await client
    .from("employees")
    .select("id, org_id, organizations!inner(workspace_kind)")
    .eq("id", employeeId)
    .maybeSingle();
  if (error) throw error;
  const row = employee as {
    org_id: string;
    organizations: { workspace_kind: string } | null;
  } | null;
  // A Test Sandbox's staff are clones, not people, as the person record says (F-93).
  if (!row || row.organizations?.workspace_kind !== "real") return null;
  const orgId = row.org_id;

  const window = {
    from: dayKey(nowMs - DAYS_BACK * DAY_MS),
    to: dayKey(nowMs + DAYS_AHEAD * DAY_MS),
  };
  const [maps, recurringResult, seriesResult, cellResult, noteResult] = await Promise.all([
    loadLabelMaps(client, orgId),
    client
      .from("recurring_shifts")
      .select(
        "id, emp_id, org_id, day_of_week, state, effective_from, effective_until, archived_at, created_at, updated_at",
      )
      .eq("org_id", orgId)
      .eq("emp_id", employeeId)
      .order("day_of_week"),
    client
      .from("shift_series")
      .select(
        "id, state, frequency, days_of_week, start_date, end_date, max_occurrences, archived_at",
      )
      .eq("org_id", orgId)
      .eq("emp_id", employeeId)
      .order("start_date", { ascending: false }),
    client
      .from("schedule_cells")
      .select(CELL_COLUMNS)
      .eq("org_id", orgId)
      .eq("emp_id", employeeId)
      .gte("date", window.from)
      .lte("date", window.to)
      .order("date", { ascending: false }),
    client
      .from("schedule_notes")
      .select("date, status, indicator:indicator_types(name)")
      .eq("org_id", orgId)
      .eq("emp_id", employeeId)
      .gte("date", window.from)
      .lte("date", window.to)
      .order("date", { ascending: false }),
  ]);

  const recurring = rowsOrThrow<DbRecurringShift>(recurringResult).map((row) => ({
    id: row.id,
    dayOfWeek: row.day_of_week,
    label: scheduleStateLabel(row.state as ScheduleCellInput, maps),
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    archivedAt: row.archived_at ?? null,
  }));
  const series = rowsOrThrow<Row>(seriesResult).map((row) => ({
    id: row.id as string,
    label: scheduleStateLabel(row.state as ScheduleCellInput, maps),
    frequency: row.frequency as string,
    daysOfWeek: (row.days_of_week as number[] | null) ?? [],
    startDate: row.start_date as string,
    endDate: (row.end_date as string | null) ?? null,
    maxOccurrences: (row.max_occurrences as number | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
  }));
  const shifts = rowsOrThrow<DbScheduleCell>(cellResult)
    .map((row) => toScheduledDay(row, maps))
    .filter((day): day is GridmasterScheduledDay => day !== null);
  const indicators = rowsOrThrow<Row>(noteResult).map((row): GridmasterScheduleIndicator => ({
    date: row.date as string,
    name: (row.indicator as { name?: string } | null)?.name ?? "Note",
    status: row.status as GridmasterScheduleIndicator["status"],
  }));

  const history = await loadRequestsAndChanges(client, orgId, employeeId, maps, nowMs);
  const actors = await resolveActors(client, [
    ...history.publishChanges.map((change) => change.publishedBy),
    ...history.shiftRequests.map((request) => request.settledBy),
    ...history.profileChangeRequests.map((request) => request.resolvedBy),
  ]);

  return { window, recurring, series, shifts, indicators, ...history, actors };
}
