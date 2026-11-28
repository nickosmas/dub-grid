import { describe, expect, it } from "vitest";
import {
  computeShiftSegmentHours,
  scheduleStateHours,
  type HoursAssignmentLike,
  type HoursShiftCategoryLike,
} from "./hours-assembly";

function makeAssignment(overrides: Partial<HoursAssignmentLike> = {}): HoursAssignmentLike {
  return { id: 1, ...overrides };
}

describe("computeShiftSegmentHours", () => {
  it("uses the assignment's own default start/end time when present", () => {
    const assignmentById = new Map([
      [1, makeAssignment({ id: 1, defaultStartTime: "07:00", defaultEndTime: "15:00" })],
    ]);
    const hours = computeShiftSegmentHours([1], assignmentById, null, null, new Map());
    expect(hours).toBe(8);
  });

  it("deducts the shift category's break minutes from an assignment-level time", () => {
    const assignmentById = new Map([
      [
        1,
        makeAssignment({
          id: 1,
          defaultStartTime: "07:00",
          defaultEndTime: "15:00",
          categoryId: 9,
        }),
      ],
    ]);
    const categoryById = new Map<number, HoursShiftCategoryLike>([
      [9, { id: 9, breakMinutes: 30 }],
    ]);
    const hours = computeShiftSegmentHours([1], assignmentById, null, null, categoryById);
    expect(hours).toBe(7.5);
  });

  it("falls back to the shift category's default time when the assignment has none", () => {
    const assignmentById = new Map([[1, makeAssignment({ id: 1, categoryId: 9 })]]);
    const categoryById = new Map<number, HoursShiftCategoryLike>([
      [9, { id: 9, startTime: "19:00", endTime: "07:00", breakMinutes: 0 }],
    ]);
    // Overnight shift: 19:00 -> 07:00 next day = 12 hours.
    const hours = computeShiftSegmentHours([1], assignmentById, null, null, categoryById);
    expect(hours).toBe(12);
  });

  it("falls back to a flat duration field when there is no start/end time anywhere", () => {
    const assignmentById = new Map([
      [1, makeAssignment({ id: 1, defaultDurationHours: 4, defaultDurationMinutes: 30 })],
    ]);
    const hours = computeShiftSegmentHours([1], assignmentById, null, null, new Map());
    expect(hours).toBe(4.5);
  });

  it("parses pipe-delimited per-segment custom times for a split shift", () => {
    const assignmentById = new Map([
      [1, makeAssignment({ id: 1 })],
      [2, makeAssignment({ id: 2 })],
    ]);
    const hours = computeShiftSegmentHours(
      [1, 2],
      assignmentById,
      "07:00|13:00",
      "09:00|17:00",
      new Map(),
    );
    expect(hours).toBe(2 + 4);
  });

  it("sums a single custom time range across all assignments, deducting only the first's break", () => {
    const assignmentById = new Map([
      [1, makeAssignment({ id: 1, categoryId: 9 })],
      [2, makeAssignment({ id: 2, categoryId: 9 })],
    ]);
    const categoryById = new Map<number, HoursShiftCategoryLike>([
      [9, { id: 9, breakMinutes: 30 }],
    ]);
    const hours = computeShiftSegmentHours([1, 2], assignmentById, "07:00", "15:00", categoryById);
    expect(hours).toBe(7.5);
  });

  it("returns 0 for an unresolved assignment id", () => {
    const hours = computeShiftSegmentHours([999], new Map(), null, null, new Map());
    expect(hours).toBe(0);
  });
});

describe("computeShiftSegmentHours across a DST change", () => {
  const night = new Map([
    [1, makeAssignment({ id: 1, defaultStartTime: "23:00", defaultEndTime: "07:00" })],
  ]);

  it("counts the hour the fall-back night repeats", () => {
    const day = { date: "2026-10-31", timeZone: "America/New_York" };
    expect(computeShiftSegmentHours([1], night, null, null, new Map(), day)).toBe(9);
    expect(computeShiftSegmentHours([1], night, "23:00", "07:00", new Map(), day)).toBe(9);
  });

  it("keeps clock hours when no day is given", () => {
    expect(computeShiftSegmentHours([1], night, null, null, new Map())).toBe(8);
  });
});

describe("scheduleStateHours", () => {
  const shiftCategoriesById = new Map([[1, { id: 1, startTime: "07:00", endTime: "15:30" }]]);
  const assignmentById = new Map([[5, { id: 5, categoryId: 1, defaultDurationHours: 4 }]]);
  const assignmentIdByPair = new Map([["1:10", 5]]);
  const lookups = { assignmentById, assignmentIdByPair, shiftCategoriesById };

  it("reads a segment's assignment", () => {
    const state = { kind: "worked", segments: [{ shiftId: 1, jobId: 10 }] };
    expect(scheduleStateHours(state, lookups)).toBe(
      computeShiftSegmentHours([5], assignmentById, null, null, shiftCategoriesById),
    );
  });

  it("falls back to the shift's own times when no assignment matches", () => {
    const state = { kind: "worked", segments: [{ shiftId: 1, jobId: 99 }] };
    expect(scheduleStateHours(state, lookups)).toBe(8.5);
  });

  it("counts an absence as no hours", () => {
    expect(scheduleStateHours({ kind: "absence", segments: [] }, lookups)).toBe(0);
  });

  it("counts a night across the fall-back change as the time worked", () => {
    const nights = new Map([[2, { id: 2, startTime: "23:00", endTime: "07:00" }]]);
    const state = { kind: "worked", segments: [{ shiftId: 2, jobId: 99 }] };
    const night = { ...lookups, shiftCategoriesById: nights };
    expect(
      scheduleStateHours(state, night, { date: "2026-10-31", timeZone: "America/New_York" }),
    ).toBe(9);
    expect(scheduleStateHours(state, night)).toBe(8);
  });
});
