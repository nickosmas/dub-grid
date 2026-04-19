import { describe, expect, it } from "vitest";
import type { DbShift } from "@/lib/db/types";
import {
  classifyDraftShift,
  hasResidualDraftState,
} from "@/lib/server/schedule-draft-safety";

function makeShift(overrides: Partial<DbShift> = {}): DbShift {
  return {
    emp_id: "emp-1",
    date: "2026-04-15",
    draft_shift_code_ids: [],
    published_shift_code_ids: [],
    draft_absence_type_id: null,
    published_absence_type_id: null,
    draft_is_delete: false,
    version: 1,
    draft_custom_start_time: null,
    draft_custom_end_time: null,
    published_custom_start_time: null,
    published_custom_end_time: null,
    ...overrides,
  };
}

describe("schedule draft safety helpers", () => {
  it("ignores cleanup-only deleted draft rows in the reviewed summary", () => {
    const shift = makeShift({
      draft_is_delete: true,
    });

    expect(classifyDraftShift(shift)).toBeNull();
    expect(hasResidualDraftState(shift)).toBe(true);
  });

  it("still counts a published shift marked for deletion as a real deleted change", () => {
    const shift = makeShift({
      draft_is_delete: true,
      published_shift_code_ids: [3],
    });

    expect(classifyDraftShift(shift)).toBe("deleted");
  });

  it("counts custom-time-only edits as modified changes", () => {
    const shift = makeShift({
      published_shift_code_ids: [3],
      draft_shift_code_ids: [3],
      published_custom_start_time: "07:00",
      published_custom_end_time: "15:00",
      draft_custom_start_time: "08:00",
      draft_custom_end_time: "16:00",
    });

    expect(classifyDraftShift(shift)).toBe("modified");
  });

  it("ignores persisted fallback rows that only rely on published custom times", () => {
    const shift = makeShift({
      published_shift_code_ids: [3],
      draft_shift_code_ids: [3],
      published_custom_start_time: "07:00",
      published_custom_end_time: "15:00",
      draft_custom_start_time: null,
      draft_custom_end_time: null,
    });

    expect(classifyDraftShift(shift)).toBeNull();
  });

  it("still counts absence-to-shift changes when draft custom times fall back to published", () => {
    const shift = makeShift({
      published_absence_type_id: 9,
      draft_shift_code_ids: [3],
      draft_absence_type_id: null,
      published_custom_start_time: "07:00",
      published_custom_end_time: "15:00",
      draft_custom_start_time: null,
      draft_custom_end_time: null,
    });

    expect(classifyDraftShift(shift)).toBe("modified");
  });
});
