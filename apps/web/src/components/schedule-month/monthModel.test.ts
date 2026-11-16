import type { CoverageCategorySnapshot } from "@dubgrid/schedule-core";
import { describe, expect, it } from "vitest";
import type {
  AssignmentDefinition,
  Employee,
  FocusArea,
  GridOpenShift,
  ShiftCategory,
} from "@/types";
import {
  buildMonthDay,
  buildMonthWeeks,
  formatCoverageCount,
  formatShiftHours,
  type MonthDayInput,
} from "./monthModel";

const area = (id: number, name: string): FocusArea =>
  ({ id, name, sortOrder: id, orgId: "o", departmentId: null }) as FocusArea;
const category = (
  id: number,
  abbr: string,
  name: string,
  focusAreaId: number,
  sortOrder: number,
): ShiftCategory => ({
  id,
  orgId: "o",
  name,
  abbr,
  startTime: abbr === "E" ? "15:30" : "07:00",
  endTime: abbr === "E" ? "00:00" : "15:30",
  color: "#A5F3FC",
  sortOrder,
  focusAreaId,
});
const assignment = (id: number, label: string, shiftId: number, focusAreaId: number | null) =>
  ({
    id,
    orgId: "o",
    label,
    name: label,
    color: "#cff",
    border: "#0aa",
    text: "#033",
    shiftId,
    focusAreaId,
    sortOrder: id,
  }) as AssignmentDefinition;
const person = (id: string, first: string, focusAreaIds: number[]) =>
  ({ id, firstName: first, lastName: "Test", focusAreaIds }) as unknown as Employee;

const SN = area(1, "Skilled Nursing");
const SC = area(2, "Sheltered Care");
const D = category(10, "D", "Day Shift", 1, 0);
const E = category(11, "E", "Evening Shift", 1, 1);
const DAY = assignment(100, "D", 10, 1);
const EVE = assignment(101, "E", 11, 1);
const date = new Date(2026, 10, 17);

type Cell = { ids: number[]; absence?: string };
function input(cells: Record<string, Cell>, overrides: Partial<MonthDayInput> = {}): MonthDayInput {
  const assignments = overrides.assignmentById ?? new Map([DAY, EVE].map((a) => [a.id, a]));
  return {
    date,
    todayKey: "2026-11-15",
    employees: [
      person("a", "Ann", [1]),
      person("b", "Ben", [1, 2]),
      person("c", "Cal", [1]),
      person("d", "Dee", [2]),
    ],
    focusAreas: [SN, SC],
    activeFocusArea: null,
    categoryById: new Map([D, E].map((c) => [c.id, c])),
    assignmentById: assignments,
    shiftForKey: (empId) => {
      const cell = cells[empId];
      if (!cell) return null;
      return cell.absence ?? cell.ids.map((id) => assignments.get(id)!.label).join("/");
    },
    assignmentIdsForKey: (empId) => cells[empId]?.ids ?? [],
    absenceForKey: (empId) => {
      const absence = cells[empId]?.absence;
      return absence ? { name: absence, isDayOff: absence === "Day Off" } : null;
    },
    getShiftStyle: () => DAY,
    openShifts: [],
    coverage: null,
    ...overrides,
  };
}

const snapshot = (
  shiftCategoryId: number,
  actual: number,
  required: number,
): CoverageCategorySnapshot =>
  ({
    focusAreaId: 1,
    focusAreaName: "Skilled Nursing",
    rowKey: `1:${shiftCategoryId}`,
    rowLabel: shiftCategoryId === 10 ? "Day Shift" : "Evening Shift",
    shiftCategoryId,
    shiftCategoryName: shiftCategoryId === 10 ? "Day Shift" : "Evening Shift",
    date,
    status: { actual, required, isMet: actual >= required, hasRequirement: required > 0 },
    eligibleAssignmentDefinitionIds: [],
    preferredOpenAssignmentDefinitionId: 0,
    shortageDetails: [],
  }) as CoverageCategorySnapshot;

describe("buildMonthWeeks", () => {
  it("pads November 2026 into five Sunday-first weeks", () => {
    const weeks = buildMonthWeeks(new Date(2026, 10, 1));
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]?.getDate()).toBe(1);
    expect(weeks[4].filter(Boolean)).toHaveLength(2);
  });

  it("leaves the days before the 1st empty", () => {
    expect(buildMonthWeeks(new Date(2026, 9, 1))[0].slice(0, 4)).toEqual([null, null, null, null]);
  });
});

describe("formatShiftHours", () => {
  it("writes a day shift in 12-hour time", () => {
    expect(formatShiftHours("07:00", "15:30", date)).toBe("7:00 AM - 3:30 PM");
  });

  it("names both days for a shift that ends at or past midnight", () => {
    expect(formatShiftHours("15:30", "00:00", date)).toBe("Tue 3:30 PM - Wed 12:00 AM");
  });

  it("has nothing to say without both times", () => {
    expect(formatShiftHours("07:00", null, date)).toBeNull();
  });
});

describe("formatCoverageCount", () => {
  it("keeps mentored credit exact to two places", () => {
    expect(formatCoverageCount(1.5)).toBe("1.5");
    expect(formatCoverageCount(2)).toBe("2");
  });
});

describe("buildMonthDay", () => {
  it("groups each area's people by shift, in shift order", () => {
    const day = buildMonthDay(input({ a: { ids: [101] }, b: { ids: [100] }, c: { ids: [100] } }));
    expect(day.areas).toHaveLength(1);
    const [first, second] = day.areas[0].groups;
    expect([first.code, first.people.map((p) => p.empId)]).toEqual(["D", ["b", "c"]]);
    expect([second.code, second.hours]).toEqual(["E", "Tue 3:30 PM - Wed 12:00 AM"]);
    expect(day.working).toBe(3);
  });

  it("counts a double once per shift but once as a person", () => {
    const day = buildMonthDay(input({ a: { ids: [100, 101] } }));
    expect(day.areas[0].groups.map((g) => g.people.length)).toEqual([1, 1]);
    expect(day.working).toBe(1);
  });

  it("lists a whole-day absence as off, not working, and counts only time missed as absent", () => {
    const day = buildMonthDay(
      input({
        a: { ids: [], absence: "Vacation" },
        b: { ids: [100] },
        c: { ids: [], absence: "Day Off" },
      }),
    );
    expect(day.off.map((row) => [row.name, row.absence, row.isDayOff])).toEqual([
      ["Ann Test", "Vacation", false],
      ["Cal Test", "Day Off", true],
    ]);
    expect(day.absent).toBe(1);
    expect(day.working).toBe(1);
  });

  it("shows only the chosen focus area", () => {
    const general = assignment(102, "G", 10, null);
    const day = buildMonthDay(
      input(
        { b: { ids: [102] }, d: { ids: [102] } },
        {
          activeFocusArea: 2,
          assignmentById: new Map([DAY, EVE, general].map((a) => [a.id, a])),
          getShiftStyle: () => general,
        },
      ),
    );
    expect(day.areas.map((a) => a.name)).toEqual(["Sheltered Care"]);
    expect(day.areas[0].groups[0].people.map((p) => p.empId)).toEqual(["d"]);
  });

  it("measures shortages from coverage, including a shift nobody works", () => {
    const day = buildMonthDay(
      input({ a: { ids: [100] } }, { coverage: [snapshot(10, 1, 2), snapshot(11, 0, 1.5)] }),
    );
    const [dayShift, evening] = day.areas[0].groups;
    expect(dayShift.short).toBe(1);
    expect(evening.people).toEqual([]);
    expect(evening.coverage[0]).toMatchObject({ actual: 0, required: 1.5, short: 1.5 });
    expect(day.short).toBe(2.5);
  });

  it("doesn't call a past day short", () => {
    const day = buildMonthDay(
      input({}, { todayKey: "2026-11-20", coverage: [snapshot(10, 0, 2)] }),
    );
    expect(day.isPast).toBe(true);
    expect(day.short).toBe(0);
    expect(day.areas).toEqual([]);
  });

  it("folds amber when any request waits on a manager, and names people with no shift", () => {
    const day = buildMonthDay(
      input(
        { a: { ids: [100] } },
        {
          requestForKey: (empId) =>
            empId === "a"
              ? { waitingOn: "teammate", status: "Swap with Ben Test" }
              : empId === "c"
                ? { waitingOn: "manager", status: "Pickup · awaiting approval" }
                : null,
        },
      ),
    );
    expect(day.waitingOn).toBe("manager");
    expect(day.areas[0].groups[0].people[0].request?.status).toBe("Swap with Ben Test");
    expect(day.otherRequests.map((r) => r.empId)).toEqual(["c"]);
  });

  it("marks a day with any draft, removals included", () => {
    const day = buildMonthDay(
      input({}, { draftKindForKey: (empId) => (empId === "d" ? "deleted" : null) }),
    );
    expect(day.hasDraft).toBe(true);
  });

  it("lists the day's open shifts in visible areas", () => {
    const open = {
      id: "o1",
      source: "calloff",
      date: "2026-11-17",
      focusAreaId: 1,
      assignmentIds: [101],
      assignmentLabel: "E",
      assignmentFullName: "Evening Shift",
      customStartTime: null,
      customEndTime: null,
      calledOffBy: "Cal Test",
    } as GridOpenShift;
    const day = buildMonthDay(
      input({}, { openShifts: [open, { ...open, id: "o2", focusAreaId: 2 }], activeFocusArea: 1 }),
    );
    expect(day.openShifts).toEqual([
      {
        id: "o1",
        label: "Evening Shift",
        areaName: "Skilled Nursing",
        hours: "Tue 3:30 PM - Wed 12:00 AM",
        detail: "Called off by Cal Test",
      },
    ]);
  });

  it("puts a person's note from another area on their first visible row once", () => {
    const day = buildMonthDay(
      input(
        { b: { ids: [100, 101] } },
        {
          noteMarksForKey: (_empId, _date, areaId) =>
            areaId === 2 ? [{ indicatorTypeId: 7, state: "published" } as never] : [],
        },
      ),
    );
    const [dayShift, evening] = day.areas[0].groups;
    expect(dayShift.people[0].marks.map((m) => m.indicatorTypeId)).toEqual([7]);
    expect(evening.people[0].marks).toEqual([]);
  });
});
