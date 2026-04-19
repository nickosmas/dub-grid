import { describe, expect, it } from "vitest";
import { mapDbShiftRowToShiftEntry } from "@/lib/db/shift-row-mapper";
import type { DbShift } from "@/lib/db/types";

function makeShift(overrides: Partial<DbShift> = {}): DbShift {
  return {
    emp_id: "emp-1",
    date: "2026-04-15",
    draft_shift_code_ids: [],
    published_shift_code_ids: [],
    draft_absence_type_id: null,
    published_absence_type_id: null,
    draft_is_delete: false,
    version: 7,
    draft_custom_start_time: null,
    draft_custom_end_time: null,
    published_custom_start_time: null,
    published_custom_end_time: null,
    created_by: "creator-1",
    updated_by: "editor-1",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mapDbShiftRowToShiftEntry", () => {
  const shiftCodeMap = new Map([[3, "DAY"]]);

  it("keeps published identity while showing draft custom times for scheduler rows", () => {
    const entry = mapDbShiftRowToShiftEntry(
      makeShift({
        published_shift_code_ids: [3],
        draft_shift_code_ids: [],
        published_custom_start_time: "07:00",
        published_custom_end_time: "15:00",
        draft_custom_start_time: "08:00",
        draft_custom_end_time: "16:00",
      }),
      { isScheduler: true, shiftCodeMap },
    );

    expect(entry).toMatchObject({
      label: "DAY",
      shiftCodeIds: [3],
      absenceTypeId: null,
      customStartTime: "08:00",
      customEndTime: "16:00",
      publishedCustomStartTime: "07:00",
      publishedCustomEndTime: "15:00",
      draftKind: "modified",
      isDraft: true,
      isDelete: false,
      publishedLabel: "DAY",
    });
  });

  it("keeps staff-facing rows on published times even when a draft custom time exists", () => {
    const entry = mapDbShiftRowToShiftEntry(
      makeShift({
        published_shift_code_ids: [3],
        draft_shift_code_ids: [],
        published_custom_start_time: "07:00",
        published_custom_end_time: "15:00",
        draft_custom_start_time: "08:00",
        draft_custom_end_time: "16:00",
      }),
      { isScheduler: false, shiftCodeMap },
    );

    expect(entry).toMatchObject({
      label: "DAY",
      shiftCodeIds: [3],
      customStartTime: "07:00",
      customEndTime: "15:00",
      draftKind: "modified",
      isDraft: true,
    });
  });
});
