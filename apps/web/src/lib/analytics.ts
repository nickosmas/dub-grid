import "server-only";

import type { EmployeeUtilization, WeeklyShiftHours } from "@/features/dashboard/shared/analytics";
import { getServiceClient } from "@/lib/supabase-service";
import {
  fetchPublishedShiftRows,
  resolvePublishedScheduleEntry,
  type PublishedShiftRow,
} from "@/lib/published-shifts";

interface ShiftWithEmployee {
  emp_id: string;
  date: string;
  resolvedAssignmentIds: number[] | null;
  published_absence_type_id: number | null;
  published_custom_start_time: string | null;
  published_custom_end_time: string | null;
  employees: { first_name: string; last_name: string };
}

/**
 * Fetch weekly shift hours for an org over a given number of weeks.
 */
export async function fetchWeeklyShiftHours(
  orgId: string,
  weeks: number = 12,
): Promise<WeeklyShiftHours[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - weeks * 7);

  const data = await fetchPublishedShiftRows(getServiceClient(), {
    orgId,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  });

  // Group by week (Monday start)
  const weekMap = new Map<string, { totalHours: number; shiftCount: number }>();

  for (const row of data as PublishedShiftRow[]) {
    const publishedEntry = resolvePublishedScheduleEntry(row, new Map());
    if (!publishedEntry || publishedEntry.kind !== "shift") continue;

    const d = new Date(publishedEntry.date);
    // Get Monday of this week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d);
    weekStart.setDate(diff);
    const weekKey = weekStart.toISOString().slice(0, 10);

    const totals = weekMap.get(weekKey) ?? { totalHours: 0, shiftCount: 0 };
    totals.totalHours += publishedEntry.durationHours;
    totals.shiftCount += 1;
    weekMap.set(weekKey, totals);
  }

  return Array.from(weekMap.entries())
    .map(([weekStart, data]) => ({ weekStart, ...data }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/**
 * Fetch employee utilization (top N by hours) for a date range.
 */
export async function fetchEmployeeUtilization(
  orgId: string,
  weeks: number = 4,
  limit: number = 15,
): Promise<EmployeeUtilization[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - weeks * 7);

  const data = await fetchPublishedShiftRows(getServiceClient(), {
    orgId,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    extraSelects: ["employees!inner(org_id, first_name, last_name)"],
  });

  const empMap = new Map<string, { name: string; totalHours: number; shiftCount: number }>();
  const rows = data as unknown as ShiftWithEmployee[];

  for (const row of rows) {
    const publishedEntry = resolvePublishedScheduleEntry(
      row as unknown as PublishedShiftRow,
      new Map(),
    );
    if (!publishedEntry || publishedEntry.kind !== "shift") continue;

    const empId = row.emp_id;
    const emp = row.employees;

    const totals = empMap.get(empId) ?? {
      name: `${emp.first_name} ${emp.last_name}`,
      totalHours: 0,
      shiftCount: 0,
    };
    totals.totalHours += publishedEntry.durationHours;
    totals.shiftCount += 1;
    empMap.set(empId, totals);
  }

  return Array.from(empMap.entries())
    .map(([employeeId, data]) => ({
      employeeId,
      employeeName: data.name,
      totalHours: Math.round(data.totalHours * 10) / 10,
      shiftCount: data.shiftCount,
    }))
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, limit);
}
