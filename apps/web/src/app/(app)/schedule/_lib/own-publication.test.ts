import { describe, expect, it } from "vitest";
import type { PublishHistoryEntry } from "@/types";
import { markOwnPublicationAsAdditions } from "./own-publication";

function entry(overrides: Partial<PublishHistoryEntry>): PublishHistoryEntry {
  return {
    id: "p1",
    publishedBy: "u1",
    startDate: "2026-09-14",
    endDate: "2026-09-20",
    changeCount: 1,
    changes: [{ empId: "e1", date: "2026-09-14", kind: "new", isNewAddition: false }],
    noteChanges: [
      {
        empId: "e1",
        date: "2026-09-14",
        kind: "new",
        isNewAddition: false,
        indicatorTypeId: 1,
        focusAreaId: null,
        indicatorName: "Training",
        indicatorColor: "#000",
      },
    ],
    publishedAt: "2026-09-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("markOwnPublicationAsAdditions", () => {
  it("returns empty input unchanged", () => {
    expect(markOwnPublicationAsAdditions([])).toEqual([]);
  });

  it("marks the newest entry's new cells and notes as additions", () => {
    const [result] = markOwnPublicationAsAdditions([entry({})]);
    expect(result!.changes[0]!.isNewAddition).toBe(true);
    expect(result!.noteChanges![0]!.isNewAddition).toBe(true);
  });

  it("leaves another scheduler's older entries on the reader baseline rule", () => {
    const older = entry({ id: "p0", publishedBy: "u2", publishedAt: "2026-09-18T10:00:00.000Z" });
    const newest = entry({ id: "p1" });
    const result = markOwnPublicationAsAdditions([older, newest], "u1");
    expect(result.find((e) => e.id === "p0")).toBe(older);
    expect(result.find((e) => e.id === "p1")!.changes[0]!.isNewAddition).toBe(true);
  });

  it("marks the publisher's earlier publications in the window as additions too", () => {
    // An Auto-built week published first, then a fix to one of its days: the
    // week's first publication is still what this person just put live.
    const built = entry({ id: "p0", publishedAt: "2026-09-18T10:00:00.000Z" });
    const fix = entry({
      id: "p1",
      changes: [{ empId: "e2", date: "2026-09-15", kind: "modified" }],
      noteChanges: undefined,
    });
    const result = markOwnPublicationAsAdditions([fix, built], "u1");
    expect(result.find((e) => e.id === "p0")!.changes[0]!.isNewAddition).toBe(true);
  });

  it("marks only the newest entry when the publisher is unknown", () => {
    const older = entry({ id: "p0", publishedAt: "2026-09-18T10:00:00.000Z" });
    const result = markOwnPublicationAsAdditions([older, entry({ id: "p1" })]);
    expect(result.find((e) => e.id === "p0")).toBe(older);
  });

  it("does not touch modified or deleted changes", () => {
    const [result] = markOwnPublicationAsAdditions([
      entry({
        changes: [
          { empId: "e1", date: "2026-09-14", kind: "modified" },
          { empId: "e2", date: "2026-09-14", kind: "deleted" },
        ],
        noteChanges: undefined,
      }),
    ]);
    expect(result!.changes.every((c) => c.isNewAddition === undefined)).toBe(true);
    expect(result!.noteChanges).toBeUndefined();
  });
});
