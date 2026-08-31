import { describe, expect, it } from "vitest";
import {
  computeShiftSegmentHours,
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
