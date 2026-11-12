import { describe, expect, it } from "vitest";
import {
  createAbsenceNameMask,
  HIDDEN_ABSENCE_TYPE_ID,
  maskCellStateAbsence,
} from "./absence-visibility";

const hiding = createAbsenceNameMask({
  showAbsenceNames: false,
  viewerEmployeeIds: ["me"],
  keepAbsenceTypeIds: [9],
});

describe("createAbsenceNameMask", () => {
  it("is null when the viewer sees every name", () => {
    expect(createAbsenceNameMask({ showAbsenceNames: true, viewerEmployeeIds: ["me"] })).toBeNull();
  });

  it("shows a colleague's absence as Time off", () => {
    expect(hiding?.absenceTypeId("colleague", 4)).toBe(HIDDEN_ABSENCE_TYPE_ID);
  });

  it("keeps the viewer's own absences and the day off", () => {
    expect(hiding?.absenceTypeId("me", 4)).toBe(4);
    expect(hiding?.absenceTypeId("colleague", 9)).toBe(9);
  });

  it("leaves no absence as none", () => {
    expect(hiding?.absenceTypeId("colleague", null)).toBeNull();
  });
});

describe("maskCellStateAbsence", () => {
  const sick = { kind: "absence", absenceTypeId: 4, segments: [] };

  it("rewrites only the absence", () => {
    expect(maskCellStateAbsence(hiding, "colleague", sick)).toEqual({
      ...sick,
      absenceTypeId: HIDDEN_ABSENCE_TYPE_ID,
    });
  });

  it("returns the same state when nothing is hidden", () => {
    expect(maskCellStateAbsence(hiding, "me", sick)).toBe(sick);
    expect(maskCellStateAbsence(null, "colleague", sick)).toBe(sick);
    expect(maskCellStateAbsence(hiding, "colleague", null)).toBeNull();
  });
});
