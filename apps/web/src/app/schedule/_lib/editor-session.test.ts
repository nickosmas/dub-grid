import { describe, expect, it } from "vitest";

import {
  computeScheduleEntryDraftKind,
  shiftEditableIdentityMatches,
} from "./editor-session";
import type { ShiftMap } from "@/types";

function makeShiftEntry(
  overrides: Partial<ShiftMap[string]> = {},
): ShiftMap[string] {
  return {
    draft: null,
    published: null,
    effective: null,
    label: "Day - Staff",
    segments: [
      {
        shiftId: 10,
        jobId: 100,
        position: 0,
        label: "Day - Staff",
        isMentored: false,
      },
    ],
    assignmentIds: [1],
    isDraft: false,
    isDelete: false,
    draftKind: null,
    publishedAssignmentDefinitionIds: [1],
    publishedSegments: [
      {
        shiftId: 10,
        jobId: 100,
        position: 0,
        label: "Day - Staff",
        isMentored: false,
      },
    ],
    publishedLabel: "Day - Staff",
    customStartTime: null,
    customEndTime: null,
    publishedCustomStartTime: null,
    publishedCustomEndTime: null,
    absenceTypeId: null,
    publishedAbsenceTypeId: null,
    ...overrides,
  };
}

describe("schedule editor session helpers", () => {
  it("classifies mentored-only shift edits as modified drafts", () => {
    const entry = makeShiftEntry({
      segments: [
        {
          shiftId: 10,
          jobId: 100,
          position: 0,
          label: "Day - Staff",
          isMentored: true,
        },
      ],
    });

    expect(computeScheduleEntryDraftKind(entry)).toBe("modified");
  });

  it("treats mentored-only shift edits as editable identity changes", () => {
    const base = makeShiftEntry();
    const draft = makeShiftEntry({
      segments: [
        {
          shiftId: 10,
          jobId: 100,
          position: 0,
          label: "Day - Staff",
          isMentored: true,
        },
      ],
    });

    expect(shiftEditableIdentityMatches(base, draft)).toBe(false);
  });

  it("keeps time-only edits out of editable identity comparisons", () => {
    const base = makeShiftEntry({ customStartTime: "07:00" });
    const draft = makeShiftEntry({ customStartTime: "08:00" });

    expect(shiftEditableIdentityMatches(base, draft)).toBe(true);
  });
});
