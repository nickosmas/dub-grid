/**
 * dashboard-stats.ts — Pure computation functions for the Dashboard page.
 * No React, no DB calls — everything is independently testable.
 */

import type {
  ShiftMap,
  ShiftCode,
  Employee,
  FocusArea,
  CoverageRequirement,
  ShiftCategory,
  ShiftRequest,
  PublishHistoryEntry,
} from "@/types";
import { resolveRequirement } from "@/lib/schedule-logic";

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
  staffScheduled: { scheduled: number; total: number; prevScheduled: number; delta: number };
  otAlerts: { count: number; prevCount: number; delta: number };
}

export interface SectionCoverage {
  focusAreaId: number;
  focusAreaName: string;
  colorBg: string;
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
  shiftCodeLabel: string;
  focusAreaName: string;
  timeRange: string;
  needed: number;
  urgency: "high" | "medium" | "low";
}

export interface ShiftCodeCount {
  shiftCodeId: number;
  shiftCodeLabel: string;
  color: string;
  count: number;
}

export interface FocusAreaBreakdown {
  focusAreaId: number;
  focusAreaName: string;
  colorBg: string;
  total: number;
  codes: ShiftCodeCount[];
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
  return m ? `${hour12}:${String(m).padStart(2, "0")}${ampm}` : `${hour12}${ampm}`;
}

function parseShiftKey(key: string): { empId: string; dateKey: string } {
  const idx = key.indexOf("_");
  return { empId: key.substring(0, idx), dateKey: key.substring(idx + 1) };
}

/** Returns true if at least one shift code is a non-off-day work shift. */
function hasWorkShift(
  shiftCodeIds: number[],
  shiftCodeById: Map<number, ShiftCode>,
): boolean {
  return shiftCodeIds.some((id) => {
    const sc = shiftCodeById.get(id);
    return sc && !sc.isOffDay;
  });
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

/** Resolve effective break minutes for a shift code: category → focus area → 0. */
export function resolveBreakMinutes(
  shiftCode: ShiftCode,
  categoryById?: Map<number, ShiftCategory>,
  focusAreaById?: Map<number, FocusArea>,
): number {
  if (categoryById && shiftCode.categoryId != null) {
    const cat = categoryById.get(shiftCode.categoryId);
    if (cat?.breakMinutes != null) return cat.breakMinutes;
  }
  if (focusAreaById && shiftCode.focusAreaId != null) {
    const fa = focusAreaById.get(shiftCode.focusAreaId);
    if (fa?.breakMinutes != null) return fa.breakMinutes;
  }
  return 0;
}

export function computeShiftDurationHours(
  shiftCodeIds: number[],
  shiftCodeById: Map<number, ShiftCode>,
  customStartTime?: string | null,
  customEndTime?: string | null,
  categoryById?: Map<number, ShiftCategory>,
  focusAreaById?: Map<number, FocusArea>,
): number {
  if (customStartTime && customEndTime) {
    let hours = durationHoursFromTimes(customStartTime, customEndTime);
    // Deduct break from the first non-off-day code
    for (const codeId of shiftCodeIds) {
      const sc = shiftCodeById.get(codeId);
      if (sc && !sc.isOffDay) {
        hours = Math.max(0, hours - resolveBreakMinutes(sc, categoryById, focusAreaById) / 60);
        break;
      }
    }
    return hours;
  }
  let total = 0;
  for (const codeId of shiftCodeIds) {
    const sc = shiftCodeById.get(codeId);
    if (!sc || sc.isOffDay) continue;
    if (sc.defaultStartTime && sc.defaultEndTime) {
      let hours = durationHoursFromTimes(sc.defaultStartTime, sc.defaultEndTime);
      hours = Math.max(0, hours - resolveBreakMinutes(sc, categoryById, focusAreaById) / 60);
      total += hours;
    }
  }
  return total;
}

export function computeEmployeeWeeklyHours(
  empId: string,
  weekDateKeys: string[],
  shifts: ShiftMap,
  shiftCodeById: Map<number, ShiftCode>,
  otThreshold = 40,
  categoryById?: Map<number, ShiftCategory>,
  focusAreaById?: Map<number, FocusArea>,
): EmployeeHours {
  const dailyHours: Record<string, number> = {};
  let totalHours = 0;

  for (const dateKey of weekDateKeys) {
    const entry = shifts[`${empId}_${dateKey}`];
    if (!entry || entry.isDelete || entry.shiftCodeIds.length === 0) {
      dailyHours[dateKey] = 0;
      continue;
    }
    const hours = computeShiftDurationHours(
      entry.shiftCodeIds,
      shiftCodeById,
      entry.customStartTime,
      entry.customEndTime,
      categoryById,
      focusAreaById,
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
  shiftCodeById: Map<number, ShiftCode>,
  otThreshold = 40,
  categoryById?: Map<number, ShiftCategory>,
  focusAreaById?: Map<number, FocusArea>,
): EmployeeHours[] {
  return employees.map((emp) =>
    computeEmployeeWeeklyHours(emp.id, weekDateKeys, shifts, shiftCodeById, otThreshold, categoryById, focusAreaById),
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
  shiftCodeById: Map<number, ShiftCode>,
): number {
  let count = 0;
  for (const entry of Object.values(weekShifts)) {
    if (entry.isDelete) continue;
    if (entry.shiftCodeIds.length > 0 && hasWorkShift(entry.shiftCodeIds, shiftCodeById)) {
      count++;
    }
  }
  return count;
}

export function countStaffScheduled(
  weekShifts: ShiftMap,
  shiftCodeById: Map<number, ShiftCode>,
): number {
  const empIds = new Set<string>();
  for (const key of Object.keys(weekShifts)) {
    const entry = weekShifts[key];
    if (entry.isDelete) continue;
    if (entry.shiftCodeIds.length > 0 && hasWorkShift(entry.shiftCodeIds, shiftCodeById)) {
      empIds.add(parseShiftKey(key).empId);
    }
  }
  return empIds.size;
}

/** Compute overall coverage % and open slot count for a week. */
export function computeCoveragePctAndSlots(
  focusAreas: FocusArea[],
  shiftCodes: ShiftCode[],
  requirements: CoverageRequirement[],
  weekDates: Date[],
  employees: Employee[],
  shifts: ShiftMap,
): { pct: number; openSlots: number } {
  if (requirements.length === 0) return { pct: 100, openSlots: 0 };

  const empsByFa = new Map<number, Employee[]>();
  for (const fa of focusAreas) {
    empsByFa.set(fa.id, employees.filter((e) => e.focusAreaIds.includes(fa.id)));
  }

  const codesByFa = new Map<number, Set<number>>();
  for (const fa of focusAreas) {
    const ids = new Set<number>();
    for (const sc of shiftCodes) {
      if (sc.focusAreaId === fa.id || sc.focusAreaId == null) ids.add(sc.id);
    }
    codesByFa.set(fa.id, ids);
  }

  const requiredCodeIds = new Set(requirements.map((r) => r.shiftCodeId));
  let totalRequired = 0;
  let totalFilled = 0;

  for (const fa of focusAreas) {
    const faEmps = empsByFa.get(fa.id) ?? [];
    const faCodes = codesByFa.get(fa.id) ?? new Set();

    for (const codeId of requiredCodeIds) {
      if (!faCodes.has(codeId)) continue;

      for (const date of weekDates) {
        const req = resolveRequirement(requirements, fa.id, codeId, date.getDay());
        if (!req || req.minStaff <= 0) continue;

        const dateKey = formatDateKey(date);
        let actual = 0;
        for (const emp of faEmps) {
          const shift = shifts[`${emp.id}_${dateKey}`];
          if (shift && shift.shiftCodeIds.includes(codeId)) actual++;
        }

        totalRequired += req.minStaff;
        totalFilled += Math.min(actual, req.minStaff);
      }
    }
  }

  const pct = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 100;
  return { pct, openSlots: totalRequired - totalFilled };
}

/** Derive global coverage stats from pre-computed section data. */
export function coverageFromSections(
  sections: SectionCoverage[],
): { pct: number; openSlots: number } {
  const totalRequired = sections.reduce((s, sec) => s + sec.requiredTotal, 0);
  const totalFilled = sections.reduce((s, sec) => s + sec.filledTotal, 0);
  return {
    pct: totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 100,
    openSlots: totalRequired - totalFilled,
  };
}

/** Assemble the 4 stat card values with week-over-week deltas. */
export function computeWeeklyStats(
  current: { shiftCount: number; coveragePct: number; openSlots: number; staffScheduled: number; otCount: number },
  prev: { shiftCount: number; coveragePct: number; staffScheduled: number; otCount: number },
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
  shiftCodes: ShiftCode[],
  shiftCodeById: Map<number, ShiftCode>,
): SectionCoverage[] {
  const empsByFa = new Map<number, Employee[]>();
  for (const fa of focusAreas) {
    empsByFa.set(fa.id, employees.filter((e) => e.focusAreaIds.includes(fa.id)));
  }

  const codesByFa = new Map<number, Set<number>>();
  for (const fa of focusAreas) {
    const ids = new Set<number>();
    for (const sc of shiftCodes) {
      if (sc.focusAreaId === fa.id || sc.focusAreaId == null) ids.add(sc.id);
    }
    codesByFa.set(fa.id, ids);
  }

  const requiredCodeIds = new Set(coverageRequirements.map((r) => r.shiftCodeId));

  const allSections = focusAreas.map((fa) => {
    const faEmps = empsByFa.get(fa.id) ?? [];
    const faCodes = codesByFa.get(fa.id) ?? new Set();
    let totalFilled = 0;
    let totalRequired = 0;

    const daily: SectionCoverage["daily"] = weekDates.map((date) => {
      const dateKey = formatDateKey(date);
      const dow = date.getDay();
      let dayFilled = 0;
      let dayRequired = 0;

      for (const codeId of requiredCodeIds) {
        if (!faCodes.has(codeId)) continue;
        const req = resolveRequirement(coverageRequirements, fa.id, codeId, dow);
        if (!req || req.minStaff <= 0) continue;

        let actual = 0;
        for (const emp of faEmps) {
          const shift = shifts[`${emp.id}_${dateKey}`];
          if (shift && shift.shiftCodeIds.includes(codeId)) actual++;
        }

        dayRequired += req.minStaff;
        dayFilled += Math.min(actual, req.minStaff);
      }

      totalFilled += dayFilled;
      totalRequired += dayRequired;

      // Heatmap: count unique staff working in this section today
      let staffCount = 0;
      for (const emp of faEmps) {
        const shift = shifts[`${emp.id}_${dateKey}`];
        if (
          shift &&
          shift.shiftCodeIds.some(
            (id) => !shiftCodeById.get(id)?.isOffDay && faCodes.has(id),
          )
        ) {
          staffCount++;
        }
      }

      const ratio = dayRequired > 0 ? dayFilled / dayRequired : 1;
      return {
        dateKey,
        dayLabel: DAY_LABELS[dow],
        staffCount,
        status: ratio >= 0.9 ? "green" : ratio >= 0.7 ? "amber" : "red",
      };
    });

    const pct =
      totalRequired > 0
        ? Math.round((totalFilled / totalRequired) * 100)
        : 100;

    return {
      focusAreaId: fa.id,
      focusAreaName: fa.name,
      colorBg: fa.colorBg,
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
  shiftCodes: ShiftCode[],
  coverageRequirements: CoverageRequirement[],
  weekDates: Date[],
  employees: Employee[],
  shifts: ShiftMap,
  shiftCodeById: Map<number, ShiftCode>,
): OpenShift[] {
  const openShifts: OpenShift[] = [];

  const empsByFa = new Map<number, Employee[]>();
  for (const fa of focusAreas) {
    empsByFa.set(fa.id, employees.filter((e) => e.focusAreaIds.includes(fa.id)));
  }

  const codesByFa = new Map<number, Set<number>>();
  for (const fa of focusAreas) {
    const ids = new Set<number>();
    for (const sc of shiftCodes) {
      if (sc.focusAreaId === fa.id || sc.focusAreaId == null) ids.add(sc.id);
    }
    codesByFa.set(fa.id, ids);
  }

  const requiredCodeIds = new Set(coverageRequirements.map((r) => r.shiftCodeId));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const fa of focusAreas) {
    const faEmps = empsByFa.get(fa.id) ?? [];
    const faCodes = codesByFa.get(fa.id) ?? new Set();

    for (const codeId of requiredCodeIds) {
      if (!faCodes.has(codeId)) continue;
      const sc = shiftCodeById.get(codeId);
      if (!sc || sc.isOffDay) continue;

      for (const date of weekDates) {
        const req = resolveRequirement(
          coverageRequirements,
          fa.id,
          codeId,
          date.getDay(),
        );
        if (!req || req.minStaff <= 0) continue;

        const dateKey = formatDateKey(date);
        let actual = 0;
        for (const emp of faEmps) {
          const shift = shifts[`${emp.id}_${dateKey}`];
          if (shift && shift.shiftCodeIds.includes(codeId)) actual++;
        }

        const needed = req.minStaff - actual;
        if (needed <= 0) continue;

        const daysUntil = Math.floor(
          (date.getTime() - today.getTime()) / 86400000,
        );
        const urgency: OpenShift["urgency"] =
          daysUntil < 0 ? "low" : daysUntil <= 1 ? "high" : daysUntil <= 3 ? "medium" : "low";

        let timeRange = "";
        if (sc.defaultStartTime && sc.defaultEndTime) {
          timeRange = `${formatTime12h(sc.defaultStartTime)}\u2013${formatTime12h(sc.defaultEndTime)}`;
        }

        openShifts.push({
          id: `${fa.id}_${codeId}_${dateKey}`,
          date,
          dayOfWeek: SHORT_DAYS[date.getDay()],
          dayOfMonth: date.getDate(),
          shiftCodeLabel: sc.name || sc.label,
          focusAreaName: fa.name,
          timeRange,
          needed,
          urgency,
        });
      }
    }
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
  shiftCodeById: Map<number, ShiftCode>,
  _shiftCategories: ShiftCategory[],
  focusAreas: FocusArea[],
  employees: Employee[],
): ShiftTypeBreakdown {
  // Count by (focusAreaId, shiftCodeId) pair
  const faCounts = new Map<number, Map<number, number>>();
  let totalShifts = 0;
  const empMap = new Map(employees.map((e) => [e.id, e]));

  for (const [key, entry] of Object.entries(weekShifts)) {
    if (entry.isDelete) continue;
    if (entry.shiftCodeIds.length === 0) continue;
    if (!hasWorkShift(entry.shiftCodeIds, shiftCodeById)) continue;

    totalShifts++;

    const { empId } = parseShiftKey(key);
    const emp = empMap.get(empId);

    // Count the first non-off shift code, grouped by the shift code's focus area
    for (const codeId of entry.shiftCodeIds) {
      const sc = shiftCodeById.get(codeId);
      if (sc && !sc.isOffDay) {
        // Use the shift code's focus area; fall back to the employee's
        const faId = sc.focusAreaId ?? emp?.focusAreaIds[0] ?? -1;
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
      const codes: ShiftCodeCount[] = Array.from(codeCounts.entries())
        .map(([codeId, count]) => {
          const sc = shiftCodeById.get(codeId);
          return {
            shiftCodeId: codeId,
            shiftCodeLabel: sc?.name || sc?.label || "Unknown",
            color: sc?.color || "#CED4DA",
            count,
          };
        })
        .sort((a, b) => b.count - a.count);

      return {
        focusAreaId: faId,
        focusAreaName: fa?.name ?? "Unassigned",
        colorBg: fa?.colorBg ?? "#CED4DA",
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
  publishHistory: PublishHistoryEntry | null,
  shiftRequests: ShiftRequest[],
  otAlerts: OTAlert[],
  maxItems = 8,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  if (publishHistory) {
    items.push({
      id: `pub_${publishHistory.id}`,
      type: "publish",
      iconVariant: "success",
      description: "Schedule published",
      highlight: `${publishHistory.changeCount} changes`,
      timestamp: publishHistory.publishedAt,
      relativeTime: relativeTimeString(new Date(publishHistory.publishedAt)),
    });
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
      type: isPickup ? "open_shift" : "shift_change",
      iconVariant:
        req.status === "open"
          ? "warning"
          : req.status === "approved"
            ? "success"
            : "neutral",
      description: isPickup
        ? `Shift pickup · ${req.requesterShiftLabel}`
        : `Swap request · ${req.requesterName}`,
      highlight: `${req.requesterShiftDate} · ${statusLabel}`,
      timestamp: req.createdAt,
      relativeTime: relativeTimeString(new Date(req.createdAt)),
    });
  }

  for (const alert of otAlerts) {
    items.push({
      id: `ot_${alert.empId}`,
      type: "ot_alert",
      iconVariant: "danger",
      description: `OT alert — ${alert.empName} at ${alert.totalHours}h`,
      highlight: `+${alert.overtimeHours}h over limit`,
      timestamp: new Date().toISOString(),
      relativeTime: "Now",
    });
  }

  return items
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, maxItems);
}
