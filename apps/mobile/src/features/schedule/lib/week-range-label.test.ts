import { describe, expect, it } from "vitest";
import { compactSameMonthRange } from "./week-range-label";

describe("compactSameMonthRange", () => {
  it("names a month once when the week stays inside it", () => {
    expect(compactSameMonthRange("Nov 15 - Nov 21")).toBe("Nov 15 - 21");
  });

  it("keeps both months when the week crosses one", () => {
    expect(compactSameMonthRange("Nov 29 - Dec 5")).toBe("Nov 29 - Dec 5");
  });
});
