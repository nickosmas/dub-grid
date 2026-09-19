/**
 * dashboard-stats.ts — Pure computation functions for the Dashboard page.
 * No React, no DB calls — everything is independently testable.
 */

import type {
  ShiftMap,
  AssignmentDefinition,
  Employee,
  FocusArea,
  CoverageRequirement,
  ShiftCategory,
  ShiftRequest,
  PublishHistoryEntry,
  PublishHistoryEntryWithName,
  Invitation,
} from "@/types";
import {
  buildAssignmentDefinitionIdsByFocusArea as buildAssignmentIdsByFocusArea,
  buildShiftMapSegmentsForKey,
} from "@/lib/schedule-logic";
import {
  assembleDashboardCoverage,
  classifyOpenShiftUrgency,
  computeShiftSegmentHours,
  hasShiftStartedAtTimeRanges,
  type CoverageTotals,
} from "@dubgrid/schedule-core";
import {
  describeMemberSignupActivity,
  describeShiftRequestActivity,
  summarizePublishChanges,
  type CoverageRuleConfig,
} from "@dubgrid/domain";
import { formatDateKey, getWeekStart, addDays } from "@/lib/utils";

// ─── Exported Types ─────────────────────────────────────

export interface EmployeeHours {
  empId: string;
  totalHours: number;
  dailyHours: Record<string, number>;
  isOvertime: boolean;
  overtimeHours: number;
}

export interface OTAlert {
  empId: string;
  empName: string;
  totalHours: number;
  overtimeHours: number;
  focusAreaName: string;
}

export interface WeeklyStats {
  totalShifts: { value: number; prevValue: number; delta: number };
  coverage: { pct: number; prevPct: number; delta: number; openSlots: number };
  staffScheduled: {
    scheduled: number;
    total: number;
    prevScheduled: number;
    delta: number;
  };
  otAlerts: { count: number; prevCount: number; delta: number };
}

export interface SectionCoverage {
  focusAreaId: number;
  focusAreaName: string;
  filledTotal: number;
  requiredTotal: number;
  pct: number;
  daily: Array<{
    dateKey: string;
    dayLabel: string;
    filledCount: number;
    requiredCount: number;
    staffCount: number;
    status: "green" | "amber" | "red" | "none";
  }>;
}

export interface OpenShift {
  id: string;
  date: Date;
  dayOfWeek: string;
  dayOfMonth: number;
  focusAreaId: number;
  requirementAssignmentDefinitionId: number;
  eligibleAssignmentDefinitionIds: number[];
  preferredOpenAssignmentDefinitionId: number;
  ruleLabel: string;
  assignmentLabel: string;
  focusAreaName: string;
  timeRange: string;
  needed: number;
  urgency: "high" | "medium" | "low";
}

export interface AssignmentCount {
  assignmentId: number;
  assignmentLabel: string;
  color: string;
  count: number;
}

export interface FocusAreaBreakdown {
  focusAreaId: number;
  focusAreaName: string;
  total: number;
  codes: AssignmentCount[];
}

export interface ShiftTypeBreakdown {
  byFocusArea: FocusAreaBreakdown[];
  totalShifts: number;
}

export type ActivityIconVariant = "success" | "danger" | "warning" | "neutral";

export interface ActivityItem {
  id: string;
  type: string;
  iconVariant: ActivityIconVariant;
  description: string;
  highlight: string;
  timestamp: string;
  relativeTime: string;
  href: string;
}

// ─── Private Helpers ────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m ? `${hour12}:${String(m).padStart(2, "0")}${ampm}` : `${hour12}${ampm}`;
}

function parseShiftKey(key: string): { empId: string; dateKey: string } {
  const idx = key.indexOf("_");
  return { empId: key.substring(0, idx), dateKey: key.substring(idx + 1) };
}

/** Returns true if at least one shift code is a work shift (all codes are work shifts now). */
function hasWorkShift(
  assignmentIds: number[],
  assignmentById: Map<number, AssignmentDefinition>,
): boolean {
  return assignmentIds.some((id) => assignmentById.has(id));
}

// ─── Date Helpers ───────────────────────────────────────

export function getWeekDates(weekStart: Date): Date[] {
  return getDatesInRange(weekStart, 7);
}

export function getDatesInRange(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// `getWeekStart` and `addDays` are the canonical local-time helpers from
// `@/lib/utils`; re-exported here so Dashboard-facing consumers keep a single
// import surface.
export { getWeekStart, addDays };

// ─── Shift Filtering ────────────────────────────────────

export function filterShiftsByWeek(
  shifts: ShiftMap,
  weekStartKey: string,
  weekEndKey: string,
): ShiftMap {
  const filtered: ShiftMap = {};
  for (const key of Object.keys(shifts)) {
    const { dateKey } = parseShiftKey(key);
    if (dateKey >= weekStartKey && dateKey <= weekEndKey) {
      filtered[key] = shifts[key];
    }
  }
  return filtered;
}

// ─── Hour Computation ───────────────────────────────────

/**
 * Thin wrapper over @dubgrid/schedule-core's canonical computeShiftSegmentHours
 * — the same function mobile's staff-hours computation now calls, so an
 * employee's overtime status can't diverge between platforms.
 */
export function computeShiftDurationHours(
  assignmentIds: number[],
  assignmentById: Map<number, AssignmentDefinition>,
  customStartTime?: string | null,
  customEndTime?: string | null,
  categoryById?: Map<number, ShiftCategory>,
): number {
  return computeShiftSegmentHours(
    assignmentIds,
    assignmentById,
    customStartTime,
    customEndTime,
    categoryById ?? new Map(),
  );
}

export function computeEmployeeWeeklyHours(
  empId: string,
  weekDateKeys: string[],
  shifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
  otThreshold = 40,
  categoryById?: Map<number, ShiftCategory>,
): EmployeeHours {
  const dailyHours: Record<string, number> = {};
  let totalHours = 0;

  for (const dateKey of weekDateKeys) {
    const entry = shifts[`${empId}_${dateKey}`];
    if (!entry || entry.isDelete || entry.assignmentIds.length === 0) {
      dailyHours[dateKey] = 0;
      continue;
    }
    const hours = computeShiftDurationHours(
      entry.assignmentIds,
      assignmentById,
      entry.customStartTime,
      entry.customEndTime,
      categoryById,
    );
    dailyHours[dateKey] = hours;
    totalHours += hours;
  }

  // Overtime is a per-week concept: a multi-week period (e.g. the dashboard's
  // "2 Weeks" view) must flag anyone who exceeded otThreshold in *any* single
  // week, not just when the period's combined total crosses a scaled-up
  // threshold. Averaging a heavy week against a light one would otherwise
  // hide real weekly overtime. So chunk into 7-day weeks and evaluate each
  // one against the same flat otThreshold, summing the overage.
  let overtimeHours = 0;
  for (let i = 0; i < weekDateKeys.length; i += 7) {
    let weekTotal = 0;
    for (const dateKey of weekDateKeys.slice(i, i + 7)) {
      weekTotal += dailyHours[dateKey] ?? 0;
    }
    overtimeHours += Math.max(0, weekTotal - otThreshold);
  }

  return {
    empId,
    totalHours: Math.round(totalHours * 10) / 10,
    dailyHours,
    isOvertime: overtimeHours > 0,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
  };
}

export function computeAllEmployeeHours(
  employees: Employee[],
  weekDateKeys: string[],
  shifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
  otThreshold = 40,
  categoryById?: Map<number, ShiftCategory>,
): EmployeeHours[] {
  return employees.map((emp) =>
    computeEmployeeWeeklyHours(
      emp.id,
      weekDateKeys,
      shifts,
      assignmentById,
      otThreshold,
      categoryById,
    ),
  );
}

export function computeOTAlerts(
  allHours: EmployeeHours[],
  employees: Employee[],
  focusAreas: FocusArea[],
): OTAlert[] {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const faMap = new Map(focusAreas.map((fa) => [fa.id, fa]));

  return allHours
    .filter((h) => h.isOvertime)
    .map((h) => {
      const emp = empMap.get(h.empId);
      const faId = emp?.focusAreaIds[0];
      const fa = faId != null ? faMap.get(faId) : undefined;
      return {
        empId: h.empId,
        empName: emp ? `${emp.firstName.charAt(0)}. ${emp.lastName}` : "Unknown",
        totalHours: h.totalHours,
        overtimeHours: h.overtimeHours,
        focusAreaName: fa?.name ?? "",
      };
    })
    .sort((a, b) => b.overtimeHours - a.overtimeHours);
}

// ─── Stat Card Metrics ──────────────────────────────────

export function countShifts(
  weekShifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
): number {
  let count = 0;
  for (const entry of Object.values(weekShifts)) {
    if (entry.isDelete) continue;
    if (entry.assignmentIds.length > 0 && hasWorkShift(entry.assignmentIds, assignmentById)) {
      count++;
    }
  }
  return count;
}

export function countStaffScheduled(
  weekShifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
): number {
  const empIds = new Set<string>();
  for (const key of Object.keys(weekShifts)) {
    const entry = weekShifts[key];
    if (entry.isDelete) continue;
    if (entry.assignmentIds.length > 0 && hasWorkShift(entry.assignmentIds, assignmentById)) {
      empIds.add(parseShiftKey(key).empId);
    }
  }
  return empIds.size;
}

/** Compute overall coverage % and open slot count for a week. */
export function computeCoveragePctAndSlots(
  focusAreas: FocusArea[],
  assignments: AssignmentDefinition[],
  requirements: CoverageRequirement[],
  weekDates: Date[],
  employees: Employee[],
  shifts: ShiftMap,
  shiftCategories: ShiftCategory[] = [],
  coverageRuleConfig?: Partial<CoverageRuleConfig> | null,
): { pct: number; openSlots: number; totalRequired: number } {
  const { totals } = assembleDashboardCoverage({
    focusAreas,
    shiftCategories,
    assignments,
    requirements,
    employees,
    dates: weekDates,
    segmentsForKey: buildShiftMapSegmentsForKey(shifts),
    coverageRuleConfig,
  });
  return { pct: totals.pct, openSlots: totals.openSlots, totalRequired: totals.totalRequired };
}

/** Assemble the 4 stat card values with week-over-week deltas. */
export function computeWeeklyStats(
  current: {
    shiftCount: number;
    coveragePct: number;
    openSlots: number;
    staffScheduled: number;
    otCount: number;
  },
  prev: {
    shiftCount: number;
    coveragePct: number;
    staffScheduled: number;
    otCount: number;
  },
  totalActiveStaff: number,
): WeeklyStats {
  return {
    totalShifts: {
      value: current.shiftCount,
      prevValue: prev.shiftCount,
      delta: current.shiftCount - prev.shiftCount,
    },
    coverage: {
      pct: current.coveragePct,
      prevPct: prev.coveragePct,
      delta: current.coveragePct - prev.coveragePct,
      openSlots: current.openSlots,
    },
    staffScheduled: {
      scheduled: current.staffScheduled,
      total: totalActiveStaff,
      prevScheduled: prev.staffScheduled,
      delta: current.staffScheduled - prev.staffScheduled,
    },
    otAlerts: {
      count: current.otCount,
      prevCount: prev.otCount,
      delta: current.otCount - prev.otCount,
    },
  };
}

// ─── Coverage By Section ────────────────────────────────

export interface SectionCoverageResult {
  sections: SectionCoverage[];
  totals: CoverageTotals;
}

export function computeCoverageBySection(
  focusAreas: FocusArea[],
  weekDates: Date[],
  shifts: ShiftMap,
  employees: Employee[],
  coverageRequirements: CoverageRequirement[],
  assignments: AssignmentDefinition[],
  shiftCategories: ShiftCategory[] = [],
  coverageRuleConfig?: Partial<CoverageRuleConfig> | null,
): SectionCoverageResult {
  const empsByFa = new Map<number, Employee[]>();
  for (const fa of focusAreas) {
    empsByFa.set(
      fa.id,
      employees.filter((e) => e.focusAreaIds.includes(fa.id)),
    );
  }

  const codesByFa = buildAssignmentIdsByFocusArea(focusAreas, assignments);
  const assembly = assembleDashboardCoverage({
    focusAreas,
    shiftCategories,
    assignments,
    requirements: coverageRequirements,
    employees,
    dates: weekDates,
    segmentsForKey: buildShiftMapSegmentsForKey(shifts),
    coverageRuleConfig,
  });
  const byFocusAreaMap = new Map(assembly.byFocusArea.map((entry) => [entry.focusAreaId, entry]));

  const allSections = focusAreas.map((fa) => {
    const faEmps = empsByFa.get(fa.id) ?? [];
    const faCodes = codesByFa.get(fa.id) ?? new Set();
    const faSnapshots = assembly.snapshots.filter((snapshot) => snapshot.focusAreaId === fa.id);

    const daily: SectionCoverage["daily"] = weekDates.map((date) => {
      const dateKey = formatDateKey(date);
      let dayFilled = 0;
      let dayRequired = 0;

      for (const snapshot of faSnapshots) {
        if (formatDateKey(snapshot.date) !== dateKey) continue;
        dayRequired += snapshot.status.required;
        dayFilled += Math.min(snapshot.status.actual, snapshot.status.required);
      }

      // Heatmap: count unique staff working in this section today
      let staffCount = 0;
      for (const emp of faEmps) {
        const shift = shifts[`${emp.id}_${dateKey}`];
        if (shift && shift.assignmentIds.some((id) => faCodes.has(id))) {
          staffCount++;
        }
      }

      const ratio = dayRequired > 0 ? dayFilled / dayRequired : 1;
      const status: SectionCoverage["daily"][number]["status"] =
        dayRequired === 0 ? "none" : ratio >= 1 ? "green" : dayFilled > 0 ? "amber" : "red";
      return {
        dateKey,
        dayLabel: DAY_LABELS[date.getDay()],
        filledCount: dayFilled,
        requiredCount: dayRequired,
        staffCount,
        status,
      };
    });

    const faTotals = byFocusAreaMap.get(fa.id);

    return {
      focusAreaId: fa.id,
      focusAreaName: fa.name,
      filledTotal: faTotals?.filledTotal ?? 0,
      requiredTotal: faTotals?.requiredTotal ?? 0,
      pct: faTotals?.pct ?? 100,
      daily,
    };
  });

  return {
    // Filter out sections with no coverage requirements (0/0 is meaningless).
    sections: allSections.filter((sec) => sec.requiredTotal > 0),
    totals: assembly.totals,
  };
}

// ─── Open Shifts ────────────────────────────────────────

export function computeOpenShifts(
  focusAreas: FocusArea[],
  assignments: AssignmentDefinition[],
  coverageRequirements: CoverageRequirement[],
  weekDates: Date[],
  employees: Employee[],
  shifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
  assignmentLabelMap?: Map<number, string>,
  shiftCategories: ShiftCategory[] = [],
  coverageRuleConfig?: Partial<CoverageRuleConfig> | null,
  options?: {
    now?: Date;
    timeZone?: string | null;
  },
): OpenShift[] {
  const openShifts: OpenShift[] = [];

  const { gaps } = assembleDashboardCoverage({
    focusAreas,
    shiftCategories,
    assignments,
    requirements: coverageRequirements,
    employees,
    dates: weekDates,
    segmentsForKey: buildShiftMapSegmentsForKey(shifts),
    coverageRuleConfig,
    assignmentLabelMap,
  });
  const today = options?.now ? new Date(options.now) : new Date();
  today.setHours(0, 0, 0, 0);

  // `gaps` already contains only unmet (hasRequirement && !isMet) snapshots.
  for (const gap of gaps) {
    const needed = gap.status.required - gap.status.actual;

    const sc = assignmentById.get(gap.preferredOpenAssignmentDefinitionId);
    if (!sc) continue;
    const dateKey = formatDateKey(gap.date);
    if (
      options?.now &&
      hasShiftStartedAtTimeRanges({
        shiftDate: dateKey,
        timeRanges: [{ start: sc.defaultStartTime ?? "" }],
        now: options.now,
        timeZone: options.timeZone ?? null,
      })
    ) {
      continue;
    }
    const requirementAssignmentDefinitionId = gap.preferredOpenAssignmentDefinitionId;

    const urgency: OpenShift["urgency"] = classifyOpenShiftUrgency(gap.date, today);

    let timeRange = "";
    if (sc.defaultStartTime && sc.defaultEndTime) {
      timeRange = `${formatTime12h(sc.defaultStartTime)}\u2013${formatTime12h(sc.defaultEndTime)}`;
    }

    const label =
      gap.shiftCategoryName !== "Uncategorized"
        ? gap.shiftCategoryName
        : (assignmentLabelMap?.get(sc.id) ?? sc.name ?? sc.label);

    openShifts.push({
      id: `${gap.focusAreaId}_${requirementAssignmentDefinitionId}_${dateKey}`,
      date: gap.date,
      dayOfWeek: SHORT_DAYS[gap.date.getDay()],
      dayOfMonth: gap.date.getDate(),
      focusAreaId: gap.focusAreaId,
      requirementAssignmentDefinitionId,
      eligibleAssignmentDefinitionIds: gap.eligibleAssignmentDefinitionIds,
      preferredOpenAssignmentDefinitionId: gap.preferredOpenAssignmentDefinitionId,
      ruleLabel: label,
      assignmentLabel: label,
      focusAreaName: gap.focusAreaName,
      timeRange,
      needed,
      urgency,
    });
  }

  return openShifts.sort((a, b) => {
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    return diff !== 0 ? diff : a.date.getTime() - b.date.getTime();
  });
}

// ─── Shift Type Breakdown ───────────────────────────────

export function computeShiftBreakdown(
  weekShifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
  _shiftCategories: ShiftCategory[],
  focusAreas: FocusArea[],
  _employees: Employee[],
  assignmentLabelMap?: Map<number, string>,
): ShiftTypeBreakdown {
  // Count by (focusAreaId, assignmentId) pair
  const faCounts = new Map<number, Map<number, number>>();
  let totalShifts = 0;
  for (const entry of Object.values(weekShifts)) {
    if (entry.isDelete) continue;
    if (entry.assignmentIds.length === 0) continue;
    if (!hasWorkShift(entry.assignmentIds, assignmentById)) continue;

    totalShifts++;

    // Count the first non-off shift code, grouped by the shift code's focus area
    for (const codeId of entry.assignmentIds) {
      const sc = assignmentById.get(codeId);
      if (sc) {
        const faId = sc.focusAreaId ?? -1;
        if (!faCounts.has(faId)) faCounts.set(faId, new Map());
        const codeCounts = faCounts.get(faId)!;
        codeCounts.set(codeId, (codeCounts.get(codeId) ?? 0) + 1);
        break;
      }
    }
  }

  const faById = new Map(focusAreas.map((fa) => [fa.id, fa]));

  const byFocusArea: FocusAreaBreakdown[] = Array.from(faCounts.entries())
    .map(([faId, codeCounts]) => {
      const fa = faById.get(faId);
      const codes: AssignmentCount[] = Array.from(codeCounts.entries())
        .map(([codeId, count]) => {
          const sc = assignmentById.get(codeId);
          return {
            assignmentId: codeId,
            assignmentLabel:
              assignmentLabelMap?.get(codeId) ?? (sc?.name || sc?.label || "Unknown"),
            color: sc?.color || "#CED4DA",
            count,
          };
        })
        .sort((a, b) => b.count - a.count);

      return {
        focusAreaId: faId,
        focusAreaName: fa?.name ?? "Unassigned",
        total: codes.reduce((s, c) => s + c.count, 0),
        codes,
      };
    })
    .sort((a, b) => b.total - a.total);

  return { byFocusArea, totalShifts };
}

// ─── Activity Feed ──────────────────────────────────────

function relativeTimeString(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Upcoming";
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hr ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

function getShiftRequestDisplayShiftName(request: ShiftRequest): string {
  const segmentNames =
    request.requesterPresentation?.segments
      ?.map((segment) => segment.shiftName?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];
  const uniqueSegmentNames = [...new Set(segmentNames)];

  if (uniqueSegmentNames.length > 0) {
    return uniqueSegmentNames.join(" + ");
  }

  return (
    request.requesterPresentation?.shiftName?.trim() ||
    request.requesterPresentation?.label?.trim() ||
    request.requesterShiftLabel
  );
}

export function buildActivityFeed(
  publishHistory: Array<PublishHistoryEntry | PublishHistoryEntryWithName>,
  shiftRequests: ShiftRequest[],
  invitations: Invitation[],
  maxItems = 8,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const historyEntry of publishHistory) {
    const summary = summarizePublishChanges(historyEntry.changes, historyEntry.changeCount);
    const publisher =
      "publishedByName" in historyEntry && historyEntry.publishedByName
        ? `${historyEntry.publishedByName} published the schedule`
        : "Schedule published";
    items.push({
      id: `pub_${historyEntry.id}`,
      type: "publish",
      iconVariant: "success",
      description: `${publisher} · ${summary}`,
      highlight: summary,
      timestamp: historyEntry.publishedAt,
      relativeTime: relativeTimeString(new Date(historyEntry.publishedAt)),
      href: "/schedule",
    });
  }

  for (const req of shiftRequests) {
    items.push({
      id: `req_${req.id}`,
      type: "request",
      iconVariant:
        req.status === "open" ? "warning" : req.status === "approved" ? "success" : "neutral",
      description: describeShiftRequestActivity({
        type: req.type,
        shiftName: getShiftRequestDisplayShiftName(req),
        requesterName: req.requesterName,
        status: req.status,
      }),
      highlight: req.requesterShiftDate,
      timestamp: req.createdAt,
      relativeTime: relativeTimeString(new Date(req.createdAt)),
      href: "/schedule",
    });
  }

  for (const invitation of invitations) {
    if (!invitation.acceptedAt) continue;
    items.push({
      id: `signup_${invitation.id}`,
      type: "user_signup",
      iconVariant: "success",
      description: describeMemberSignupActivity({
        email: invitation.email,
        role: invitation.roleToAssign,
      }),
      highlight: "",
      timestamp: invitation.acceptedAt,
      relativeTime: relativeTimeString(new Date(invitation.acceptedAt)),
      href: "/people",
    });
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, maxItems);
}
