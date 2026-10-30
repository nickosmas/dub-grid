import { describe, expect, it } from "vitest";

import { computePeriodHours, computeShiftDistribution, computeWorkMix } from "./staff-detail-stats";
import type { AssignmentDefinition, ShiftCategory, ShiftMap } from "@/types";

describe("computeShiftDistribution", () => {
  it("ignores schedule entries outside the supplied Overview window", () => {
    const entry = {
      assignmentIds: [1],
      isDelete: false,
    } as ShiftMap[string];
    const shifts = {
      "employee-1_2026-06-20": entry,
      "employee-1_2026-06-21": entry,
      "employee-1_2026-09-12": entry,
      "employee-1_2026-09-13": entry,
    } as ShiftMap;
    const assignments = new Map([
      [
        1,
        {
          id: 1,
          label: "Day RN",
          name: "Day registered nurse",
          color: "#123456",
        } as AssignmentDefinition,
      ],
    ]);

    expect(
      computeShiftDistribution("employee-1", shifts, assignments, "2026-06-21", "2026-09-12"),
    ).toEqual([expect.objectContaining({ assignmentId: 1, count: 2, percentage: 100 })]);
  });
});

describe("computePeriodHours", () => {
  const day = { id: 10, name: "Day Shift", startTime: "07:00", endTime: "15:00" } as ShiftCategory;
  const assignments = new Map([
    [1, { id: 1, label: "D", name: "Day", shiftId: 10, categoryId: 10 } as AssignmentDefinition],
  ]);
  const categories = new Map([[10, day]]);
  const worked = { assignmentIds: [1], isDelete: false } as ShiftMap[string];
  const cells = (dates: string[]) =>
    Object.fromEntries(dates.map((date) => [`emp_${date}`, worked])) as ShiftMap;

  it("counts nothing in an empty period, while still counting its weeks", () => {
    expect(
      computePeriodHours(
        "emp",
        {},
        assignments,
        { startDate: "2026-10-25", endDate: "2026-10-31" },
        categories,
      ),
    ).toEqual({ hours: 0, shiftCount: 0, weekCount: 1, averagePerWeek: 0, overtimeWeeks: 0 });
  });

  it("counts a partial week as a week, and only the days inside the period", () => {
    const summary = computePeriodHours(
      "emp",
      cells(["2026-10-17", "2026-10-19", "2026-10-26"]),
      assignments,
      { startDate: "2026-10-18", endDate: "2026-10-27" },
      categories,
    );
    expect(summary).toEqual({
      hours: 16,
      shiftCount: 2,
      weekCount: 2,
      averagePerWeek: 8,
      overtimeWeeks: 0,
    });
  });

  it("counts a week over 40 hours as an overtime week, and ignores deleted cells", () => {
    const week = [
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ];
    const shifts = {
      ...cells(week),
      "emp_2026-10-31": { assignmentIds: [1], isDelete: true } as ShiftMap[string],
    };
    const summary = computePeriodHours(
      "emp",
      shifts,
      assignments,
      { startDate: "2026-10-25", endDate: "2026-10-31" },
      categories,
    );
    expect(summary.hours).toBe(48);
    expect(summary.shiftCount).toBe(6);
    expect(summary.overtimeWeeks).toBe(1);
  });
});

describe("computeWorkMix", () => {
  const shiftsById = new Map<number, ShiftCategory>([
    [10, { id: 10, name: "Day Shift", startTime: "07:00", endTime: "15:00" } as ShiftCategory],
    [11, { id: 11, name: "Evening Shift", startTime: "15:00", endTime: "23:00" } as ShiftCategory],
  ]);
  const jobsById = new Map([
    [100, { name: "Day Shift Supervisor" }],
    [101, { name: "Charge Nurse" }],
  ]);
  const assignments = new Map<number, AssignmentDefinition>([
    [1, { id: 1, name: "Day Supervisor", shiftId: 10, jobId: 100 } as AssignmentDefinition],
    [2, { id: 2, name: "Day Charge", shiftId: 10, jobId: 101 } as AssignmentDefinition],
    [3, { id: 3, name: "Evening", shiftId: 11, jobId: null } as AssignmentDefinition],
  ]);
  const on = (id: number) => ({ assignmentIds: [id], isDelete: false }) as ShiftMap[string];
  const range = { startDate: "2026-10-01", endDate: "2026-10-31" };

  it("names each shift and job pair in full, most worked first", () => {
    const shifts = {
      "emp_2026-10-01": on(1),
      "emp_2026-10-02": on(1),
      "emp_2026-10-03": on(2),
      "emp_2026-10-04": on(3),
      "emp_2026-10-05": { assignmentIds: [1], isDelete: true } as ShiftMap[string],
      "emp_2026-11-01": on(1),
    } as ShiftMap;

    expect(computeWorkMix("emp", shifts, assignments, shiftsById, jobsById, range)).toEqual([
      {
        key: "10:100",
        shiftName: "Day Shift",
        jobName: "Day Shift Supervisor",
        focusAreaName: null,
        time: "7:00 AM - 3:00 PM",
        count: 2,
        share: 50,
      },
      {
        key: "10:101",
        shiftName: "Day Shift",
        jobName: "Charge Nurse",
        focusAreaName: null,
        time: "7:00 AM - 3:00 PM",
        count: 1,
        share: 25,
      },
      {
        key: "11:",
        shiftName: "Evening Shift",
        jobName: null,
        focusAreaName: null,
        time: "3:00 PM - 11:00 PM",
        count: 1,
        share: 25,
      },
    ]);
  });

  it("names each shift's focus area, since focus areas reuse shift names", () => {
    const byId = new Map<number, ShiftCategory>([
      [20, { id: 20, name: "Day Shift", focusAreaId: 1 } as ShiftCategory],
      [21, { id: 21, name: "Day Shift", focusAreaId: 2 } as ShiftCategory],
    ]);
    const twoAreas = new Map<number, AssignmentDefinition>([
      [5, { id: 5, name: "Day", shiftId: 20, jobId: 102 } as AssignmentDefinition],
      [6, { id: 6, name: "Day", shiftId: 21, jobId: 102 } as AssignmentDefinition],
    ]);
    const mix = computeWorkMix(
      "emp",
      { "emp_2026-10-01": on(5), "emp_2026-10-02": on(6) } as ShiftMap,
      twoAreas,
      byId,
      new Map([[102, { name: "Day Shift" }]]),
      range,
      new Map([
        [1, { name: "Skilled Nursing" }],
        [2, { name: "Sheltered Care" }],
      ]),
    );
    expect(mix.map((item) => [item.shiftName, item.jobName, item.focusAreaName])).toEqual([
      ["Day Shift", null, "Skilled Nursing"],
      ["Day Shift", null, "Sheltered Care"],
    ]);
  });

  it("folds everything past six pairs into Other", () => {
    const many = new Map<number, AssignmentDefinition>();
    const shiftMap = new Map<number, ShiftCategory>();
    const shifts: ShiftMap = {};
    for (let i = 1; i <= 9; i++) {
      shiftMap.set(i, { id: i, name: `Shift ${i}` } as ShiftCategory);
      many.set(i, { id: i, name: `A${i}`, shiftId: i, jobId: null } as AssignmentDefinition);
      for (let n = 0; n < 10 - i; n++) {
        shifts[`emp_2026-10-${String(i * 3 + n).padStart(2, "0")}`] = on(i);
      }
    }
    const mix = computeWorkMix("emp", shifts, many, shiftMap, new Map(), range);
    expect(mix).toHaveLength(7);
    expect(mix.at(-1)).toMatchObject({ key: "other", shiftName: "Other", count: 6 });
  });
});
