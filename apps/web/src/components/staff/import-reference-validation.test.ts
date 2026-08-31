import { describe, expect, it } from "vitest";
import { getImportReferenceErrors } from "./import-reference-validation";

const options = {
  focusAreaNames: ["Skilled Nursing", "Sheltered Care"],
  certificationNames: ["Nurse"],
  roleNames: ["Nurse", "Mentor"],
};

describe("getImportReferenceErrors", () => {
  it("reports every unrecognized reference while accepting case-insensitive matches", () => {
    expect(
      getImportReferenceErrors(
        {
          focusAreaNames: "skilled nursing; Rehab Wing",
          certificationName: "RN",
          roleNames: "Nurse; Supervisor",
        },
        options,
      ),
    ).toEqual([
      'Unknown focus area: "Rehab Wing"',
      'Unknown certification: "RN"',
      'Unknown role: "Supervisor"',
    ]);
  });
});
