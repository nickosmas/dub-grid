import { describe, expect, it } from "vitest";
import { buildRealtimeDraftDiff } from "@/lib/realtime-draft-utils";
import type { ShiftMap } from "@/types";

describe("buildRealtimeDraftDiff", () => {
  it("returns changed shifts and removed notes only", () => {
    const previousShifts: ShiftMap = {
      "emp-1_2026-04-16": {
        label: "DAY",
        assignmentIds: [1],
        isDraft: true,
        draftKind: "new",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "",
      },
    };
    const nextShifts: ShiftMap = {
      "emp-1_2026-04-16": {
        label: "NOC",
        assignmentIds: [2],
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [1],
        publishedLabel: "DAY",
      },
    };

    const diff = buildRealtimeDraftDiff(
      previousShifts,
      nextShifts,
      {
        "emp-1_2026-04-16_4": [{ indicatorTypeId: 10, status: "draft" }],
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

  describe("scoped to known-changed keys", () => {
    const previousShifts: ShiftMap = {
      "emp-1_2026-04-16": {
        label: "DAY",
        assignmentIds: [1],
        isDraft: true,
        draftKind: "new",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "",
      },
      "emp-2_2026-04-16": {
        label: "NOC",
        assignmentIds: [2],
        isDraft: true,
        draftKind: "new",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "",
      },
    };
    const nextShifts: ShiftMap = {
      "emp-1_2026-04-16": { ...previousShifts["emp-1_2026-04-16"]!, label: "EVE" },
      "emp-2_2026-04-16": { ...previousShifts["emp-2_2026-04-16"]!, label: "MID" },
    };

    it("reports only the scoped key, ignoring other changed cells", () => {
      const diff = buildRealtimeDraftDiff(
        previousShifts,
        nextShifts,
        {},
        {},
        {
          shiftKeys: ["emp-1_2026-04-16"],
        },
      );

      expect(diff).toEqual({
        shifts: { "emp-1_2026-04-16": nextShifts["emp-1_2026-04-16"] },
      });
    });

    it("still reports a scoped key whose cell was removed", () => {
      const diff = buildRealtimeDraftDiff(
        previousShifts,
        {},
        {},
        {},
        {
          shiftKeys: ["emp-1_2026-04-16"],
        },
      );

      expect(diff).toEqual({ shifts: { "emp-1_2026-04-16": null } });
    });

    it("returns null when the scoped key did not actually change", () => {
      const diff = buildRealtimeDraftDiff(
        previousShifts,
        previousShifts,
        {},
        {},
        {
          shiftKeys: ["emp-1_2026-04-16"],
          noteKeys: [],
        },
      );

      expect(diff).toBeNull();
    });

    it("scopes notes independently of shifts", () => {
      const diff = buildRealtimeDraftDiff(
        {},
        {},
        {
          "cell-a": [{ indicatorTypeId: 1, status: "draft" }],
          "cell-b": [{ indicatorTypeId: 2, status: "draft" }],
        },
        { "cell-a": [], "cell-b": [] },
        { noteKeys: ["cell-a"] },
      );

      expect(diff).toEqual({ notes: { "cell-a": [] } });
    });

    it("falls back to a full scan when no scope is given", () => {
      const diff = buildRealtimeDraftDiff(previousShifts, nextShifts, {}, {});

      expect(Object.keys(diff?.shifts ?? {}).sort()).toEqual([
        "emp-1_2026-04-16",
        "emp-2_2026-04-16",
      ]);
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
