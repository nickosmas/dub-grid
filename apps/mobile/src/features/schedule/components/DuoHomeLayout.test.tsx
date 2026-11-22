import { describe, expect, it } from "vitest";
import { addMonthsToIso } from "./DuoHomeLayout";

describe("addMonthsToIso", () => {
  it("steps forward and back across a year", () => {
    expect(addMonthsToIso("2026-11-01", 1)).toBe("2026-12-01");
    expect(addMonthsToIso("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonthsToIso("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("keeps the first of the month", () => {
    expect(addMonthsToIso("2026-03-01", -1)).toBe("2026-02-01");
    expect(addMonthsToIso("2026-11-01", 0)).toBe("2026-11-01");
  });
});
