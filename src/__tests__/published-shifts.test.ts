import { describe, expect, it } from "vitest";
import {
  hasPublishedScheduleContent,
  resolvePublishedScheduleEntry,
  type PublishedShiftRow,
} from "@/lib/published-shifts";

describe("published shift helpers", () => {
  const shiftCodeById = new Map([
    [
      1,
      {
        label: "DAY",
        defaultStartTime: "07:00",
        defaultEndTime: "15:00",
      },
    ],
    [
      2,
      {
        label: "EVE",
        defaultStartTime: "15:00",
        defaultEndTime: "23:00",
      },
    ],
  ]);

  it("ignores rows with no published content", () => {
    const row: PublishedShiftRow = {
      emp_id: "emp-1",
      date: "2026-04-13",
      published_shift_code_ids: [],
      published_absence_type_id: null,
      published_custom_start_time: null,
      published_custom_end_time: null,
    };

    expect(hasPublishedScheduleContent(row)).toBe(false);
    expect(resolvePublishedScheduleEntry(row, shiftCodeById)).toBeNull();
  });

  it("resolves published shift labels, times, and duration from the current schema", () => {
    const row: PublishedShiftRow = {
      emp_id: "emp-1",
      date: "2026-04-13",
      published_shift_code_ids: [1, 2],
      published_absence_type_id: null,
      published_custom_start_time: "06:30|16:00",
      published_custom_end_time: "14:30|22:00",
    };

    expect(resolvePublishedScheduleEntry(row, shiftCodeById)).toEqual({
      kind: "shift",
      empId: "emp-1",
      date: "2026-04-13",
      label: "DAY/EVE",
      shiftCodeIds: [1, 2],
      absenceTypeId: null,
      startTime: "06:30",
      endTime: "22:00",
      durationHours: 14,
    });
  });

  it("resolves published absences without treating them as timed shifts", () => {
    const row: PublishedShiftRow = {
      emp_id: "emp-1",
      date: "2026-04-14",
      published_shift_code_ids: [],
      published_absence_type_id: 7,
      published_custom_start_time: null,
      published_custom_end_time: null,
    };

    expect(
      resolvePublishedScheduleEntry(
        row,
        shiftCodeById,
        new Map([[7, "Vacation"]]),
      ),
    ).toEqual({
      kind: "absence",
      empId: "emp-1",
      date: "2026-04-14",
      label: "Vacation",
      shiftCodeIds: [],
      absenceTypeId: 7,
      startTime: null,
      endTime: null,
      durationHours: 0,
    });
  });
});
