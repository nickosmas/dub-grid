import type {
  MobileDashboardResponse,
  MobileOpenShift,
  MobileScheduleRange,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import type { CoverageByFocusAreaEntry, CoverageTotals } from "@dubgrid/schedule-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MobileApiAuthorizationError } from "./read";

const OVERTIME_THRESHOLD_HOURS = 40;
// Server-side caps are intentionally higher than each card's default
// collapsed view on mobile (3 rows) — the client's ExpandableList component
// reveals the rest of this same payload on "Show more" rather than paginating.
const MAX_COVERAGE_SECTIONS = 10;
const MAX_OPEN_SHIFTS = 10;
const MAX_ACTIVITY_ITEMS = 10;
const MAX_STAFF_HOURS_ENTRIES = 10;
const MAX_ACTION_QUEUE_ITEMS = 10;

export type MobileDashboardContext = {
  currentOrg: { id: string; timezone?: string | null };
  effectiveRole: string;
  serviceClient: SupabaseClient;
};

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

export type DashboardShiftCategoryRow = {
  id: number;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
};

export type DashboardCoverageRequirementRow = {
  focus_area_id: number;
  job_id: number | null;
  preferred_shift_id: number | null;
  day_of_week: number | null;
  min_staff: number;
};

export type DashboardFocusAreaRow = {
  id: number;
  name: string;
};

type FetchMobileOpenShiftContext = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<{
  shiftCategoryRows: DashboardShiftCategoryRow[];
  coverageRequirementRows: DashboardCoverageRequirementRow[];
  focusAreaRows: DashboardFocusAreaRow[];
}>;

export type DashboardScheduleCellRow = {
  emp_id: string;
  date: string;
  focus_area_id: number | null;
  state: {
    kind: string;
    segments: Array<{ shiftId: number | null }>;
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

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Activity descriptions are pre-composed server-side text (unlike other
// fields, which stay raw for the client to format), so the US date format
// has to be baked in here too.
function formatUsDateForActivity(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function durationHours(startTime: string, endTime: string): number {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  const mins = e > s ? e - s : 1440 - s + e; // handles overnight shifts
  return mins / 60;
}

function getDateKeysInRange(startDate: string, endDate: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function buildHeroSummary(input: {
  openGapCount: number;
  pendingApprovalsCount: number;
  hasCoverageRequirements: boolean;
}): MobileDashboardResponse["heroSummary"] {
  if (input.openGapCount > 0) {
    return {
      statusLabel: "Attention",
      title: `${input.openGapCount} coverage ${input.openGapCount === 1 ? "gap" : "gaps"}`,
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
    .sort((a, b) => a.pct - b.pct || b.openSlots - a.openSlots)
    .slice(0, MAX_COVERAGE_SECTIONS);
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

export function computeStaffHoursForPeriod(
  scheduleRows: DashboardScheduleCellRow[],
  shiftCategoriesById: Map<number, DashboardShiftCategoryRow>,
  focusAreaNameById: Map<number, string>,
  range: MobileScheduleRange,
  otThreshold = OVERTIME_THRESHOLD_HOURS,
): MobileDashboardResponse["staffHours"] {
  const byEmployee = new Map<
    string,
    { name: string; dailyHours: Map<string, number>; hoursByFocusArea: Map<number, number> }
  >();

  for (const row of scheduleRows) {
    if (row.state.kind !== "worked") continue;

    let hours = 0;
    if (row.state.customStartTime && row.state.customEndTime) {
      // Break is deducted from the first segment's category only — matches
      // web's computeShiftDurationHours (apps/web/src/lib/dashboard-stats.ts).
      const firstCategory =
        row.state.segments[0]?.shiftId != null
          ? shiftCategoriesById.get(row.state.segments[0].shiftId)
          : undefined;
      const raw = durationHours(row.state.customStartTime, row.state.customEndTime);
      hours = Math.max(0, raw - (firstCategory?.break_minutes ?? 0) / 60);
    } else {
      for (const segment of row.state.segments) {
        if (segment.shiftId == null) continue;
        const category = shiftCategoriesById.get(segment.shiftId);
        if (category?.start_time && category?.end_time) {
          const raw = durationHours(category.start_time, category.end_time);
          hours += Math.max(0, raw - (category.break_minutes ?? 0) / 60);
        }
      }
    }
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

  return results
    .sort((a, b) => b.overtimeHours - a.overtimeHours)
    .slice(0, MAX_STAFF_HOURS_ENTRIES);
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
  ]);

  const shiftCategoriesById = new Map(
    openShiftContext.shiftCategoryRows.map((row) => [row.id, row]),
  );
  const focusAreaNameById = new Map(
    openShiftContext.focusAreaRows.map((row) => [row.id, row.name]),
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

  const pendingApprovalRequests = shiftRequests.filter(
    (request) => request.status === "pending_approval",
  );
  const { openShifts, totals, byFocusArea, hasCoverageRequirements, scheduleRows } =
    coverageSummary;
  const openGapCount = openShifts.reduce((sum, shift) => sum + shift.needed, 0);
  const coveragePct = hasCoverageRequirements ? totals.pct : null;

  return {
    range,
    overtimeThresholdHours: OVERTIME_THRESHOLD_HOURS,
    heroSummary: buildHeroSummary({
      openGapCount,
      pendingApprovalsCount: pendingApprovalRequests.length,
      hasCoverageRequirements,
    }),
    metrics: {
      coveragePct,
      openGapCount,
      pendingApprovalsCount: pendingApprovalRequests.length,
    },
    coverageBySection: buildCoverageSectionsResponse(byFocusArea),
    openShifts: openShifts
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, MAX_OPEN_SHIFTS),
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
    ),
    actionQueue: isAdmin ? pendingApprovalRequests.slice(0, MAX_ACTION_QUEUE_ITEMS) : [],
  };
}
