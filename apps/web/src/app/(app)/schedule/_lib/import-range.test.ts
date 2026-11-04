import { describe, expect, it } from "vitest";
import { importPreviousRange } from "./import-range";

describe("importPreviousRange", () => {
  it("copies the whole previous period into a period that starts today or later", () => {
    expect(importPreviousRange("2026-11-08", 7, "2026-11-04")).toEqual({
      sourceStart: "2026-11-01",
      sourceEnd: "2026-11-07",
      targetStart: "2026-11-08",
      targetEnd: "2026-11-14",
      skipsPastDays: false,
    });
  });

  it("starts at today in a period under way, each day taking the same day of the period before", () => {
    expect(importPreviousRange("2026-11-01", 14, "2026-11-04")).toEqual({
      sourceStart: "2026-10-21",
      sourceEnd: "2026-10-31",
      targetStart: "2026-11-04",
      targetEnd: "2026-11-14",
      skipsPastDays: true,
    });
  });

  it("copies only today on the period's last day", () => {
    expect(importPreviousRange("2026-10-29", 7, "2026-11-04")).toMatchObject({
      sourceStart: "2026-10-28",
      sourceEnd: "2026-10-28",
      targetStart: "2026-11-04",
      targetEnd: "2026-11-04",
    });
  });

  it("has nothing to copy into a period that has passed", () => {
    expect(importPreviousRange("2026-10-25", 7, "2026-11-04")).toBeNull();
  });
});
