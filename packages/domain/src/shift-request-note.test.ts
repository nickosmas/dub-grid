import { describe, expect, it } from "vitest";
import { formatShiftRequestNote, managerNoteOf, readShiftRequestNote } from "./shift-request-note";

describe("readShiftRequestNote", () => {
  it("keeps a manager's own words as a manager note", () => {
    expect(readShiftRequestNote("  Covered by agency.  ")).toEqual({
      kind: "manager",
      text: "Covered by agency.",
    });
    expect(formatShiftRequestNote("Covered by agency.")).toBe("Manager note: Covered by agency.");
    expect(managerNoteOf("Covered by agency.")).toBe("Covered by agency.");
  });

  it("reads nothing from an empty note", () => {
    expect(readShiftRequestNote(null)).toBeNull();
    expect(readShiftRequestNote("   ")).toBeNull();
    expect(formatShiftRequestNote(undefined)).toBeNull();
  });

  it("says what happened for each reason the database records", () => {
    expect(formatShiftRequestNote("Auto-cancelled: shift was called off")).toBe(
      "Canceled automatically: the shift was called off.",
    );
    expect(
      formatShiftRequestNote("Auto-cancelled: open shift was taken by another approved volunteer"),
    ).toBe("Canceled automatically: someone else was approved for this open shift.");
    expect(
      formatShiftRequestNote("Auto-cancelled: shift was reassigned by another approved request"),
    ).toBe("Canceled automatically: another approved request changed this shift.");
    expect(formatShiftRequestNote("Assigned through the published schedule")).toBe(
      "Approved automatically: the shift was assigned on the schedule.",
    );
    expect(formatShiftRequestNote("Auto-approved: Jane Doe can approve shift requests")).toBe(
      "Approved automatically: Jane Doe accepted and can approve requests.",
    );
    expect(managerNoteOf("Auto-cancelled: shift was called off")).toBeNull();
  });

  it("never calls an unfamiliar automatic reason a manager note", () => {
    expect(formatShiftRequestNote("Auto-cancelled: the person was suspended")).toBe(
      "Canceled automatically: the person was suspended.",
    );
  });
});
