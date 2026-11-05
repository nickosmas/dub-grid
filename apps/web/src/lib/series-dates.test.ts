import { describe, expect, it } from "vitest";
import { seriesScopeRange } from "./series-dates";

describe("seriesScopeRange", () => {
  it("reaches back, forward or across the whole series from the occurrence's date, from today on", () => {
    expect(seriesScopeRange("previous", "2026-08-10", "2026-08-03")).toEqual({
      fromDate: "2026-08-03",
      toDate: "2026-08-10",
    });
    expect(seriesScopeRange("following", "2026-08-10", "2026-08-03")).toEqual({
      fromDate: "2026-08-10",
    });
    expect(seriesScopeRange("all", "2026-08-10", "2026-08-03")).toEqual({
      fromDate: "2026-08-03",
    });
  });

  it("never starts before today", () => {
    expect(seriesScopeRange("following", "2026-08-01", "2026-08-03")).toEqual({
      fromDate: "2026-08-03",
    });
  });
});
