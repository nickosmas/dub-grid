import { describe, expect, it } from "vitest";
import { buildRealtimeDraftDiff } from "@/lib/realtime-draft-utils";
import type { ShiftMap } from "@/types";

describe("buildRealtimeDraftDiff", () => {
  it("returns changed shifts and removed notes only", () => {
    const previousShifts: ShiftMap = {
      "emp-1_2026-04-16": {
        label: "DAY",
        shiftCodeIds: [1],
        isDraft: true,
        draftKind: "new",
        publishedShiftCodeIds: [],
        publishedLabel: "",
      },
    };
    const nextShifts: ShiftMap = {
      "emp-1_2026-04-16": {
        label: "NOC",
        shiftCodeIds: [2],
        isDraft: true,
        draftKind: "modified",
        publishedShiftCodeIds: [1],
        publishedLabel: "DAY",
      },
    };

    const diff = buildRealtimeDraftDiff(
      previousShifts,
      nextShifts,
      {
        "emp-1_2026-04-16_4": [
          { indicatorTypeId: 10, status: "draft" },
        ],
      },
      {
        "emp-1_2026-04-16_4": [],
      },
    );

    expect(diff).toEqual({
      shifts: {
        "emp-1_2026-04-16": nextShifts["emp-1_2026-04-16"],
      },
      notes: {
        "emp-1_2026-04-16_4": [],
      },
    });
  });

  it("treats reordered note payloads as unchanged", () => {
    const diff = buildRealtimeDraftDiff(
      {},
      {},
      {
        cell: [
          { indicatorTypeId: 2, status: "draft" },
          { indicatorTypeId: 1, status: "published" },
        ],
      },
      {
        cell: [
          { indicatorTypeId: 1, status: "published" },
          { indicatorTypeId: 2, status: "draft" },
        ],
      },
    );

    expect(diff).toBeNull();
  });
});
