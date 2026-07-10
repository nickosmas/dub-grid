import type {
  MobileDashboardResponse,
  MobileOpenShift,
  MobileScheduleRange,
  MobileShiftRequest,
} from "@dubgrid/contracts";
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

type FetchMobileOpenShifts = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    showAll: boolean;
    timeZone: string | null;
    startDate: string;
    endDate: string;
  },
) => Promise<MobileOpenShift[]>;

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

type FetchMobileOpenShiftContext = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<{
  shiftCategoryRows: DashboardShiftCategoryRow[];
  coverageRequirementRows: DashboardCoverageRequirementRow[];
}>;

export type DashboardScheduleCellRow = {
  emp_id: string;
  date: string;
  state: {
    kind: string;
    segments: Array<{ shiftId: number | null }>;
    customStartTime: string | null;
    customEndTime: string | null;
  };
  employees: { id: string; first_name: string; last_name: string };
};

type FetchPublishedMobileScheduleRows = (
  serviceClient: SupabaseClient,
  input: { orgId: string; startDate: string; endDate: string },
) => Promise<DashboardScheduleCellRow[]>;

export type DashboardPublishHistoryRow = {
  published_by: string | null;
  start_date: string;
  end_date: string;
  published_at: string;
};

type FetchMobilePublishHistoryRows = (
  serviceClient: SupabaseClient,
  orgId: string,
  input?: { startDate?: string; endDate?: string },
) => Promise<DashboardPublishHistoryRow[]>;

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

export function computeTotalRequiredSlots(
  requirements: DashboardCoverageRequirementRow[],
  dateKeys: string[],
): number {
  // Group by (focusAreaId, jobId, preferredShiftId); within each group,
  // a day-specific row takes precedence over the "every day" (day_of_week:
  // null) fallback — mirrors resolveCoverageRequirement's precedence
  // (apps/web/src/lib/schedule-logic.ts).
  const byCombo = new Map<string, DashboardCoverageRequirementRow[]>();
  for (const req of requirements) {
    const key = `${req.focus_area_id}_${req.job_id ?? "any"}_${req.preferred_shift_id ?? "any"}`;
    const list = byCombo.get(key) ?? [];
    list.push(req);
    byCombo.set(key, list);
  }

  let total = 0;
  for (const dateKey of dateKeys) {
    const dayOfWeek = new Date(`${dateKey}T00:00:00`).getDay();
    for (const group of byCombo.values()) {
      const match = group.find((r) => r.day_of_week === dayOfWeek) ?? group.find((r) => r.day_of_week === null);
      if (match) total += match.min_staff;
    }
  }
  return total;
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

export function groupOpenShiftsBySection(
  openShifts: MobileOpenShift[],
): MobileDashboardResponse["coverageBySection"] {
  const bySection = new Map<
    number,
    { focusAreaId: number; focusAreaName: string; openSlots: number }
  >();

  for (const shift of openShifts) {
    const existing = bySection.get(shift.focusAreaId);
    if (existing) {
      existing.openSlots += shift.needed;
    } else {
      bySection.set(shift.focusAreaId, {
        focusAreaId: shift.focusAreaId,
        focusAreaName: shift.focusAreaName ?? "Unassigned",
        openSlots: shift.needed,
      });
    }
  }

  return Array.from(bySection.values())
    .sort((a, b) => b.openSlots - a.openSlots)
    .slice(0, MAX_COVERAGE_SECTIONS);
}

export function computeStaffHoursForPeriod(
  scheduleRows: DashboardScheduleCellRow[],
  shiftCategoriesById: Map<number, DashboardShiftCategoryRow>,
  range: MobileScheduleRange,
  otThreshold = OVERTIME_THRESHOLD_HOURS,
): MobileDashboardResponse["staffHours"] {
  const byEmployee = new Map<string, { name: string; dailyHours: Map<string, number> }>();

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
    const entry = byEmployee.get(row.emp_id) ?? { name, dailyHours: new Map<string, number>() };
    entry.dailyHours.set(row.date, (entry.dailyHours.get(row.date) ?? 0) + hours);
    byEmployee.set(row.emp_id, entry);
  }

  // Overtime is a per-week concept: chunk the period into 7-day windows and
  // flag anyone over otThreshold in any single week, matching web's
  // computeEmployeeWeeklyHours (apps/web/src/lib/dashboard-stats.ts).
  const dateKeys = getDateKeysInRange(range.startDate, range.endDate);
  const results: MobileDashboardResponse["staffHours"] = [];

  for (const [employeeId, { name, dailyHours }] of byEmployee) {
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
      results.push({
        employeeId,
        employeeName: name,
        totalHours: Math.round(totalHours * 10) / 10,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
      });
    }
  }

  return results.sort((a, b) => b.overtimeHours - a.overtimeHours).slice(0, MAX_STAFF_HOURS_ENTRIES);
}

export function buildActivityFeedFromPublishHistory(
  rows: DashboardPublishHistoryRow[],
  nameByProfileId: Map<string, string>,
): MobileDashboardResponse["activity"] {
  return rows
    .slice()
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))
    .slice(0, MAX_ACTIVITY_ITEMS)
    .map((row, index) => {
      const publisherName = row.published_by
        ? (nameByProfileId.get(row.published_by) ?? "Someone")
        : "Someone";
      return {
        id: `${row.published_at}-${index}`,
        description: `${publisherName} published the schedule for ${formatUsDateForActivity(row.start_date)} to ${formatUsDateForActivity(row.end_date)}`,
        timestamp: row.published_at,
      };
    });
}

// ── Payload loader ───────────────────────────────────────────────────────

export async function loadMobileDashboardPayload(
  auth: MobileDashboardContext,
  range: MobileScheduleRange,
  deps: {
    fetchMobileOpenShifts: FetchMobileOpenShifts;
    fetchMobileShiftRequests: FetchMobileShiftRequests;
    fetchMobileOpenShiftContext: FetchMobileOpenShiftContext;
    fetchPublishedMobileScheduleRows: FetchPublishedMobileScheduleRows;
    fetchMobilePublishHistoryRows: FetchMobilePublishHistoryRows;
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

  const [openShifts, shiftRequests, openShiftContext, scheduleRows, publishHistoryRows] =
    await Promise.all([
      deps.fetchMobileOpenShifts(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        showAll: true,
        timeZone: auth.currentOrg.timezone ?? null,
        startDate: range.startDate,
        endDate: range.endDate,
      }),
      // Both admin and super_admin can approve requests (canApproveShiftRequests
      // is true for both by default), so the pending-approvals count on the
      // hero summary reflects both — only the ActionQueueCard list itself
      // stays admin-only on the client, matching web's AdminDashboard.
      deps.fetchMobileShiftRequests(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        includeOpenPickupRequests: false,
        startDate: range.startDate,
        endDate: range.endDate,
      }),
      deps.fetchMobileOpenShiftContext(auth.serviceClient, auth.currentOrg.id),
      deps.fetchPublishedMobileScheduleRows(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        startDate: range.startDate,
        endDate: range.endDate,
      }),
      deps.fetchMobilePublishHistoryRows(auth.serviceClient, auth.currentOrg.id, {
        startDate: range.startDate,
        endDate: range.endDate,
      }),
    ]);

  const shiftCategoriesById = new Map(
    openShiftContext.shiftCategoryRows.map((row) => [row.id, row]),
  );

  const publisherIds = Array.from(
    new Set(
      publishHistoryRows
        .map((row) => row.published_by)
        .filter((id): id is string => Boolean(id)),
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
  const openGapCount = openShifts.reduce((sum, shift) => sum + shift.needed, 0);
  const hasCoverageRequirements = openShiftContext.coverageRequirementRows.length > 0;
  const totalRequiredSlots = computeTotalRequiredSlots(
    openShiftContext.coverageRequirementRows,
    getDateKeysInRange(range.startDate, range.endDate),
  );
  const coveragePct = hasCoverageRequirements
    ? Math.max(0, Math.min(100, Math.round(((totalRequiredSlots - openGapCount) / Math.max(totalRequiredSlots, 1)) * 100)))
    : null;

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
    coverageBySection: groupOpenShiftsBySection(openShifts),
    openShifts: openShifts
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, MAX_OPEN_SHIFTS),
    activity: buildActivityFeedFromPublishHistory(publishHistoryRows, nameByProfileId),
    staffHours: computeStaffHoursForPeriod(scheduleRows, shiftCategoriesById, range),
    actionQueue: isAdmin ? pendingApprovalRequests.slice(0, MAX_ACTION_QUEUE_ITEMS) : [],
  };
}
