import { describe, expect, it } from "vitest";
import { orderSegmentsByStartTime, withLastShiftEnd } from "./shiftEditTime";

const defaults: Record<string, string | null> = {
  day: "07:00:00",
  evening: "15:00",
  general: null,
};
const startOf = (segment: string) => defaults[segment];

describe("orderSegmentsByStartTime", () => {
  it("moves an earlier shift in front of a later one", () => {
    expect(orderSegmentsByStartTime(["evening", "day"], null, null, startOf)).toEqual({
      segments: ["day", "evening"],
      customStartTime: null,
      customEndTime: null,
    });
  });

  it("returns the inputs untouched when they are already in order", () => {
    const segments = ["day", "evening"];
    const result = orderSegmentsByStartTime(segments, "07:30", "15:00", startOf);
    expect(result.segments).toBe(segments);
    expect(result).toMatchObject({ customStartTime: "07:30", customEndTime: "15:00" });
  });

  it("carries each custom time with its shift", () => {
    expect(orderSegmentsByStartTime(["evening", "day"], "16:00", "23:30", startOf)).toEqual({
      segments: ["day", "evening"],
      customStartTime: "|16:00",
      customEndTime: "|23:30",
    });
  });

  it("orders by a custom start over the shift's default", () => {
    expect(orderSegmentsByStartTime(["day", "evening"], "18:00|", null, startOf).segments).toEqual([
      "evening",
      "day",
    ]);
  });

  it("keeps the picking order when a general shift has no start time", () => {
    const generalFirst = ["general", "evening"];
    expect(orderSegmentsByStartTime(generalFirst, null, null, startOf).segments).toBe(generalFirst);
    const generalSecond = ["evening", "general"];
    expect(orderSegmentsByStartTime(generalSecond, null, null, startOf).segments).toBe(
      generalSecond,
    );
  });

  it("orders a general shift by its custom start time", () => {
    expect(orderSegmentsByStartTime(["evening", "general"], "|06:00", "|10:00", startOf)).toEqual({
      segments: ["general", "evening"],
      customStartTime: "06:00|",
      customEndTime: "10:00|",
    });
  });

  it("keeps two shifts without times in the order they were picked", () => {
    const segments = ["general", "general"];
    expect(orderSegmentsByStartTime(segments, null, null, startOf).segments).toBe(segments);
  });
});

describe("withLastShiftEnd", () => {
  it("sets a single shift's end and fills its start from the default", () => {
    expect(withLastShiftEnd(null, null, 1, "07:00", "11:00")).toEqual({
      customStartTime: "07:00",
      customEndTime: "11:00",
    });
  });

  it("keeps a single shift's custom start", () => {
    expect(withLastShiftEnd("08:00", "16:00", 1, "07:00", "12:30")).toEqual({
      customStartTime: "08:00",
      customEndTime: "12:30",
    });
  });

  it("changes only the second of two shifts", () => {
    expect(withLastShiftEnd("06:30|", "14:30|", 2, "15:00", "19:00")).toEqual({
      customStartTime: "06:30|15:00",
      customEndTime: "14:30|19:00",
    });
  });

  it("leaves the first of two shifts without custom times", () => {
    expect(withLastShiftEnd(null, null, 2, "15:00", "19:00")).toEqual({
      customStartTime: "|15:00",
      customEndTime: "|19:00",
    });
  });
});
