/**
 * staff-detail-stats.ts — Pure computation functions for the Staff Detail page.
 * No React, no DB calls — everything is independently testable.
 */

import type {
  ShiftMap,
  ShiftCode,
  Employee,
  FocusArea,
  RecurringShift,
  ShiftCategory,
  WeeklyHoursSummary,
  ShiftDistributionEntry,
  DayPatternEntry,
  FocusAreaDistributionEntry,
} from "@/types";
import { computeShiftDurationHours, resolveBreakMinutes } from "@/lib/dashboard-stats";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Weekly Hours History ───────────────────────────────

/**
 * Compute weekly hour totals for an employee over the past N weeks.
 * Returns array sorted from oldest to newest.
 */
export function computeEmployeeHoursHistory(
  empId: string,
  shifts: ShiftMap,
  shiftCodeById: Map<number, ShiftCode>,
  weekCount: number,
  otThreshold: number = 40,
  categoryById?: Map<number, ShiftCategory>,
  focusAreaById?: Map<number, FocusArea>,
): WeeklyHoursSummary[] {
  const now = new Date();
  const results: WeeklyHoursSummary[] = [];

  for (let w = weekCount - 1; w >= 0; w--) {
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - w * 7);

    const weekDateKeys: string[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      const y = day.getFullYear();
      const m = String(day.getMonth() + 1).padStart(2, "0");
      const dd = String(day.getDate()).padStart(2, "0");
      weekDateKeys.push(`${y}-${m}-${dd}`);
    }

    let totalHours = 0;
    let shiftCount = 0;

    for (const dateKey of weekDateKeys) {
      const entry = shifts[`${empId}_${dateKey}`];
      if (!entry || entry.isDelete || entry.shiftCodeIds.length === 0) continue;

      const hours = computeShiftDurationHours(
        entry.shiftCodeIds,
        shiftCodeById,
        entry.customStartTime,
        entry.customEndTime,
        categoryById,
        focusAreaById,
      );
      totalHours += hours;
      if (entry.shiftCodeIds.length > 0) {
        shiftCount++;
      }
    }

    const overtimeHours = Math.max(0, totalHours - otThreshold);
    const weekLabel = `${weekDateKeys[0].slice(5)}`;

    results.push({
      weekStart: weekDateKeys[0],
      weekLabel,
      totalHours: Math.round(totalHours * 10) / 10,
      shiftCount,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      isOvertime: totalHours > otThreshold,
    });
  }

  return results;
}

// ─── Shift Code Distribution ────────────────────────────

export function computeShiftDistribution(
  empId: string,
  shifts: ShiftMap,
  shiftCodeById: Map<number, ShiftCode>,
): ShiftDistributionEntry[] {
  const counts = new Map<number, number>();
  let total = 0;

  for (const [key, entry] of Object.entries(shifts)) {
    if (!key.startsWith(`${empId}_`)) continue;
    if (entry.isDelete || entry.shiftCodeIds.length === 0) continue;

    for (const codeId of entry.shiftCodeIds) {
      const sc = shiftCodeById.get(codeId);
      if (sc) {
        counts.set(codeId, (counts.get(codeId) ?? 0) + 1);
        total++;
        break; // count the primary code per shift
      }
    }
  }

  return Array.from(counts.entries())
    .map(([codeId, count]) => {
      const sc = shiftCodeById.get(codeId);
      return {
        shiftCodeId: codeId,
        label: sc?.label ?? "?",
        name: sc?.name ?? "Unknown",
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        color: sc?.color ?? "#CED4DA",
      };
    })
    .sort((a, b) => b.count - a.count);
}

// ─── Day-of-Week Pattern ────────────────────────────────

export function computeDayPattern(
  empId: string,
  shifts: ShiftMap,
  shiftCodeById: Map<number, ShiftCode>,
): DayPatternEntry[] {
  const dayCounts = new Array(7).fill(0);
  let total = 0;

  for (const [key, entry] of Object.entries(shifts)) {
    if (!key.startsWith(`${empId}_`)) continue;
    if (entry.isDelete || entry.shiftCodeIds.length === 0) continue;

    const dateKey = key.substring(key.indexOf("_") + 1);
    const date = new Date(dateKey + "T00:00:00");
    const dow = date.getDay();
    dayCounts[dow]++;
    total++;
  }

  return dayCounts.map((count, i) => ({
    day: DAY_LABELS[i],
    dayIndex: i,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));
}

// ─── Focus Area Distribution ────────────────────────────

export function computeFocusAreaDistribution(
  empId: string,
  shifts: ShiftMap,
  shiftCodeById: Map<number, ShiftCode>,
  focusAreas: FocusArea[],
): FocusAreaDistributionEntry[] {
  const faCounts = new Map<number, number>();
  let total = 0;

  for (const [key, entry] of Object.entries(shifts)) {
    if (!key.startsWith(`${empId}_`)) continue;
    if (entry.isDelete || entry.shiftCodeIds.length === 0) continue;

    for (const codeId of entry.shiftCodeIds) {
      const sc = shiftCodeById.get(codeId);
      if (sc && sc.focusAreaId != null) {
        faCounts.set(sc.focusAreaId, (faCounts.get(sc.focusAreaId) ?? 0) + 1);
        total++;
        break;
      }
    }
  }

  const faMap = new Map(focusAreas.map(fa => [fa.id, fa]));

  return Array.from(faCounts.entries())
    .map(([faId, count]) => {
      const fa = faMap.get(faId);
      return {
        focusAreaId: faId,
        name: fa?.name ?? "Unknown",
        shiftCount: count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        colorBg: fa?.colorBg ?? "#CED4DA",
      };
    })
    .sort((a, b) => b.shiftCount - a.shiftCount);
}

// ─── Overtime Summary ───────────────────────────────────

export interface OvertimeSummary {
  weeksWithOT: number;
  totalOTHours: number;
  avgOTPerWeek: number;
}

export function computeOvertimeSummary(
  hoursHistory: WeeklyHoursSummary[],
): OvertimeSummary {
  const weeksWithOT = hoursHistory.filter(w => w.isOvertime).length;
  const totalOTHours = hoursHistory.reduce((sum, w) => sum + w.overtimeHours, 0);
  return {
    weeksWithOT,
    totalOTHours: Math.round(totalOTHours * 10) / 10,
    avgOTPerWeek: weeksWithOT > 0
      ? Math.round((totalOTHours / weeksWithOT) * 10) / 10
      : 0,
  };
}

// ─── CSV Export ─────────────────────────────────────────

export function generateEmployeeCSV(
  employee: Employee,
  shifts: ShiftMap,
  shiftCodeById: Map<number, ShiftCode>,
  focusAreas: FocusArea[],
  certifications: { id: number; name: string }[],
  orgRoles: { id: number; name: string }[],
  recurringShifts: RecurringShift[],
  hoursHistory: WeeklyHoursSummary[],
): string {
  const lines: string[] = [];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

  // ── Profile section
  lines.push("EMPLOYEE PROFILE");
  lines.push(`Name,${esc(`${employee.firstName} ${employee.lastName}`)}`);
  lines.push(`Status,${employee.status}`);
  lines.push(`Email,${esc(employee.email)}`);
  lines.push(`Phone,${esc(employee.phone)}`);
  lines.push(`Seniority,${employee.seniority}`);

  const cert = certifications.find(c => c.id === employee.certificationId);
  lines.push(`Certification,${esc(cert?.name ?? "None")}`);

  const roleNames = employee.roleIds
    .map(id => orgRoles.find(r => r.id === id)?.name ?? "")
    .filter(Boolean);
  lines.push(`Roles,${esc(roleNames.join(", ") || "None")}`);

  const faNames = employee.focusAreaIds
    .map(id => focusAreas.find(fa => fa.id === id)?.name ?? "")
    .filter(Boolean);
  lines.push(`Focus Areas,${esc(faNames.join(", ") || "None")}`);
  lines.push("");

  // ── Weekly Hours section
  lines.push("WEEKLY HOURS SUMMARY");
  lines.push("Week Start,Total Hours,Shift Count,Overtime Hours");
  for (const week of hoursHistory) {
    lines.push(`${week.weekStart},${week.totalHours},${week.shiftCount},${week.overtimeHours}`);
  }
  lines.push("");

  // ── Shift History section
  lines.push("SHIFT HISTORY");
  lines.push("Date,Shift Code,Start Time,End Time,Status");
  const empShifts = Object.entries(shifts)
    .filter(([key]) => key.startsWith(`${employee.id}_`))
    .sort(([a], [b]) => {
      const dateA = a.substring(a.indexOf("_") + 1);
      const dateB = b.substring(b.indexOf("_") + 1);
      return dateB.localeCompare(dateA);
    });

  for (const [key, entry] of empShifts) {
    if (entry.isDelete) continue;
    const dateKey = key.substring(key.indexOf("_") + 1);
    const isAbsence = entry.absenceTypeId != null;
    const label = isAbsence
      ? entry.label
      : entry.shiftCodeIds.map(id => shiftCodeById.get(id)?.label ?? "?").join("/");
    const startTime = isAbsence ? "" : (entry.customStartTime ?? entry.shiftCodeIds.map(id => shiftCodeById.get(id)?.defaultStartTime).find(Boolean) ?? "");
    const endTime = isAbsence ? "" : (entry.customEndTime ?? entry.shiftCodeIds.map(id => shiftCodeById.get(id)?.defaultEndTime).find(Boolean) ?? "");
    const status = entry.isDraft ? "Draft" : "Published";
    lines.push(
      `${dateKey},${esc(label)},${startTime},${endTime},${status}`,
    );
  }
  lines.push("");

  // ── Recurring Shifts section
  lines.push("RECURRING SHIFTS");
  lines.push("Day,Shift Code,Effective From,Effective Until");
  for (const rs of recurringShifts) {
    lines.push(
      `${DAY_LABELS[rs.dayOfWeek]},${esc(rs.shiftLabel)},${rs.effectiveFrom},${rs.effectiveUntil ?? "Ongoing"}`,
    );
  }

  return lines.join("\n");
}
