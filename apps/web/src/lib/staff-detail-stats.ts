/**
 * staff-detail-stats.ts — Pure computation functions for the Staff Detail page.
 * No React, no DB calls — everything is independently testable.
 */

import type {
  ShiftMap,
  AssignmentDefinition,
  Employee,
  FocusArea,
  RecurringShift,
  ShiftCategory,
  WeeklyHoursSummary,
  ShiftDistributionEntry,
  DayPatternEntry,
  FocusAreaDistributionEntry,
} from "@/types";
import { computeShiftDurationHours } from "@/lib/dashboard-stats";
import { addDaysToIsoDate, formatScheduleTimeRange } from "@dubgrid/schedule-core";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Weekly Hours History ───────────────────────────────

/**
 * Compute weekly hour totals for an employee over the past N weeks.
 * Returns array sorted from oldest to newest.
 */
export function computeEmployeeHoursHistory(
  empId: string,
  shifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
  weekCount: number,
  otThreshold: number = 40,
  categoryById?: Map<number, ShiftCategory>,
  overviewStartDate?: string,
): WeeklyHoursSummary[] {
  const now = new Date();
  const results: WeeklyHoursSummary[] = [];

  for (let w = weekCount - 1; w >= 0; w--) {
    const weekIndex = weekCount - 1 - w;
    const weekDateKeys = overviewStartDate
      ? Array.from({ length: 7 }, (_, dayIndex) =>
          addDaysToIsoDate(overviewStartDate, weekIndex * 7 + dayIndex),
        )
      : getLocalWeekDateKeys(now, w);

    let totalHours = 0;
    let shiftCount = 0;

    for (const dateKey of weekDateKeys) {
      const entry = shifts[`${empId}_${dateKey}`];
      if (!entry || entry.isDelete || entry.assignmentIds.length === 0) continue;

      const hours = computeShiftDurationHours(
        entry.assignmentIds,
        assignmentById,
        entry.customStartTime,
        entry.customEndTime,
        categoryById,
      );
      totalHours += hours;
      if (entry.assignmentIds.length > 0) {
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

function getLocalWeekDateKeys(now: Date, weeksAgo: number): string[] {
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() - weeksAgo * 7);
  return Array.from({ length: 7 }, (_, dayIndex) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + dayIndex);
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, "0");
    const date = String(day.getDate()).padStart(2, "0");
    return `${year}-${month}-${date}`;
  });
}

// ─── Assignment Distribution ────────────────────────────

export function computeShiftDistribution(
  empId: string,
  shifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
  startDate?: string,
  endDate?: string,
): ShiftDistributionEntry[] {
  const counts = new Map<number, number>();
  let total = 0;

  for (const [key, entry] of Object.entries(shifts)) {
    if (!key.startsWith(`${empId}_`)) continue;
    const dateKey = key.slice(empId.length + 1);
    if (startDate && dateKey < startDate) continue;
    if (endDate && dateKey > endDate) continue;
    if (entry.isDelete || entry.assignmentIds.length === 0) continue;

    for (const codeId of entry.assignmentIds) {
      const sc = assignmentById.get(codeId);
      if (sc) {
        counts.set(codeId, (counts.get(codeId) ?? 0) + 1);
        total++;
        break; // count the primary code per shift
      }
    }
  }

  return Array.from(counts.entries())
    .map(([codeId, count]) => {
      const sc = assignmentById.get(codeId);
      return {
        assignmentId: codeId,
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

export function computeDayPattern(empId: string, shifts: ShiftMap): DayPatternEntry[] {
  const dayCounts = new Array(7).fill(0);
  let total = 0;

  for (const [key, entry] of Object.entries(shifts)) {
    if (!key.startsWith(`${empId}_`)) continue;
    if (entry.isDelete || entry.assignmentIds.length === 0) continue;

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
  assignmentById: Map<number, AssignmentDefinition>,
  focusAreas: FocusArea[],
): FocusAreaDistributionEntry[] {
  const faCounts = new Map<number, number>();
  let total = 0;

  for (const [key, entry] of Object.entries(shifts)) {
    if (!key.startsWith(`${empId}_`)) continue;
    if (entry.isDelete || entry.assignmentIds.length === 0) continue;

    for (const codeId of entry.assignmentIds) {
      const sc = assignmentById.get(codeId);
      if (sc && sc.focusAreaId != null) {
        faCounts.set(sc.focusAreaId, (faCounts.get(sc.focusAreaId) ?? 0) + 1);
        total++;
        break;
      }
    }
  }

  const faMap = new Map(focusAreas.map((fa) => [fa.id, fa]));

  return Array.from(faCounts.entries())
    .map(([faId, count]) => {
      const fa = faMap.get(faId);
      return {
        focusAreaId: faId,
        name: fa?.name ?? "Unknown",
        shiftCount: count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
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

export function computeOvertimeSummary(hoursHistory: WeeklyHoursSummary[]): OvertimeSummary {
  const weeksWithOT = hoursHistory.filter((w) => w.isOvertime).length;
  const totalOTHours = hoursHistory.reduce((sum, w) => sum + w.overtimeHours, 0);
  return {
    weeksWithOT,
    totalOTHours: Math.round(totalOTHours * 10) / 10,
    avgOTPerWeek: weeksWithOT > 0 ? Math.round((totalOTHours / weeksWithOT) * 10) / 10 : 0,
  };
}

// ─── CSV Export ─────────────────────────────────────────

export function generateEmployeeCSV(
  employee: Employee,
  shifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
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

  const cert = certifications.find((c) => c.id === employee.certificationId);
  lines.push(`Certification,${esc(cert?.name ?? "None")}`);

  const roleNames = employee.roleIds
    .map((id) => orgRoles.find((r) => r.id === id)?.name ?? "")
    .filter(Boolean);
  lines.push(`Roles,${esc(roleNames.join(", ") || "None")}`);

  const faNames = employee.focusAreaIds
    .map((id) => focusAreas.find((fa) => fa.id === id)?.name ?? "")
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
  lines.push("Date,Assignment,Start Time,End Time,Status");
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
      : entry.assignmentIds.map((id) => assignmentById.get(id)?.label ?? "?").join("/");
    const startTime = isAbsence
      ? ""
      : (entry.customStartTime ??
        entry.assignmentIds.map((id) => assignmentById.get(id)?.defaultStartTime).find(Boolean) ??
        "");
    const endTime = isAbsence
      ? ""
      : (entry.customEndTime ??
        entry.assignmentIds.map((id) => assignmentById.get(id)?.defaultEndTime).find(Boolean) ??
        "");
    const status = entry.isDraft ? "Draft" : "Published";
    lines.push(`${dateKey},${esc(label)},${startTime},${endTime},${status}`);
  }
  lines.push("");

  // ── Recurring Shifts section
  lines.push("RECURRING SHIFTS");
  lines.push("Day,Assignment,Effective From,Effective Until");
  for (const rs of recurringShifts) {
    lines.push(
      `${DAY_LABELS[rs.dayOfWeek]},${esc(rs.shiftLabel)},${rs.effectiveFrom},${rs.effectiveUntil ?? "Ongoing"}`,
    );
  }

  return lines.join("\n");
}

// ─── Period summary (staff page, item 55c) ──────────────

export interface PeriodHoursSummary {
  hours: number;
  shiftCount: number;
  /** Sunday to Saturday weeks the period touches. */
  weekCount: number;
  averagePerWeek: number;
  /** Weeks whose hours inside the period pass the threshold. */
  overtimeWeeks: number;
}

/** Hours and shifts in a period, with weeks counted Sunday to Saturday. */
export function computePeriodHours(
  empId: string,
  shifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
  range: { startDate: string; endDate: string },
  categoryById?: Map<number, ShiftCategory>,
  otThreshold: number = 40,
): PeriodHoursSummary {
  const weekHours = new Map<string, number>();
  let hours = 0;
  let shiftCount = 0;
  for (let day = range.startDate; day <= range.endDate; day = addDaysToIsoDate(day, 1)) {
    const weekStart = addDaysToIsoDate(day, -new Date(`${day}T00:00:00Z`).getUTCDay());
    if (!weekHours.has(weekStart)) weekHours.set(weekStart, 0);
    const entry = shifts[`${empId}_${day}`];
    if (!entry || entry.isDelete || entry.assignmentIds.length === 0) continue;
    const dayHours = computeShiftDurationHours(
      entry.assignmentIds,
      assignmentById,
      entry.customStartTime,
      entry.customEndTime,
      categoryById,
    );
    hours += dayHours;
    shiftCount++;
    weekHours.set(weekStart, (weekHours.get(weekStart) ?? 0) + dayHours);
  }
  const weekCount = weekHours.size;
  return {
    hours: Math.round(hours * 10) / 10,
    shiftCount,
    weekCount,
    averagePerWeek: weekCount > 0 ? Math.round((hours / weekCount) * 10) / 10 : 0,
    overtimeWeeks: [...weekHours.values()].filter((total) => total > otThreshold).length,
  };
}

export interface WorkMixEntry {
  key: string;
  shiftName: string;
  /** Null when the shift has no job. */
  jobName: string | null;
  /** "7:00 AM - 3:00 PM", or null when the shift has no set times. */
  time: string | null;
  count: number;
  /** Whole percent of the period's shifts. */
  share: number;
}

const WORK_MIX_SLICES = 7;

/**
 * The shift and job pairs someone worked in a period, most first. Past seven
 * pairs the rest fold into one Other entry, so the chart never needs an
 * eighth color.
 */
export function computeWorkMix(
  empId: string,
  shifts: ShiftMap,
  assignmentById: Map<number, AssignmentDefinition>,
  shiftById: Map<number, ShiftCategory>,
  jobById: Map<number, { name: string }>,
  range: { startDate: string; endDate: string },
): WorkMixEntry[] {
  const pairs = new Map<string, Omit<WorkMixEntry, "share">>();
  let total = 0;
  for (let day = range.startDate; day <= range.endDate; day = addDaysToIsoDate(day, 1)) {
    const entry = shifts[`${empId}_${day}`];
    if (!entry || entry.isDelete || entry.assignmentIds.length === 0) continue;
    const assignment = entry.assignmentIds
      .map((id) => assignmentById.get(id))
      .find((item): item is AssignmentDefinition => Boolean(item));
    if (!assignment) continue;
    const shift = assignment.shiftId != null ? shiftById.get(assignment.shiftId) : undefined;
    const job = assignment.jobId != null ? jobById.get(assignment.jobId) : undefined;
    const key = shift ? `${shift.id}:${assignment.jobId ?? ""}` : `assignment:${assignment.id}`;
    const existing = pairs.get(key);
    if (existing) existing.count++;
    else
      pairs.set(key, {
        key,
        shiftName: shift?.name ?? assignment.name,
        jobName: job?.name ?? null,
        time: formatScheduleTimeRange(
          shift?.startTime ?? assignment.defaultStartTime ?? null,
          shift?.endTime ?? assignment.defaultEndTime ?? null,
        ),
        count: 1,
      });
    total++;
  }
  const ranked = [...pairs.values()].sort(
    (a, b) => b.count - a.count || a.shiftName.localeCompare(b.shiftName),
  );
  const withShare = (item: Omit<WorkMixEntry, "share">): WorkMixEntry => ({
    ...item,
    share: total > 0 ? Math.round((item.count / total) * 100) : 0,
  });
  if (ranked.length <= WORK_MIX_SLICES) return ranked.map(withShare);
  const kept = ranked.slice(0, WORK_MIX_SLICES - 1);
  const otherCount = ranked.slice(WORK_MIX_SLICES - 1).reduce((sum, item) => sum + item.count, 0);
  return [
    ...kept,
    { key: "other", shiftName: "Other", jobName: null, time: null, count: otherCount },
  ].map(withShare);
}
