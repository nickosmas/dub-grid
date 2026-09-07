import type {
  MobileDashboardResponse,
  MobileOpenShift,
  MobileScheduleRange,
  MobileShiftRequest,
  ScheduleCellState,
} from "@dubgrid/contracts";
import {
  buildShiftJobPairKey,
  computeShiftSegmentHours,
  formatLocalDateKey,
  parseLocalDateKey,
  resolveActiveShiftRequests,
  type CoverageByFocusAreaEntry,
  type CoverageTotals,
} from "@dubgrid/schedule-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MobileApiAuthorizationError } from "./read";

const OVERTIME_THRESHOLD_HOURS = 40;
// Coverage sections, open shifts, staff-hours entries, and the action queue
// are all naturally bounded by org size (focus areas, employees, coverage
// gaps) — not unbounded historical data — so they're returned in full; the
// client's ExpandableList component reveals the rest via "Show more" rather
// than paginating. A 10-item server-side cap here previously truncated data
// on any org with more than 10 of something, which "Show more" could never
// actually reveal past that ceiling. Activity is genuinely append-only, so
// it keeps a cap — matching web's buildActivityFeed(..., 100)
// (apps/web/src/lib/dashboard-stats.ts).
const MAX_ACTIVITY_ITEMS = 100;

export type DashboardDraftChangeKind = "new" | "modified" | "deleted";

export type DashboardDraftSummary = NonNullable<MobileDashboardResponse["metrics"]["draftSummary"]>;

export type DashboardDraftComparisonRow = {
  draftState: ScheduleCellState | null;
  draftDeleted: boolean;
  publishedState: ScheduleCellState | null;
};

export type MobileDashboardContext = {
  currentOrg: { id: string; timezone?: string | null };
  effectiveRole: string;
  canEditSchedule?: boolean;
  serviceClient: SupabaseClient;
};

/**
 * Counts the same draft classifications that web assigns after comparing a
 * cell's draft and published snapshots. The caller classifies rows at the
 * data boundary so this shared package remains database-agnostic.
 */
export function summarizeDashboardDraftChanges(
  draftChangeKinds: readonly DashboardDraftChangeKind[],
  canEditSchedule: boolean,
): DashboardDraftSummary | null {
  if (!canEditSchedule) return null;

  let newCount = 0;
  let modifiedCount = 0;
  let deletedCount = 0;

  for (const kind of draftChangeKinds) {
    if (kind === "new") newCount += 1;
    else if (kind === "modified") modifiedCount += 1;
    else deletedCount += 1;
  }

  return {
    newCount,
    modifiedCount,
    deletedCount,
    total: newCount + modifiedCount + deletedCount,
  };
}

function statesMatch(left: ScheduleCellState, right: ScheduleCellState): boolean {
  if (
    left.kind !== right.kind ||
    left.absenceTypeId !== right.absenceTypeId ||
    left.customStartTime !== right.customStartTime ||
    left.customEndTime !== right.customEndTime ||
    left.segments.length !== right.segments.length
  ) {
    return false;
  }

  return left.segments.every((segment, index) => {
    const other = right.segments[index];
    return (
      other != null &&
      segment.position === other.position &&
      segment.shiftId === other.shiftId &&
      segment.jobId === other.jobId &&
      (segment.isMentored ?? false) === (other.isMentored ?? false)
    );
  });
}

export function classifyDashboardDraftChange(
  row: DashboardDraftComparisonRow,
): DashboardDraftChangeKind | null {
  if (row.draftState == null && !row.draftDeleted) return null;
  if (row.publishedState == null) return row.draftDeleted ? null : "new";
  if (row.draftDeleted) return "deleted";
  return row.draftState != null && statesMatch(row.draftState, row.publishedState)
    ? null
    : "modified";
}

export function summarizeDashboardDraftComparisons(
  rows: readonly DashboardDraftComparisonRow[],
  canEditSchedule: boolean,
): DashboardDraftSummary | null {
  if (!canEditSchedule) return null;

  return summarizeDashboardDraftChanges(
    rows.flatMap((row) => {
      const kind = classifyDashboardDraftChange(row);
      return kind == null ? [] : [kind];
    }),
    true,
  );
}

// ── Dependency shapes ────────────────────────────────────────────────────
// Structural types matching what @dubgrid/data-access + the web-local
// fetchMobileOpenShifts/fetchMobileShiftRequests wrappers already return —
// injected rather than imported so this package stays DB/app agnostic.

export type MobileCoverageSummary = {
  openShifts: MobileOpenShift[];
  totals: CoverageTotals;
  byFocusArea: CoverageByFocusAreaEntry[];
  hasCoverageRequirements: boolean;
  // Draft-preferred ("effective") schedule rows for the same org/date range,
  // fetched once as part of the coverage-engine pass. Reused for
  // computeStaffHoursForPeriod below instead of a second, redundant fetch.
  scheduleRows: DashboardScheduleCellRow[];
};

// Both the dashboard's coverage totals and its open-shifts list are built
// from one shared coverage-engine pass (see fetchMobileCoverageSummary in
// apps/web/src/features/mobile/server/data.ts), so the numbers here can
// never disagree with each other — and because the underlying engine now
// lives in @dubgrid/schedule-core, they can't silently diverge from web's
// dashboard numbers either.
type FetchMobileCoverageSummary = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    showAll: boolean;
    timeZone: string | null;
    startDate: string;
    endDate: string;
  },
) => Promise<MobileCoverageSummary>;

type FetchMobileShiftRequests = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    includeOpenPickupRequests: boolean;
    startDate: string;
    endDate: string;
  },
) => Promise<MobileShiftRequest[]>;

type FetchMobileDashboardDraftComparisons = (
  serviceClient: SupabaseClient,
  input: { orgId: string; startDate: string; endDate: string },
) => Promise<DashboardDraftComparisonRow[]>;

// Mapped (camelCase) shapes matching @dubgrid/schedule-core's
// HoursAssignmentLike/HoursShiftCategoryLike structurally, so the same
// assignment/category rows the coverage engine already resolves (via web's
// fetchMobileOpenShiftContext in apps/web/src/features/mobile/server/data.ts)
// can also drive computeShiftSegmentHours below.
export type DashboardAssignmentRow = {
  id: number;
  shiftId?: number | null;
  jobId?: number | null;
  categoryId?: number | null;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  defaultDurationHours?: number | null;
  defaultDurationMinutes?: number | null;
};

export type DashboardShiftCategoryRow = {
  id: number;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  // Legacy data-access rows use database casing. Keeping this boundary tolerant
  // lets a partially rolled-out mobile client keep calculating hours safely.
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number | null;
};

export type DashboardFocusAreaRow = {
  id: number;
  name: string;
};

type FetchMobileOpenShiftContext = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<{
  assignments: DashboardAssignmentRow[];
  /** Resolves a segment's (shiftId, jobId) pair to its assignment id — the
   * same pair-key format as @dubgrid/schedule-core's coverage engine uses. */
  assignmentIdByPair: Map<string, number>;
  shiftCategories: DashboardShiftCategoryRow[];
  focusAreas: DashboardFocusAreaRow[];
}>;

export type DashboardScheduleCellRow = {
  emp_id: string;
  date: string;
  focus_area_id: number | null;
  state: {
    kind: string;
    segments: Array<{ shiftId: number | null; jobId: number }>;
    customStartTime: string | null;
    customEndTime: string | null;
  };
  employees: { id: string; first_name: string; last_name: string };
};

export type DashboardPublishChange = {
  empId: string;
  date: string;
  kind: "new" | "modified" | "deleted";
};

export type DashboardPublishHistoryRow = {
  published_by: string | null;
  start_date: string;
  end_date: string;
  published_at: string;
  change_count: number;
  changes: DashboardPublishChange[];
};

type FetchMobilePublishHistoryRows = (
  serviceClient: SupabaseClient,
  orgId: string,
  input?: { startDate?: string; endDate?: string },
) => Promise<DashboardPublishHistoryRow[]>;

export type DashboardAcceptedInvitationRow = {
  email: string;
  role_to_assign: string;
  accepted_at: string;
};

type FetchMobileAcceptedInvitationRows = (
  serviceClient: SupabaseClient,
  orgId: string,
  input: { startDate: string; endDate: string },
) => Promise<DashboardAcceptedInvitationRow[]>;

export type DashboardProfileNameRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type FetchProfileNameRowsByIds = (
  serviceClient: SupabaseClient,
  ids: string[],
) => Promise<DashboardProfileNameRow[]>;

// ── Pure helpers (independently testable) ───────────────────────────────

// Activity descriptions are pre-composed server-side text (unlike other
// fields, which stay raw for the client to format), so the US date format
// has to be baked in here too.
function formatUsDateForActivity(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function getDateKeysInRange(startDate: string, endDate: string): string[] {
  const keys: string[] = [];
  // parseLocalDateKey/formatLocalDateKey, not local-midnight-then-toISOString
  // — that round-trip silently shifts every key back one day on a server
  // ahead of UTC (see parseLocalDateKey's doc comment in @dubgrid/schedule-core).
  const cursor = parseLocalDateKey(startDate);
  const end = parseLocalDateKey(endDate);
  while (cursor <= end) {
    keys.push(formatLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function buildHeroSummary(input: {
  urgentGapCount: number;
  pendingApprovalsCount: number;
  hasCoverageRequirements: boolean;
}): MobileDashboardResponse["heroSummary"] {
  // Only high-urgency gaps escalate to the top-priority alert — matching
  // web's hero headline (DashboardView.tsx), where a couple of low-urgency
  // gaps alone don't read as "Attention" while everything else is fine.
  if (input.urgentGapCount > 0) {
    return {
      statusLabel: "Attention",
      title: `${input.urgentGapCount} urgent coverage ${input.urgentGapCount === 1 ? "gap" : "gaps"}`,
      description: "Resolve staffing gaps to keep your schedule fully covered.",
    };
  }
  if (input.pendingApprovalsCount > 0) {
    return {
      statusLabel: "Approval",
      title: `${input.pendingApprovalsCount} ${input.pendingApprovalsCount === 1 ? "request" : "requests"} awaiting approval`,
      description: "Review pending requests to keep your schedule up to date.",
    };
  }
  if (!input.hasCoverageRequirements) {
    return {
      statusLabel: "Setup",
      title: "Coverage requirements not configured",
      description: "Set staffing requirements so coverage tracking can surface here.",
    };
  }
  return {
    statusLabel: "Healthy",
    title: "Schedule health looks good",
    description: "No open gaps or pending requests right now.",
  };
}

// Required-vs-filled per focus area — the mobile analog of web's
// "Coverage by wing" card (apps/web/src/components/dashboard/
// CoverageBySectionCard.tsx). `byFocusArea` comes straight from
// @dubgrid/schedule-core's summarizeCoverageByFocusArea, the same
// aggregation web's dashboard uses, so filled/required here are real
// per-employee-assignment counts — not an open-slot approximation.
export function buildCoverageSectionsResponse(
  byFocusArea: CoverageByFocusAreaEntry[],
): MobileDashboardResponse["coverageBySection"] {
  return byFocusArea
    .map((entry) => ({
      focusAreaId: entry.focusAreaId,
      focusAreaName: entry.focusAreaName,
      requiredTotal: entry.requiredTotal,
      filledTotal: entry.filledTotal,
      pct: entry.pct,
      openSlots: Math.max(0, entry.requiredTotal - entry.filledTotal),
    }))
    .sort((a, b) => a.pct - b.pct || b.openSlots - a.openSlots);
}

function getPrimaryFocusAreaId(hoursByFocusArea: Map<number, number>): number | null {
  let best: number | null = null;
  let bestHours = -1;
  for (const [focusAreaId, hours] of hoursByFocusArea) {
    if (hours > bestHours) {
      best = focusAreaId;
      bestHours = hours;
    }
  }
  return best;
}

function normalizeShiftCategoryHours(
  category: DashboardShiftCategoryRow,
): DashboardShiftCategoryRow {
  return {
    ...category,
    startTime: category.startTime ?? category.start_time ?? null,
    endTime: category.endTime ?? category.end_time ?? null,
    breakMinutes: category.breakMinutes ?? category.break_minutes ?? null,
  };
}

export function computeStaffHoursForPeriod(
  scheduleRows: DashboardScheduleCellRow[],
  shiftCategoriesById: Map<number, DashboardShiftCategoryRow>,
  focusAreaNameById: Map<number, string>,
  range: MobileScheduleRange,
  assignmentById = new Map<number, DashboardAssignmentRow>(),
  assignmentIdByPair = new Map<string, number>(),
  otThreshold = OVERTIME_THRESHOLD_HOURS,
): MobileDashboardResponse["staffHours"] {
  const normalizedShiftCategoriesById = new Map(
    Array.from(shiftCategoriesById, ([id, category]) => [
      id,
      normalizeShiftCategoryHours(category),
    ]),
  );
  const byEmployee = new Map<
    string,
    { name: string; dailyHours: Map<string, number>; hoursByFocusArea: Map<number, number> }
  >();

  for (const row of scheduleRows) {
    if (row.state.kind !== "worked") continue;

    let assignmentIds = row.state.segments
      .map((segment) =>
        assignmentIdByPair.get(buildShiftJobPairKey(segment.shiftId, segment.jobId)),
      )
      .filter((id): id is number => id != null);
    let hoursAssignmentById = assignmentById;
    if (assignmentIds.length === 0) {
      // Historical cells can predate an assignment definition or omit a job
      // id. Their category still supplies the canonical default hours, so
      // retain that information instead of turning real worked time into zero.
      hoursAssignmentById = new Map(assignmentById);
      assignmentIds = row.state.segments.flatMap((segment) => {
        if (segment.shiftId == null) return [];
        const id = -segment.shiftId;
        if (!hoursAssignmentById.has(id)) {
          hoursAssignmentById.set(id, { id, categoryId: segment.shiftId });
        }
        return [id];
      });
    }
    // Canonical @dubgrid/schedule-core algorithm — assignment-level override
    // time, then shift-category default time, then duration-only fields,
    // with pipe-delimited per-segment custom-time parsing. The previous
    // local version only ever read shift-category times directly, so it
    // undercounted (or zeroed) hours for any org using assignment overrides
    // or duration-only shift codes, silently missing real overtime.
    const hours = computeShiftSegmentHours(
      assignmentIds,
      hoursAssignmentById,
      row.state.customStartTime,
      row.state.customEndTime,
      normalizedShiftCategoriesById,
    );
    if (hours <= 0) continue;

    const name = `${row.employees.first_name} ${row.employees.last_name}`.trim();
    const entry = byEmployee.get(row.emp_id) ?? {
      name,
      dailyHours: new Map<string, number>(),
      hoursByFocusArea: new Map<number, number>(),
    };
    entry.dailyHours.set(row.date, (entry.dailyHours.get(row.date) ?? 0) + hours);
    if (row.focus_area_id != null) {
      entry.hoursByFocusArea.set(
        row.focus_area_id,
        (entry.hoursByFocusArea.get(row.focus_area_id) ?? 0) + hours,
      );
    }
    byEmployee.set(row.emp_id, entry);
  }

  // Overtime is a per-week concept: chunk the period into 7-day windows and
  // flag anyone over otThreshold in any single week, matching web's
  // computeEmployeeWeeklyHours (apps/web/src/lib/dashboard-stats.ts).
  const dateKeys = getDateKeysInRange(range.startDate, range.endDate);
  const results: MobileDashboardResponse["staffHours"] = [];

  for (const [employeeId, { name, dailyHours, hoursByFocusArea }] of byEmployee) {
    let totalHours = 0;
    let overtimeHours = 0;
    for (let i = 0; i < dateKeys.length; i += 7) {
      let weekTotal = 0;
      for (const dateKey of dateKeys.slice(i, i + 7)) {
        weekTotal += dailyHours.get(dateKey) ?? 0;
      }
      totalHours += weekTotal;
      overtimeHours += Math.max(0, weekTotal - otThreshold);
    }
    if (overtimeHours > 0) {
      // An employee can work across multiple focus areas in a period — filter
      // by whichever one they logged the most hours in, matching how web
      // attributes a single-employee overtime alert to one focus area
      // (apps/web/src/lib/dashboard-stats.ts's computeOTAlerts, which uses
      // the employee's first/home focus area).
      const primaryFocusAreaId = getPrimaryFocusAreaId(hoursByFocusArea);
      results.push({
        employeeId,
        employeeName: name,
        totalHours: Math.round(totalHours * 10) / 10,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        focusAreaId: primaryFocusAreaId,
        focusAreaName:
          primaryFocusAreaId != null ? (focusAreaNameById.get(primaryFocusAreaId) ?? null) : null,
      });
    }
  }

  return results.sort((a, b) => b.overtimeHours - a.overtimeHours);
}

const SHIFT_CHANGE_DESCRIPTION: Record<DashboardPublishChange["kind"], string> = {
  new: "Shift added",
  modified: "Shift updated",
  deleted: "Shift removed",
};

function getShiftRequestStatusLabel(status: string): string {
  if (status === "open") return "Open";
  if (status === "pending_approval") return "Pending";
  return status;
}

// Same 4 event types as web's buildActivityFeed (apps/web/src/lib/
// dashboard-stats.ts): publish, shift_change (per-shift diff from the same
// schedule_publish_changes rows web reads), request (any shift
// request, no status/type filter — matches web's unfiltered fetch), and
// user_signup (any invitation with a non-null acceptedAt). Mobile's activity
// item is pre-composed text (no separate highlight/href fields like web's),
// so per-type detail that web puts in `highlight` is folded into
// `description` here instead.
export function buildActivityFeed(
  publishHistoryRows: DashboardPublishHistoryRow[],
  shiftRequests: MobileShiftRequest[],
  acceptedInvitations: DashboardAcceptedInvitationRow[],
  nameByProfileId: Map<string, string>,
  maxItems = MAX_ACTIVITY_ITEMS,
): MobileDashboardResponse["activity"] {
  const items: MobileDashboardResponse["activity"] = [];

  for (const row of publishHistoryRows) {
    const publisherName = row.published_by
      ? (nameByProfileId.get(row.published_by) ?? "Someone")
      : "Someone";
    items.push({
      id: `pub_${row.published_at}`,
      type: "publish",
      description: `${publisherName} published the schedule for ${formatUsDateForActivity(row.start_date)} to ${formatUsDateForActivity(row.end_date)}`,
      timestamp: row.published_at,
    });

    for (const change of row.changes.slice(0, 12)) {
      items.push({
        id: `chg_${row.published_at}_${change.empId}_${change.date}_${change.kind}`,
        type: "shift_change",
        description: `${SHIFT_CHANGE_DESCRIPTION[change.kind]} · ${formatUsDateForActivity(change.date)}`,
        timestamp: row.published_at,
      });
    }
  }

  for (const request of shiftRequests) {
    const isPickup = request.type === "pickup";
    const shiftName =
      request.requesterPresentation.shiftName || request.requesterPresentation.label;
    const statusLabel = getShiftRequestStatusLabel(request.status);
    items.push({
      id: `req_${request.id}`,
      type: "request",
      description: isPickup
        ? `Pickup request · ${shiftName} · ${statusLabel}`
        : `Swap request · ${request.requesterName} · ${statusLabel}`,
      timestamp: request.createdAt,
    });
  }

  for (const invitation of acceptedInvitations) {
    items.push({
      id: `signup_${invitation.accepted_at}_${invitation.email}`,
      type: "user_signup",
      description: `User sign-up completed · ${invitation.email} (${invitation.role_to_assign})`,
      timestamp: invitation.accepted_at,
    });
  }

  return items
    .sort((a, b) => (a.timestamp === b.timestamp ? 0 : a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, maxItems);
}

// ── Payload loader ───────────────────────────────────────────────────────

export async function loadMobileDashboardPayload(
  auth: MobileDashboardContext,
  range: MobileScheduleRange,
  deps: {
    fetchMobileCoverageSummary: FetchMobileCoverageSummary;
    fetchMobileShiftRequests: FetchMobileShiftRequests;
    fetchMobileDashboardDraftComparisons?: FetchMobileDashboardDraftComparisons;
    fetchMobileOpenShiftContext: FetchMobileOpenShiftContext;
    fetchMobilePublishHistoryRows: FetchMobilePublishHistoryRows;
    fetchMobileAcceptedInvitationRows: FetchMobileAcceptedInvitationRows;
    fetchProfileNameRowsByIds: FetchProfileNameRowsByIds;
  },
): Promise<MobileDashboardResponse> {
  // This dashboard is admin/super_admin-only — plain users and management-only
  // accounts get the personal schedule Home tab instead (see AdminHomeScreen
  // routing on the mobile client).
  if (auth.effectiveRole !== "admin" && auth.effectiveRole !== "super_admin") {
    throw new MobileApiAuthorizationError();
  }

  const isAdmin = auth.effectiveRole === "admin";

  const [
    coverageSummary,
    shiftRequests,
    openShiftContext,
    publishHistoryRows,
    acceptedInvitations,
    draftComparisonRows,
  ] = await Promise.all([
    deps.fetchMobileCoverageSummary(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      showAll: true,
      timeZone: auth.currentOrg.timezone ?? null,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    // Both admin and super_admin can approve requests (canApproveShiftRequests
    // is true for both by default), so the pending-approvals count on the
    // hero summary reflects both — only the ActionQueueCard list itself
    // stays admin-only on the client, matching web's AdminDashboard. This
    // also doubles as the activity feed's "request" events (no employeeId
    // set here, so the underlying query is unfiltered by status/type —
    // matches web's unfiltered shift-request fetch for its own feed).
    deps.fetchMobileShiftRequests(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      includeOpenPickupRequests: false,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    deps.fetchMobileOpenShiftContext(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobilePublishHistoryRows(auth.serviceClient, auth.currentOrg.id, {
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    deps.fetchMobileAcceptedInvitationRows(auth.serviceClient, auth.currentOrg.id, {
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    auth.canEditSchedule && deps.fetchMobileDashboardDraftComparisons
      ? deps.fetchMobileDashboardDraftComparisons(auth.serviceClient, {
          orgId: auth.currentOrg.id,
          startDate: range.startDate,
          endDate: range.endDate,
        })
      : Promise.resolve([]),
  ]);

  const legacyOpenShiftContext = openShiftContext as typeof openShiftContext & {
    assignmentIdByPair?: Map<string, number>;
    assignments?: DashboardAssignmentRow[];
    focusAreaRows?: DashboardFocusAreaRow[];
    shiftCategories?: DashboardShiftCategoryRow[];
    shiftCategoryRows?: DashboardShiftCategoryRow[];
  };
  const shiftCategories =
    legacyOpenShiftContext.shiftCategories ?? legacyOpenShiftContext.shiftCategoryRows ?? [];
  const focusAreas =
    legacyOpenShiftContext.focusAreas ?? legacyOpenShiftContext.focusAreaRows ?? [];
  const assignmentIdByPair = legacyOpenShiftContext.assignmentIdByPair ?? new Map<string, number>();
  const shiftCategoriesById = new Map(shiftCategories.map((row) => [row.id, row]));
  const focusAreaNameById = new Map(focusAreas.map((row) => [row.id, row.name]));
  const assignmentById = new Map(
    (legacyOpenShiftContext.assignments ?? []).map((row) => [row.id, row]),
  );

  const publisherIds = Array.from(
    new Set(
      publishHistoryRows.map((row) => row.published_by).filter((id): id is string => Boolean(id)),
    ),
  );
  const profileNameRows =
    publisherIds.length > 0
      ? await deps.fetchProfileNameRowsByIds(auth.serviceClient, publisherIds)
      : [];
  const nameByProfileId = new Map(
    profileNameRows.map((row) => [
      row.id,
      `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Someone",
    ]),
  );

  // Applies the same expiry/"already started" checks web's useShiftRequests
  // hook has always applied client-side — mobile previously trusted the raw
  // DB status column alone, so an expired-but-not-yet-cron-flipped or
  // already-started request could count here when web would exclude it.
  const activeShiftRequests = resolveActiveShiftRequests(
    shiftRequests,
    new Date(),
    auth.currentOrg.timezone ?? null,
  );
  const pendingApprovalRequests = activeShiftRequests.filter(
    (request) => request.status === "pending_approval",
  );
  const { openShifts, totals, byFocusArea, hasCoverageRequirements, scheduleRows } =
    coverageSummary;
  const openGapCount = openShifts.reduce((sum, shift) => sum + shift.needed, 0);
  const urgentGapCount = openShifts.reduce(
    (sum, shift) => sum + (shift.urgency === "high" ? shift.needed : 0),
    0,
  );
  const coveragePct = hasCoverageRequirements ? totals.pct : null;

  return {
    range,
    overtimeThresholdHours: OVERTIME_THRESHOLD_HOURS,
    heroSummary: buildHeroSummary({
      urgentGapCount,
      pendingApprovalsCount: pendingApprovalRequests.length,
      hasCoverageRequirements,
    }),
    metrics: {
      coveragePct,
      openGapCount,
      pendingApprovalsCount: pendingApprovalRequests.length,
      draftSummary: deps.fetchMobileDashboardDraftComparisons
        ? summarizeDashboardDraftComparisons(draftComparisonRows, Boolean(auth.canEditSchedule))
        : null,
    },
    coverageBySection: buildCoverageSectionsResponse(byFocusArea),
    openShifts: openShifts.slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
    activity: buildActivityFeed(
      publishHistoryRows,
      shiftRequests,
      acceptedInvitations,
      nameByProfileId,
    ),
    staffHours: computeStaffHoursForPeriod(
      scheduleRows,
      shiftCategoriesById,
      focusAreaNameById,
      range,
      assignmentById,
      assignmentIdByPair,
    ),
    actionQueue: isAdmin ? pendingApprovalRequests : [],
  };
}
