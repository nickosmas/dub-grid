import { Employee, ShiftType } from "@/types";

export interface Tally {
  [label: string]: number;
}

export interface DailyTallies {
  day: Tally;
  eve: Tally;
  night: Tally;
}

/**
 * Computes the day/eve/night FTE counts for a single date across a set of employees,
 * tallying each individual shift type.
 */
export function computeDailyTallies(
  employees: Employee[],
  date: Date,
  shiftForKey: (empId: string, date: Date) => string | null,
  getShiftStyle: (type: string) => ShiftType,
  exclusiveLabels: string[],
): DailyTallies {
  const tallies: DailyTallies = {
    day: {},
    eve: {},
    night: {},
  };

  for (const emp of employees) {
    const typeLabel = shiftForKey(emp.id, date);
    if (typeLabel && exclusiveLabels.includes(typeLabel)) {
      const style = getShiftStyle(typeLabel);

      const bucket = style.countsTowardDay
        ? tallies.day
        : style.countsTowardEve
          ? tallies.eve
          : style.countsTowardNight
            ? tallies.night
            : null;

      if (bucket) {
        bucket[typeLabel] = (bucket[typeLabel] || 0) + emp.fteWeight;
      }
    }
  }
  return tallies;
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
