import { Employee, ShiftType } from "@/types";

/**
 * Computes the day/eve/night FTE counts for a single date across a set of employees.
 */
export function computeDailyCounts(
  employees: Employee[],
  date: Date,
  shiftForKey: (empId: string, date: Date) => string | null,
  getShiftStyle: (type: string) => ShiftType,
): { day: number; eve: number; night: number } {
  let day = 0, eve = 0, night = 0;
  for (const emp of employees) {
    const type = shiftForKey(emp.id, date);
    if (type) {
      const style = getShiftStyle(type);
      if (style.countsTowardDay) day += emp.fteWeight;
      if (style.countsTowardEve) eve += emp.fteWeight;
      if (style.countsTowardNight) night += emp.fteWeight;
    }
  }
  return { day, eve, night };
}

/**
 * Filters employees by wing and sorts by seniority (ascending).
 * Employees with empty wings arrays are always excluded.
 */
export function filterAndSortEmployees(
  employees: Employee[],
  activeWing: string,
): Employee[] {
  return employees
    .filter(
      (e) =>
        e.wings.length > 0 &&
        (activeWing === "All" || e.wings.includes(activeWing)),
    )
    .sort((a, b) => a.seniority - b.seniority);
}
