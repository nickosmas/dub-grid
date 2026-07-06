/**
 * dashboard-metrics.test.ts — Verify all dashboard metrics are calculated correctly
 */

import { describe, it, expect } from "vitest";
import {
  computeCoveragePctAndSlots,
  computeCoverageBySection,
  computeOpenShifts,
  computeShiftDurationHours,
  computeAllEmployeeHours,
  formatDateKey,
  getDatesInRange,
  filterShiftsByWeek,
  getWeekStart,
} from "@/lib/dashboard-stats";
import {
  buildPublishedDateSet,
  filterPublishedDates,
} from "@/lib/schedule-logic";
import type {
  ShiftMap,
  Employee,
  FocusArea,
  AssignmentDefinition,
  CoverageRequirement,
} from "@/types";

describe("Dashboard Metrics", () => {
  // Sample data
  const baseDate = new Date("2026-04-11");
  const weekStart = getWeekStart(baseDate);
  const weekDates = getDatesInRange(weekStart, 7);

  const employee1: Employee = {
    id: "emp1",
    employeeNumber: 1001,
    userId: "user1",
    firstName: "John",
    lastName: "Doe",
    employmentType: "full_time",
    email: "john@example.com",
    phone: "",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    focusAreaIds: [1],
    certificationId: null,
    roleIds: [],
    departmentIds: [],
    deptAdminIds: [],
    seniority: 0,
    contactNotes: "",
    version: 0,
    createdAt: null,
  };

  const employee2: Employee = {
    ...employee1,
    id: "emp2",
    firstName: "Jane",
  };

  const focusArea1: FocusArea = {
    id: 1,
    orgId: "org1",
    departmentId: null,
    name: "Customer Service",
    sortOrder: 0,
  };

  const assignment1: AssignmentDefinition = {
    id: 101,
    orgId: "org1",
    label: "DAY",
    name: "Day Shift",
    color: "#0000FF",
    border: "#000000",
    text: "#FFFFFF",
    focusAreaId: 1,
    categoryId: null,
    requiredCertificationIds: [],
    defaultStartTime: "09:00",
    defaultEndTime: "17:00",
    defaultDurationHours: null,
    defaultDurationMinutes: null,
    sortOrder: 0,
  };

  const assignment2: AssignmentDefinition = {
    ...assignment1,
    id: 102,
    label: "EVE",
    name: "Evening Shift",
    defaultStartTime: "17:00",
    defaultEndTime: "22:00",
  };

  const coverageRequirement: CoverageRequirement = {
    id: 1,
    orgId: "org1",
    focusAreaId: 1,
    assignmentId: 101,
    minStaff: 2,
    dayOfWeek: 1, // Monday
  };

  function createShift(
    empId: string,
    dateKey: string,
    codeIds: number[],
    customStartTime: string | null = null,
    customEndTime: string | null = null,
  ): [string, ShiftMap[string]] {
    return [
      `${empId}_${dateKey}`,
      {
        label: codeIds.map((id) => (id === 101 ? "DAY" : "EVE")).join("/"),
        assignmentIds: codeIds,
        publishedAssignmentDefinitionIds: codeIds,
        publishedLabel: codeIds
          .map((id) => (id === 101 ? "DAY" : "EVE"))
          .join("/"),
        customStartTime,
        customEndTime,
        isDraft: false,
        draftKind: null,
      },
    ];
  }

  it("should calculate coverage percentage correctly", () => {
    const mondayKey = formatDateKey(weekDates[1]); // Monday
    const shifts: ShiftMap = {
      ...Object.fromEntries([
        createShift("emp1", mondayKey, [101]),
        createShift("emp2", mondayKey, [101]),
      ]),
    };

    const result = computeCoveragePctAndSlots(
      [focusArea1],
      [assignment1, assignment2],
      [coverageRequirement],
      weekDates,
      [employee1, employee2],
      shifts,
    );

    // 2 required, 2 filled for Monday = 100%
    expect(result.pct).toBe(100);
    expect(result.openSlots).toBe(0);
  });

  it("should calculate open slots when understaffed", () => {
    const mondayKey = formatDateKey(weekDates[1]);
    const shifts: ShiftMap = {
      ...Object.fromEntries([createShift("emp1", mondayKey, [101])]),
    };

    const result = computeCoveragePctAndSlots(
      [focusArea1],
      [assignment1, assignment2],
      [coverageRequirement],
      weekDates,
      [employee1, employee2],
      shifts,
    );

    // 2 required, 1 filled = 50%, 1 open slot
    expect(result.pct).toBe(50);
    expect(result.openSlots).toBe(1);
  });

  it("returns filled and required counts for coverage heatmap cells", () => {
    const mondayKey = formatDateKey(weekDates[1]);
    const shifts: ShiftMap = {
      ...Object.fromEntries([createShift("emp1", mondayKey, [101])]),
    };

    const sections = computeCoverageBySection(
      [focusArea1],
      weekDates,
      shifts,
      [employee1, employee2],
      [coverageRequirement],
      [assignment1, assignment2],
    );
    const mondayCoverage = sections[0]?.daily.find(
      (day) => day.dateKey === mondayKey,
    );
    const sundayCoverage = sections[0]?.daily[0];

    expect(mondayCoverage).toMatchObject({
      filledCount: 1,
      requiredCount: 2,
      staffCount: 1,
      status: "amber",
    });
    expect(sundayCoverage).toMatchObject({
      filledCount: 0,
      requiredCount: 0,
      staffCount: 0,
      status: "none",
    });
  });

  it("should detect open shifts gaps", () => {
    const mondayDateObj = weekDates[1];
    const mondayKey = formatDateKey(mondayDateObj);
    const shifts: ShiftMap = {}; // No shifts scheduled

    const assignmentById = new Map([[101, assignment1]]);

    const openShifts = computeOpenShifts(
      [focusArea1],
      [assignment1, assignment2],
      [coverageRequirement],
      weekDates,
      [employee1, employee2],
      shifts,
      assignmentById,
    );

    // Should detect open shifts when no shifts are scheduled
    expect(openShifts.length).toBeGreaterThan(0);
    // Verify Monday date is in the detected gaps
    const hasMonday = openShifts.some(
      (s) => formatDateKey(s.date) === mondayKey,
    );
    expect(hasMonday).toBe(true);
    expect(
      openShifts.every((shift) => shift.focusAreaId === focusArea1.id),
    ).toBe(true);
  });

  it("hides dashboard open shifts when the gap falls on an unpublished date", () => {
    const mondayDateObj = weekDates[1];
    const assignmentById = new Map([[101, assignment1]]);
    const publishedDateSet = buildPublishedDateSet([
      {
        startDate: formatDateKey(weekDates[2]),
        endDate: formatDateKey(weekDates[2]),
      },
    ]);
    const publishedDates = filterPublishedDates(weekDates, publishedDateSet);

    const openShifts = computeOpenShifts(
      [focusArea1],
      [assignment1, assignment2],
      [coverageRequirement],
      publishedDates,
      [employee1, employee2],
      {},
      assignmentById,
    );

    expect(openShifts).toEqual([]);
    expect(
      publishedDates.some(
        (date) => formatDateKey(date) === formatDateKey(mondayDateObj),
      ),
    ).toBe(false);
  });

  it("hides dashboard open shifts that already started today", () => {
    const monday = new Date("2026-04-06T12:00:00.000Z");
    const assignmentById = new Map([[101, assignment1]]);
    const shifts: ShiftMap = {};

    const afterStart = computeOpenShifts(
      [focusArea1],
      [assignment1, assignment2],
      [coverageRequirement],
      [monday],
      [employee1, employee2],
      shifts,
      assignmentById,
      undefined,
      undefined,
      {
        now: new Date("2026-04-06T10:00:00.000Z"),
        timeZone: "UTC",
      },
    );
    const beforeStart = computeOpenShifts(
      [focusArea1],
      [assignment1, assignment2],
      [coverageRequirement],
      [monday],
      [employee1, employee2],
      shifts,
      assignmentById,
      undefined,
      undefined,
      {
        now: new Date("2026-04-06T08:59:00.000Z"),
        timeZone: "UTC",
      },
    );

    expect(afterStart).toEqual([]);
    expect(beforeStart).toHaveLength(1);
  });

  it("should use flexible coverage rules for totals and open shifts", () => {
    const mondayKey = formatDateKey(weekDates[1]);
    const shifts: ShiftMap = {
      ...Object.fromEntries([
        createShift("emp1", mondayKey, [101]),
        createShift("emp2", mondayKey, [102]),
      ]),
    };
    const assignmentById = new Map([
      [101, assignment1],
      [102, assignment2],
    ]);

    const coverage = computeCoveragePctAndSlots(
      [focusArea1],
      [assignment1, assignment2],
      [coverageRequirement],
      weekDates,
      [employee1, employee2],
      shifts,
    );
    const openShifts = computeOpenShifts(
      [focusArea1],
      [assignment1, assignment2],
      [coverageRequirement],
      weekDates,
      [employee1, employee2],
      shifts,
      assignmentById,
    );

    expect(coverage.pct).toBe(100);
    expect(coverage.openSlots).toBe(0);
    expect(openShifts).toEqual([]);
  });

  it("deduplicates day-specific coverage rules when building dashboard open shifts", () => {
    const monday = weekDates[1];
    const rnAssignment: AssignmentDefinition = {
      ...assignment1,
      id: 201,
      label: "RN",
      name: "Registered Nurse",
      categoryId: 34,
      shiftId: 34,
      jobId: 501,
    };
    const assignmentById = new Map([[rnAssignment.id, rnAssignment]]);
    const daySpecificRequirements: CoverageRequirement[] = Array.from(
      { length: 7 },
      (_, dayOfWeek) => ({
        id: dayOfWeek + 1,
        orgId: "org1",
        focusAreaId: 1,
        jobId: 501,
        preferredShiftId: 34,
        dayOfWeek,
        minStaff: 1,
      }),
    );

    const openShifts = computeOpenShifts(
      [focusArea1],
      [rnAssignment],
      daySpecificRequirements,
      [monday],
      [],
      {},
      assignmentById,
    );

    expect(openShifts).toHaveLength(1);
    expect(openShifts[0]?.id).toBe(`1_201_${formatDateKey(monday)}`);
    expect(openShifts[0]?.assignmentLabel).toBe("RN");
  });

  it("uses assignment-specific ids when multiple open shifts share a category and date", () => {
    const monday = weekDates[1];
    const rnAssignment: AssignmentDefinition = {
      ...assignment1,
      id: 201,
      label: "RN",
      name: "Registered Nurse",
      categoryId: 34,
      shiftId: 34,
      jobId: 501,
    };
    const chargeAssignment: AssignmentDefinition = {
      ...assignment1,
      id: 202,
      label: "Charge RN",
      name: "Charge Nurse",
      categoryId: 34,
      shiftId: 34,
      jobId: 502,
    };
    const assignmentById = new Map([
      [rnAssignment.id, rnAssignment],
      [chargeAssignment.id, chargeAssignment],
    ]);
    const requirements: CoverageRequirement[] = [
      {
        id: 1,
        orgId: "org1",
        focusAreaId: 1,
        jobId: 501,
        preferredShiftId: 34,
        dayOfWeek: monday.getDay(),
        minStaff: 1,
      },
      {
        id: 2,
        orgId: "org1",
        focusAreaId: 1,
        jobId: 502,
        preferredShiftId: 34,
        dayOfWeek: monday.getDay(),
        minStaff: 1,
      },
    ];

    const openShifts = computeOpenShifts(
      [focusArea1],
      [rnAssignment, chargeAssignment],
      requirements,
      [monday],
      [],
      {},
      assignmentById,
    );

    expect(openShifts).toHaveLength(2);
    expect(openShifts.map((shift) => shift.id).sort()).toEqual([
      `1_201_${formatDateKey(monday)}`,
      `1_202_${formatDateKey(monday)}`,
    ]);
    expect(openShifts.map((shift) => shift.assignmentLabel).sort()).toEqual([
      "Charge RN",
      "RN",
    ]);
  });

  it("uses category totals for coverage even when one exact code is short", () => {
    const employee3: Employee = {
      ...employee1,
      id: "emp3",
      firstName: "Alex",
    };
    const mondayKey = formatDateKey(weekDates[1]);
    const shifts: ShiftMap = {
      ...Object.fromEntries([
        createShift("emp1", mondayKey, [101]),
        createShift("emp2", mondayKey, [102]),
        createShift("emp3", mondayKey, [102]),
      ]),
    };
    const assignmentById = new Map([
      [101, assignment1],
      [102, assignment2],
    ]);
    const dayRequirement: CoverageRequirement = {
      ...coverageRequirement,
      assignmentId: 101,
      minStaff: 2,
    };
    const eveningRequirement: CoverageRequirement = {
      ...coverageRequirement,
      id: 2,
      assignmentId: 102,
      minStaff: 1,
    };

    const coverage = computeCoveragePctAndSlots(
      [focusArea1],
      [assignment1, assignment2],
      [dayRequirement, eveningRequirement],
      weekDates,
      [employee1, employee2, employee3],
      shifts,
    );
    const openShifts = computeOpenShifts(
      [focusArea1],
      [assignment1, assignment2],
      [dayRequirement, eveningRequirement],
      weekDates,
      [employee1, employee2, employee3],
      shifts,
      assignmentById,
    );

    expect(coverage.pct).toBe(100);
    expect(coverage.openSlots).toBe(0);
    expect(openShifts).toEqual([]);
  });

  it("should calculate shift duration correctly", () => {
    const assignmentById = new Map([[101, assignment1]]);

    // 09:00 - 17:00 = 8 hours
    const duration = computeShiftDurationHours([101], assignmentById);
    expect(duration).toBe(8);
  });

  it("should calculate shift duration with custom times", () => {
    const assignmentById = new Map([[101, assignment1]]);

    // Custom: 06:00 - 14:00 = 8 hours
    const duration = computeShiftDurationHours(
      [101],
      assignmentById,
      "06:00",
      "14:00",
    );
    expect(duration).toBe(8);
  });

  it("should calculate employee hours for a week", () => {
    const mondayKey = formatDateKey(weekDates[1]);
    const tuesdayKey = formatDateKey(weekDates[2]);

    const shifts: ShiftMap = {
      ...Object.fromEntries([
        createShift("emp1", mondayKey, [101]), // 8 hours
        createShift("emp1", tuesdayKey, [101]), // 8 hours
      ]),
    };

    const assignmentById = new Map([[101, assignment1]]);
    const periodDateKeys = weekDates.map(formatDateKey);

    const hours = computeAllEmployeeHours(
      [employee1],
      periodDateKeys,
      shifts,
      assignmentById,
      40,
    );

    expect(hours.length).toBe(1);
    expect(hours[0]?.empId).toBe("emp1");
    expect(hours[0]?.totalHours).toBe(16); // 2 days × 8 hours
    expect(hours[0]?.isOvertime).toBe(false);
  });

  it("should detect overtime when over 40 hours", () => {
    const shifts: ShiftMap = {};
    // Add 5 shifts × 10 hours = 50 hours (10 hours overtime)
    for (let i = 1; i < 6; i++) {
      const dateKey = formatDateKey(weekDates[i]);
      shifts[`emp1_${dateKey}`] = {
        label: "DAY",
        assignmentIds: [101],
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "DAY",
        customStartTime: "08:00",
        customEndTime: "18:00", // 10 hours
        isDraft: false,
        draftKind: null,
      };
    }

    const assignmentById = new Map([[101, assignment1]]);
    const periodDateKeys = weekDates.map(formatDateKey);

    const hours = computeAllEmployeeHours(
      [employee1],
      periodDateKeys,
      shifts,
      assignmentById,
      40,
    );

    expect(hours[0]?.totalHours).toBe(50);
    expect(hours[0]?.isOvertime).toBe(true);
    expect(hours[0]?.overtimeHours).toBe(10);
  });

  it("should flag overtime hit in one week of a 2-week period even when the fortnight total stays low", () => {
    // Week 1: 5 × 10h shifts = 50 hours (10 hours of weekly OT).
    // Week 2: 2 × 8h shifts = 16 hours. Combined total = 66 hours, which is
    // well under a naive 2×40=80 scaled threshold — but the week 1 overtime
    // must still surface instead of being averaged away.
    const twoWeekDates = getDatesInRange(weekStart, 14);
    const shifts: ShiftMap = {};
    for (let i = 1; i < 6; i++) {
      const dateKey = formatDateKey(twoWeekDates[i]);
      shifts[`emp1_${dateKey}`] = {
        label: "DAY",
        assignmentIds: [101],
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "DAY",
        customStartTime: "08:00",
        customEndTime: "18:00", // 10 hours
        isDraft: false,
        draftKind: null,
      };
    }
    Object.assign(
      shifts,
      Object.fromEntries([
        createShift("emp1", formatDateKey(twoWeekDates[8]), [101]), // 8 hours
        createShift("emp1", formatDateKey(twoWeekDates[9]), [101]), // 8 hours
      ]),
    );

    const assignmentById = new Map([[101, assignment1]]);
    const periodDateKeys = twoWeekDates.map(formatDateKey);

    const hours = computeAllEmployeeHours(
      [employee1],
      periodDateKeys,
      shifts,
      assignmentById,
      40,
    );

    expect(hours[0]?.totalHours).toBe(66);
    expect(hours[0]?.isOvertime).toBe(true);
    expect(hours[0]?.overtimeHours).toBe(10);
  });

  it("should filter shifts by week correctly", () => {
    const weekStartKey = formatDateKey(weekStart);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEndKey = formatDateKey(weekEndDate);

    const lastWeekDate = new Date(weekStart);
    lastWeekDate.setDate(lastWeekDate.getDate() - 1);
    const lastWeekKey = formatDateKey(lastWeekDate);

    const nextWeekDate = new Date(weekStart);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeekKey = formatDateKey(nextWeekDate);

    const shifts: ShiftMap = {
      [`emp1_${lastWeekKey}`]: createShift("emp1", lastWeekKey, [101])[1],
      [`emp1_${weekStartKey}`]: createShift("emp1", weekStartKey, [101])[1],
      [`emp1_${nextWeekKey}`]: createShift("emp1", nextWeekKey, [101])[1],
    };

    const filtered = filterShiftsByWeek(shifts, weekStartKey, weekEndKey);

    expect(Object.keys(filtered).length).toBe(1);
    expect(filtered[`emp1_${weekStartKey}`]).toBeDefined();
  });
});
