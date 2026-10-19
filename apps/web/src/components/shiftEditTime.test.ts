import { describe, expect, it } from "vitest";
import { orderSegmentsByStartTime } from "./shiftEditTime";

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

  it("puts a shift without a start time after a timed one", () => {
    expect(orderSegmentsByStartTime(["general", "evening"], null, null, startOf).segments).toEqual([
      "evening",
      "general",
    ]);
    expect(orderSegmentsByStartTime(["day", "general"], null, null, startOf).segments).toEqual([
      "day",
      "general",
    ]);
  });

  it("keeps two shifts without times in the order they were picked", () => {
    const segments = ["general", "general"];
    expect(orderSegmentsByStartTime(segments, null, null, startOf).segments).toBe(segments);
  });
});
