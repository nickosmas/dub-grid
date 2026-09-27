import { describe, expect, it } from "vitest";
import {
  mobileBootstrapResponseSchema,
  mobileIndicatorTypeSchema,
  mobileScheduleEntrySchema,
  mobileScheduleIndicatorSchema,
} from "./mobile";

const entry = {
  employeeId: "33333333-3333-4333-8333-333333333333",
  employeeName: "Alex North",
  date: "2026-04-18",
  state: {
    kind: "worked",
    segments: [{ shiftId: 1, jobId: 10, position: 0 }],
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    seriesId: null,
    fromRecurring: false,
  },
  presentation: {
    label: "Nurse",
    shiftName: "Day Shift",
    focusAreaId: 2,
    focusAreaName: "ICU",
    displayFocusAreaName: "ICU",
    startTime: "07:00:00",
    endTime: "15:00:00",
    segments: [
      {
        shiftId: 1,
        jobId: 10,
        label: "Nurse",
        shiftName: "Day Shift",
        jobName: "Nurse",
        jobColor: "#ECFEFF",
        jobBorderColor: "#A5F3FC",
        jobTextColor: "#0E7490",
        startTime: "07:00:00",
        endTime: "15:00:00",
        displayFocusAreaName: "ICU",
      },
    ],
  },
  publishedAt: null,
  publishedByName: null,
};

const float = {
  indicatorTypeId: 7,
  focusAreaId: 2,
  name: "Float",
  color: "#ff0000",
  state: "published",
};

// 42b: entries carry indicators and bootstrap carries indicator types, both
// defaulted so an older server's response still parses.
describe("mobile schedule indicators", () => {
  it("parses an older server's entry with no indicators as none", () => {
    expect(mobileScheduleEntrySchema.parse(entry).indicators).toEqual([]);
  });

  it("parses an entry's indicators, with and without a focus area", () => {
    const parsed = mobileScheduleEntrySchema.parse({
      ...entry,
      indicators: [float, { ...float, focusAreaId: null, state: "draft_added" }],
    });
    expect(parsed.indicators).toHaveLength(2);
  });

  it("refuses an indicator with an empty colour or an unknown state", () => {
    expect(mobileScheduleIndicatorSchema.safeParse({ ...float, color: "" }).success).toBe(false);
    expect(mobileScheduleIndicatorSchema.safeParse({ ...float, state: "draft" }).success).toBe(
      false,
    );
  });

  it("parses an older server's bootstrap with no indicator types as none", () => {
    expect(mobileBootstrapResponseSchema.shape.indicatorTypes.parse(undefined)).toEqual([]);
  });

  it("parses indicator types and refuses an empty colour", () => {
    const type = { id: 7, name: "Float", color: "#ff0000", sortOrder: 1 };
    expect(mobileIndicatorTypeSchema.parse(type)).toEqual(type);
    expect(mobileIndicatorTypeSchema.safeParse({ ...type, color: "" }).success).toBe(false);
  });
});
