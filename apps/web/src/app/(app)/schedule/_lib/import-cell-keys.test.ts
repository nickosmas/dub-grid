import { describe, expect, it } from "vitest";
import { getImportTargetCellKeys } from "./import-cell-keys";

describe("getImportTargetCellKeys", () => {
  it("returns a cell key for each imported row", () => {
    expect(
      getImportTargetCellKeys([
        { employeeId: "emp-1", targetDate: "2026-04-12", outcome: "imported" },
        { employeeId: "emp-2", targetDate: "2026-04-13", outcome: "imported" },
      ]),
    ).toEqual(["emp-1_2026-04-12", "emp-2_2026-04-13"]);
  });

  it("ignores rows the import skipped", () => {
    expect(
      getImportTargetCellKeys([
        { employeeId: "emp-1", targetDate: "2026-04-12", outcome: "skipped" },
        { employeeId: "emp-2", targetDate: "2026-04-13", outcome: "imported" },
      ]),
    ).toEqual(["emp-2_2026-04-13"]);
  });

  it("returns nothing for an empty run", () => {
    expect(getImportTargetCellKeys([])).toEqual([]);
  });
});
