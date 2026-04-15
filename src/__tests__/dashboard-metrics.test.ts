/**
 * dashboard-metrics.test.ts — Verify all dashboard metrics are calculated correctly
 */

import { describe, it, expect } from "vitest";
import {
  computeCoveragePctAndSlots,
  computeOpenShifts,
  computeShiftDurationHours,
  computeAllEmployeeHours,
  formatDateKey,
  getDatesInRange,
  filterShiftsByWeek,
  getWeekStart,
} from "@/lib/dashboard-stats";
import type { ShiftMap, Employee, FocusArea, ShiftCode, CoverageRequirement } from "@/types";

describe("Dashboard Metrics", () => {
  // Sample data
  const baseDate = new Date("2026-04-11");
  const weekStart = getWeekStart(baseDate);
  const weekDates = getDatesInRange(weekStart, 7);

  const employee1: Employee = {
    id: "emp1",
    userId: "user1",
    firstName: "John",
    lastName: "Doe",
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

  const shiftCode1: ShiftCode = {
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

  const shiftCode2: ShiftCode = {
    ...shiftCode1,
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
    shiftCodeId: 101,
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
        shiftCodeIds: codeIds,
        publishedShiftCodeIds: codeIds,
        publishedLabel: codeIds.map((id) => (id === 101 ? "DAY" : "EVE")).join("/"),
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
      [shiftCode1, shiftCode2],
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
      [shiftCode1, shiftCode2],
      [coverageRequirement],
      weekDates,
      [employee1, employee2],
      shifts,
    );

    // 2 required, 1 filled = 50%, 1 open slot
    expect(result.pct).toBe(50);
    expect(result.openSlots).toBe(1);
  });

  it("should detect open shifts gaps", () => {
    const mondayDateObj = weekDates[1];
    const mondayKey = formatDateKey(mondayDateObj);
    const shifts: ShiftMap = {}; // No shifts scheduled

    const shiftCodeById = new Map([[101, shiftCode1]]);

    const openShifts = computeOpenShifts(
      [focusArea1],
      [shiftCode1, shiftCode2],
      [coverageRequirement],
      weekDates,
      [employee1, employee2],
      shifts,
      shiftCodeById,
    );

    // Should detect open shifts when no shifts are scheduled
    expect(openShifts.length).toBeGreaterThan(0);
    // Verify Monday date is in the detected gaps
    const hasMonday = openShifts.some((s) => formatDateKey(s.date) === mondayKey);
    expect(hasMonday).toBe(true);
  });

  it("should calculate shift duration correctly", () => {
    const shiftCodeById = new Map([[101, shiftCode1]]);

    // 09:00 - 17:00 = 8 hours
    const duration = computeShiftDurationHours([101], shiftCodeById);
    expect(duration).toBe(8);
  });

  it("should calculate shift duration with custom times", () => {
    const shiftCodeById = new Map([[101, shiftCode1]]);

    // Custom: 06:00 - 14:00 = 8 hours
    const duration = computeShiftDurationHours([101], shiftCodeById, "06:00", "14:00");
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

    const shiftCodeById = new Map([[101, shiftCode1]]);
    const periodDateKeys = weekDates.map(formatDateKey);

    const hours = computeAllEmployeeHours(
      [employee1],
      periodDateKeys,
      shifts,
      shiftCodeById,
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
        shiftCodeIds: [101],
        publishedShiftCodeIds: [101],
        publishedLabel: "DAY",
        customStartTime: "08:00",
        customEndTime: "18:00", // 10 hours
        isDraft: false,
        draftKind: null,
      };
    }

    const shiftCodeById = new Map([[101, shiftCode1]]);
    const periodDateKeys = weekDates.map(formatDateKey);

    const hours = computeAllEmployeeHours(
      [employee1],
      periodDateKeys,
      shifts,
      shiftCodeById,
      40,
    );

    expect(hours[0]?.totalHours).toBe(50);
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
