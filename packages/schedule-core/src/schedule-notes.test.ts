import { describe, expect, it } from "vitest";
import { canSeeDraftScheduleNotes, scheduleNotesForViewer } from "./schedule-notes";

const rows = [
  { id: 1, status: "published" as const },
  { id: 2, status: "draft" as const },
  { id: 3, status: "draft_deleted" as const },
];

describe("canSeeDraftScheduleNotes", () => {
  it("lets whoever edits shifts or notes see drafts", () => {
    expect(canSeeDraftScheduleNotes({ canEditShifts: true, canEditNotes: false })).toBe(true);
    expect(canSeeDraftScheduleNotes({ canEditShifts: false, canEditNotes: true })).toBe(true);
    expect(canSeeDraftScheduleNotes({ canEditShifts: false, canEditNotes: false })).toBe(false);
  });
});

describe("scheduleNotesForViewer", () => {
  it("gives an editor every note, drafts and pending removals included", () => {
    expect(scheduleNotesForViewer(rows, true)).toEqual(rows);
  });

  it("hides drafts from a viewer and shows a pending removal as published", () => {
    expect(scheduleNotesForViewer(rows, false)).toEqual([
      { id: 1, status: "published" },
      { id: 3, status: "published" },
    ]);
  });

  it("leaves the caller's rows unchanged", () => {
    scheduleNotesForViewer(rows, false);
    expect(rows[2].status).toBe("draft_deleted");
  });
});
