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
  computeCoverageCategorySnapshots,
} from "@/lib/schedule-logic";

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
    staffCount: number;
    status: "green" | "amber" | "red";
  }>;
}

export interface OpenShift {
  id: string;
  date: Date;
  dayOfWeek: string;
  dayOfMonth: number;
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
}

export interface TrendDataPoint {
  week: string;
  coveragePct: number;
  staffScheduled: number;
  totalSlots: number;
}

// ─── Private Helpers ────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function durationHoursFromTimes(startTime: string, endTime: string): number {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  const mins = e > s ? e - s : 1440 - s + e; // handles overnight
  return mins / 60;
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m
    ? `${hour12}:${String(m).padStart(2, "0")}${ampm}`
    : `${hour12}${ampm}`;
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

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

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

/** Resolve effective break minutes for a shift code: category → 0. */
export function resolveBreakMinutes(
  assignment: AssignmentDefinition,
  categoryById?: Map<number, ShiftCategory>,
): number {
  if (categoryById && assignment.categoryId != null) {
    const cat = categoryById.get(assignment.categoryId);
    if (cat?.breakMinutes != null) return cat.breakMinutes;
  }
  return 0;
}

export function computeShiftDurationHours(
  assignmentIds: number[],
  assignmentById: Map<number, AssignmentDefinition>,
  customStartTime?: string | null,
  customEndTime?: string | null,
  categoryById?: Map<number, ShiftCategory>,
): number {
  if (customStartTime && customEndTime) {
    // Handle pipe-delimited per-pill custom times (e.g. "07:00|09:00")
    const starts = customStartTime.split("|");
    const ends = customEndTime.split("|");
    if (starts.length > 1 || ends.length > 1) {
      let total = 0;
      for (let i = 0; i < Math.max(starts.length, ends.length); i++) {
        const s = starts[i] || "";
        const e = ends[i] || "";
        const sc =
          assignmentIds[i] != null
            ? assignmentById.get(assignmentIds[i])
            : undefined;
        if (s && e) {
          let h = durationHoursFromTimes(s, e);
          if (sc)
            h = Math.max(0, h - resolveBreakMinutes(sc, categoryById) / 60);
          total += h;
        } else if (sc?.defaultStartTime && sc.defaultEndTime) {
          let h = durationHoursFromTimes(
            sc.defaultStartTime,
            sc.defaultEndTime,
          );
          h = Math.max(0, h - resolveBreakMinutes(sc, categoryById) / 60);
          total += h;
        }
      }
      return total;
    }
    let hours = durationHoursFromTimes(customStartTime, customEndTime);
    // Deduct break from the first code
    for (const codeId of assignmentIds) {
      const sc = assignmentById.get(codeId);
      if (sc) {
        hours = Math.max(0, hours - resolveBreakMinutes(sc, categoryById) / 60);
        break;
      }
    }
    return hours;
  }
  let total = 0;
  for (const codeId of assignmentIds) {
    const sc = assignmentById.get(codeId);
    if (!sc) continue;
    if (sc.defaultStartTime && sc.defaultEndTime) {
      // Level 2: shift code custom times
      let hours = durationHoursFromTimes(
        sc.defaultStartTime,
        sc.defaultEndTime,
      );
      hours = Math.max(0, hours - resolveBreakMinutes(sc, categoryById) / 60);
      total += hours;
    } else if (categoryById && sc.categoryId != null) {
      // Level 1: fall back to shift category times
      const cat = categoryById.get(sc.categoryId);
      if (cat?.startTime && cat?.endTime) {
        let hours = durationHoursFromTimes(cat.startTime, cat.endTime);
        hours = Math.max(0, hours - resolveBreakMinutes(sc, categoryById) / 60);
        total += hours;
      }
    } else if (
      sc.defaultDurationHours != null ||
      sc.defaultDurationMinutes != null
    ) {
      // General codes: use duration
      let hours =
        (sc.defaultDurationHours ?? 0) + (sc.defaultDurationMinutes ?? 0) / 60;
      hours = Math.max(0, hours - resolveBreakMinutes(sc, categoryById) / 60);
      total += hours;
    }
  }
  return total;
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

  const overtimeHours = Math.max(0, totalHours - otThreshold);
  return {
    empId,
    totalHours: Math.round(totalHours * 10) / 10,
    dailyHours,
    isOvertime: totalHours > otThreshold,
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
        empName: emp
          ? `${emp.firstName.charAt(0)}. ${emp.lastName}`
          : "Unknown",
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
    if (
      entry.assignmentIds.length > 0 &&
      hasWorkShift(entry.assignmentIds, assignmentById)
    ) {
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
    if (
      entry.assignmentIds.length > 0 &&
      hasWorkShift(entry.assignmentIds, assignmentById)
    ) {
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
): { pct: number; openSlots: number; totalRequired: number } {
  if (requirements.length === 0) {
    return { pct: 100, openSlots: 0, totalRequired: 0 };
  }

  const empsByFa = new Map<number, Employee[]>();
  for (const fa of focusAreas) {
    empsByFa.set(
      fa.id,
      employees.filter((e) => e.focusAreaIds.includes(fa.id)),
    );
  }

  const codesByFa = buildAssignmentIdsByFocusArea(focusAreas, assignments);
  const snapshots = computeCoverageCategorySnapshots(
    focusAreas,
    [],
    assignments,
    requirements,
    weekDates,
    empsByFa,
    (empId, lookupDate) =>
      shifts[`${empId}_${formatDateKey(lookupDate)}`]?.assignmentIds ?? [],
    codesByFa,
  );
  let totalRequired = 0;
  let totalFilled = 0;

  for (const snapshot of snapshots) {
    totalRequired += snapshot.status.required;
    totalFilled += Math.min(snapshot.status.actual, snapshot.status.required);
  }

  const pct =
    totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 100;
  return { pct, openSlots: totalRequired - totalFilled, totalRequired };
}

/** Derive global coverage stats from pre-computed section data. */
export function coverageFromSections(sections: SectionCoverage[]): {
  pct: number;
  openSlots: number;
} {
  const totalRequired = sections.reduce((s, sec) => s + sec.requiredTotal, 0);
  const totalFilled = sections.reduce((s, sec) => s + sec.filledTotal, 0);
  return {
    pct:
      totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 100,
    openSlots: totalRequired - totalFilled,
  };
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

export function computeCoverageBySection(
  focusAreas: FocusArea[],
  weekDates: Date[],
  shifts: ShiftMap,
  employees: Employee[],
  coverageRequirements: CoverageRequirement[],
  assignments: AssignmentDefinition[],
): SectionCoverage[] {
  const empsByFa = new Map<number, Employee[]>();
  for (const fa of focusAreas) {
    empsByFa.set(
      fa.id,
      employees.filter((e) => e.focusAreaIds.includes(fa.id)),
    );
  }

  const codesByFa = buildAssignmentIdsByFocusArea(focusAreas, assignments);
  const snapshots = computeCoverageCategorySnapshots(
    focusAreas,
    [],
    assignments,
    coverageRequirements,
    weekDates,
    empsByFa,
    (empId, lookupDate) =>
      shifts[`${empId}_${formatDateKey(lookupDate)}`]?.assignmentIds ?? [],
    codesByFa,
  );

  const allSections = focusAreas.map((fa) => {
    const faEmps = empsByFa.get(fa.id) ?? [];
    const faCodes = codesByFa.get(fa.id) ?? new Set();
    const faSnapshots = snapshots.filter(
      (snapshot) => snapshot.focusAreaId === fa.id,
    );
    let totalFilled = 0;
    let totalRequired = 0;

    const daily: SectionCoverage["daily"] = weekDates.map((date) => {
      const dateKey = formatDateKey(date);
      let dayFilled = 0;
      let dayRequired = 0;

      for (const snapshot of faSnapshots) {
        if (formatDateKey(snapshot.date) !== dateKey) continue;
        dayRequired += snapshot.status.required;
        dayFilled += Math.min(snapshot.status.actual, snapshot.status.required);
      }

      totalFilled += dayFilled;
      totalRequired += dayRequired;

      // Heatmap: count unique staff working in this section today
      let staffCount = 0;
      for (const emp of faEmps) {
        const shift = shifts[`${emp.id}_${dateKey}`];
        if (shift && shift.assignmentIds.some((id) => faCodes.has(id))) {
          staffCount++;
        }
      }

      const ratio = dayRequired > 0 ? dayFilled / dayRequired : 1;
      return {
        dateKey,
        dayLabel: DAY_LABELS[date.getDay()],
        staffCount,
        status: ratio >= 1 ? "green" : "red",
      };
    });

    const pct =
      totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 100;

    return {
      focusAreaId: fa.id,
      focusAreaName: fa.name,
      filledTotal: totalFilled,
      requiredTotal: totalRequired,
      pct,
      daily,
    };
  });

  // Filter out sections with no coverage requirements (0/0 is meaningless)
  return allSections.filter((sec) => sec.requiredTotal > 0);
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
): OpenShift[] {
  const openShifts: OpenShift[] = [];

  const empsByFa = new Map<number, Employee[]>();
  for (const fa of focusAreas) {
    empsByFa.set(
      fa.id,
      employees.filter((e) => e.focusAreaIds.includes(fa.id)),
    );
  }

  const codesByFa = buildAssignmentIdsByFocusArea(focusAreas, assignments);
  const snapshots = computeCoverageCategorySnapshots(
    focusAreas,
    [],
    assignments,
    coverageRequirements,
    weekDates,
    empsByFa,
    (empId, lookupDate) =>
      shifts[`${empId}_${formatDateKey(lookupDate)}`]?.assignmentIds ?? [],
    codesByFa,
    assignmentLabelMap,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const snapshot of snapshots) {
    const needed = snapshot.status.required - snapshot.status.actual;
    if (needed <= 0) continue;

    const sc = assignmentById.get(snapshot.preferredOpenAssignmentDefinitionId);
    if (!sc) continue;

    const daysUntil = Math.floor(
      (snapshot.date.getTime() - today.getTime()) / 86400000,
    );
    const urgency: OpenShift["urgency"] =
      daysUntil < 0
        ? "low"
        : daysUntil <= 1
          ? "high"
          : daysUntil <= 3
            ? "medium"
            : "low";

    let timeRange = "";
    if (sc.defaultStartTime && sc.defaultEndTime) {
      timeRange = `${formatTime12h(sc.defaultStartTime)}\u2013${formatTime12h(sc.defaultEndTime)}`;
    }

    const label =
      snapshot.shiftCategoryName !== "Uncategorized"
        ? snapshot.shiftCategoryName
        : (assignmentLabelMap?.get(sc.id) ?? sc.name ?? sc.label);

    openShifts.push({
      id: `${snapshot.focusAreaId}_${snapshot.shiftCategoryId}_${formatDateKey(snapshot.date)}`,
      date: snapshot.date,
      dayOfWeek: SHORT_DAYS[snapshot.date.getDay()],
      dayOfMonth: snapshot.date.getDate(),
      requirementAssignmentDefinitionId:
        snapshot.preferredOpenAssignmentDefinitionId,
      eligibleAssignmentDefinitionIds: snapshot.eligibleAssignmentDefinitionIds,
      preferredOpenAssignmentDefinitionId:
        snapshot.preferredOpenAssignmentDefinitionId,
      ruleLabel: label,
      assignmentLabel: label,
      focusAreaName: snapshot.focusAreaName,
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
              assignmentLabelMap?.get(codeId) ??
              (sc?.name || sc?.label || "Unknown"),
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

export function buildActivityFeed(
  publishHistory: Array<PublishHistoryEntry | PublishHistoryEntryWithName>,
  shiftRequests: ShiftRequest[],
  invitations: Invitation[],
  maxItems = 8,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const historyEntry of publishHistory) {
    items.push({
      id: `pub_${historyEntry.id}`,
      type: "publish",
      iconVariant: "success",
      description: "Schedule published",
      highlight: `${historyEntry.changeCount} changes`,
      timestamp: historyEntry.publishedAt,
      relativeTime: relativeTimeString(new Date(historyEntry.publishedAt)),
    });

    for (const change of historyEntry.changes.slice(0, 12)) {
      items.push({
        id: `chg_${historyEntry.id}_${change.empId}_${change.date}_${change.kind}`,
        type: "shift_change",
        iconVariant:
          change.kind === "new"
            ? "success"
            : change.kind === "deleted"
              ? "danger"
              : "warning",
        description:
          change.kind === "new"
            ? `Shift added · ${change.date}`
            : change.kind === "deleted"
              ? `Shift removed · ${change.date}`
              : `Shift updated · ${change.date}`,
        highlight: `Employee ${change.empId}`,
        timestamp: historyEntry.publishedAt,
        relativeTime: relativeTimeString(new Date(historyEntry.publishedAt)),
      });
    }
  }

  for (const req of shiftRequests) {
    const isPickup = req.type === "pickup";
    const statusLabel =
      req.status === "open"
        ? "Open"
        : req.status === "pending_approval"
          ? "Pending"
          : req.status;

    items.push({
      id: `req_${req.id}`,
      type: "request",
      iconVariant:
        req.status === "open"
          ? "warning"
          : req.status === "approved"
            ? "success"
            : "neutral",
      description: isPickup
        ? `Pickup request · ${req.requesterShiftLabel}`
        : `Swap request · ${req.requesterName}`,
      highlight: `${req.requesterShiftDate} · ${statusLabel}`,
      timestamp: req.createdAt,
      relativeTime: relativeTimeString(new Date(req.createdAt)),
    });
  }

  for (const invitation of invitations) {
    if (!invitation.acceptedAt) continue;
    items.push({
      id: `signup_${invitation.id}`,
      type: "user_signup",
      iconVariant: "success",
      description: `User sign-up completed · ${invitation.email}`,
      highlight: invitation.roleToAssign,
      timestamp: invitation.acceptedAt,
      relativeTime: relativeTimeString(new Date(invitation.acceptedAt)),
    });
  }

  return items
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, maxItems);
}

/**
 * Compute coverage trend data for the current and previous periods.
 * Useful for displaying a trend line chart on the dashboard.
 */
export function computeCoverageTrendData(
  focusAreas: FocusArea[],
  assignments: AssignmentDefinition[],
  coverageRequirements: CoverageRequirement[],
  allEmployees: Employee[],
  allShifts: ShiftMap,
  periodStart: Date,
  periodDays: number,
): TrendDataPoint[] {
  const trend: TrendDataPoint[] = [];
  const activeEmployees = allEmployees.filter((e) => e.status === "active");
  const periods = 5; // Look back 5 periods

  for (let i = periods - 1; i >= 0; i--) {
    const periodStartDate = new Date(periodStart);
    periodStartDate.setDate(periodStartDate.getDate() - i * periodDays);
    const periodEndDate = new Date(periodStartDate);
    periodEndDate.setDate(periodEndDate.getDate() + periodDays - 1);

    const periodDates = getDatesInRange(periodStartDate, periodDays);
    const startKey = formatDateKey(periodStartDate);
    const endKey = formatDateKey(periodEndDate);

    const periodShifts = filterShiftsByWeek(allShifts, startKey, endKey);
    const coverage = computeCoveragePctAndSlots(
      focusAreas,
      assignments,
      coverageRequirements,
      periodDates,
      activeEmployees,
      periodShifts,
    );

    const staffScheduled = countStaffScheduled(
      periodShifts,
      new Map(assignments.map((sc) => [sc.id, sc])),
    );
    const totalSlots = coverage.totalRequired || 0;

    trend.push({
      week: formatDateKey(periodStartDate).slice(5), // e.g., "04-11"
      coveragePct: coverage.pct,
      staffScheduled,
      totalSlots,
    });
  }

  return trend;
}
