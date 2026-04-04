import { supabase } from "@/lib/supabase";

export interface WeeklyShiftHours {
  weekStart: string; // YYYY-MM-DD
  totalHours: number;
  shiftCount: number;
}

export interface EmployeeUtilization {
  employeeId: number;
  employeeName: string;
  totalHours: number;
  shiftCount: number;
}

interface ShiftWithEmployee {
  employee_id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
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

  const { data, error } = await supabase
    .from("shifts")
    .select("date, start_time, end_time, employee_id, employees!inner(org_id)")
    .eq("employees.org_id", orgId)
    .gte("date", start.toISOString().slice(0, 10))
    .lte("date", end.toISOString().slice(0, 10));

  if (error) throw error;

  // Group by week (Monday start)
  const weekMap = new Map<string, { totalHours: number; shiftCount: number }>();

  for (const row of data ?? []) {
    const d = new Date(row.date as string);
    // Get Monday of this week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d);
    weekStart.setDate(diff);
    const weekKey = weekStart.toISOString().slice(0, 10);

    const hours = calcHours(row.start_time as string | null, row.end_time as string | null);
    const entry = weekMap.get(weekKey) ?? { totalHours: 0, shiftCount: 0 };
    entry.totalHours += hours;
    entry.shiftCount += 1;
    weekMap.set(weekKey, entry);
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

  const { data, error } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, employees!inner(org_id, first_name, last_name)")
    .eq("employees.org_id", orgId)
    .gte("date", start.toISOString().slice(0, 10))
    .lte("date", end.toISOString().slice(0, 10));

  if (error) throw error;

  const empMap = new Map<number, { name: string; totalHours: number; shiftCount: number }>();
  const rows = (data ?? []) as unknown as ShiftWithEmployee[];

  for (const row of rows) {
    const empId = row.employee_id;
    const emp = row.employees;
    const hours = calcHours(row.start_time, row.end_time);

    const entry = empMap.get(empId) ?? {
      name: `${emp.first_name} ${emp.last_name}`,
      totalHours: 0,
      shiftCount: 0,
    };
    entry.totalHours += hours;
    entry.shiftCount += 1;
    empMap.set(empId, entry);
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

function calcHours(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 8; // default 8h shift
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (hours <= 0) hours += 24; // overnight
  return hours;
}
