import { isSchedulableOn } from "@dubgrid/domain";
import { isPastDateKey } from "@dubgrid/schedule-core";
import type { Employee } from "@/types";

/**
 * Whether the page may write someone's draft on a day: the database's rule
 * (someone Away until a date only from that date), and never a day before
 * today, which is corrected instead (53b). Paste and every fill ask this.
 */
export function buildSchedulableOn(
  employees: readonly Employee[],
  todayKey: string,
): (employeeId: string, dateKey: string) => boolean {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return (employeeId, dateKey) => {
    const employee = byId.get(employeeId);
    return !!employee && !isPastDateKey(dateKey, todayKey) && isSchedulableOn(employee, dateKey);
  };
}
