import { describe, expect, it } from "vitest";
import { describeEditingCell } from "./presence-labels";

const directory = new Map([
  ["emp-1", "Jane Doe"],
  ["emp-2", "Riley RN"],
]);

describe("describeEditingCell", () => {
  it("combines the employee and the cell date", () => {
    expect(describeEditingCell("emp-1_2026-03-03", directory)).toBe("Jane Doe, Tue, Mar 3");
  });

  it("returns null when nothing is being edited", () => {
    expect(describeEditingCell(null, directory)).toBeNull();
  });

  it("falls back to the date when the employee is outside the directory", () => {
    expect(describeEditingCell("emp-missing_2026-03-03", directory)).toBe("Tue, Mar 3");
  });

  it("falls back to the employee when the key carries no date", () => {
    expect(describeEditingCell("emp-2_not-a-date", directory)).toBe("Riley RN");
  });

  it("returns null when neither half resolves", () => {
    expect(describeEditingCell("garbage", directory)).toBeNull();
  });

  it("keeps the calendar day for timezones behind UTC", () => {
    // A bare date string parses as UTC midnight, which renders as the previous
    // day west of Greenwich. The label must show the date the user picked.
    expect(describeEditingCell("emp-1_2026-01-01", directory)).toBe("Jane Doe, Thu, Jan 1");
  });

  it("refuses to invent a date that does not exist", () => {
    // Out-of-range days roll forward in the Date constructor, so this used to
    // render as "Mar 3" instead of admitting the date is unusable.
    expect(describeEditingCell("emp-1_2026-02-31", directory)).toBe("Jane Doe");
  });
});
