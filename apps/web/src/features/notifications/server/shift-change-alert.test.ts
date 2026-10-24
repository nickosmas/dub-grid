import { describe, expect, it } from "vitest";
import { describeShiftChange, type ShiftChangeShiftInput } from "@dubgrid/schedule-core";
import { buildShiftChangeAlert } from "./shift-change-alert";

function shift(overrides: Partial<ShiftChangeShiftInput> = {}): ShiftChangeShiftInput {
  return {
    kind: "shift",
    key: "1:10",
    shiftName: "Day Shift",
    jobName: "Registered Nurse",
    focusAreaName: "Skilled Nursing",
    start: "07:00",
    end: "15:00",
    ...overrides,
  };
}

const evening = shift({ key: "2:10", shiftName: "Evening Shift", start: "15:00", end: "23:00" });
const sick = {
  kind: "absence" as const,
  key: "absence:4",
  name: "Sick",
  scope: "restOfDay" as const,
};

const moved = {
  date: "2026-10-22",
  change: describeShiftChange(
    { items: [shift()] },
    { items: [shift({ focusAreaName: "Memory Care" })] },
    { date: "2026-10-22" },
  ),
};
const removed = {
  date: "2026-10-20",
  change: describeShiftChange({ items: [shift()] }, { items: [] }, { date: "2026-10-20" }),
};
const double = {
  date: "2026-10-24",
  change: describeShiftChange(
    { items: [shift(), evening] },
    { items: [shift({ end: "12:00" }), sick] },
    { date: "2026-10-24" },
  ),
};

describe("buildShiftChangeAlert", () => {
  it("tells one day in the compact form, Before and After by email, never the publisher", () => {
    const alert = buildShiftChangeAlert({
      days: [moved],
      showDetails: true,
      publishHistoryId: "h-1",
    });

    expect(alert).toEqual({
      title: "Your schedule for Thu, Oct 22 changed",
      message:
        "Thu, Oct 22: Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing → Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Memory Care",
      metadata: { date: "2026-10-22", dates: ["2026-10-22"], publishHistoryId: "h-1" },
      email: {
        intro: "The latest published schedule changed these days for you.",
        details: [
          {
            label: "Thu, Oct 22 Before",
            value: "Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing",
          },
          {
            label: "Thu, Oct 22 After",
            value: "Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Memory Care",
          },
        ],
        closing: "Open the schedule in DubGrid to see your whole week.",
      },
    });
  });

  it("tells a shift on a day that had nothing as New, without Before and After", () => {
    const added = {
      date: "2026-10-23",
      change: describeShiftChange({ items: [] }, { items: [shift()] }, { date: "2026-10-23" }),
    };
    const alert = buildShiftChangeAlert({
      days: [added],
      showDetails: true,
      publishHistoryId: "h-1",
    });

    expect(alert?.message).toBe(
      "Fri, Oct 23: New: Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing",
    );
    expect(alert?.email.details).toEqual([
      {
        label: "Fri, Oct 23 New",
        value: "Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing",
      },
    ]);
  });

  it("lists every changed day in date order, a removed shift against No shift", () => {
    const alert = buildShiftChangeAlert({
      days: [moved, removed],
      showDetails: true,
      publishHistoryId: "h-1",
    });

    expect(alert?.title).toBe("Your schedule changed on 2 days");
    expect(alert?.message.split("\n")).toEqual([
      "Tue, Oct 20: Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing → No shift",
      expect.stringMatching(/^Thu, Oct 22: /),
    ]);
    expect(alert?.metadata.date).toBe("2026-10-20");
    expect(alert?.email.details[1]).toEqual({ label: "Tue, Oct 20 After", value: "No shift" });
  });

  it("gives a double shift day its totals and labeled items by email", () => {
    const alert = buildShiftChangeAlert({
      days: [double],
      showDetails: true,
      publishHistoryId: "h-1",
    });

    expect(alert?.email.details).toEqual([
      {
        label: "Sat, Oct 24 Before (16 hrs)",
        value:
          "Shift 1: Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing; Shift 2: Evening Shift · Registered Nurse · 3:00 PM - 11:00 PM (8 hrs) · Skilled Nursing (removed)",
      },
      {
        label: "Sat, Oct 24 After (5 hrs)",
        value:
          "Shift 1: Day Shift · Registered Nurse · 7:00 AM - 12:00 PM (5 hrs) · Skilled Nursing; Absence: Sick (rest of day) (added)",
      },
    ]);
  });

  it("names only the days when the organization hides what changed", () => {
    const alert = buildShiftChangeAlert({
      days: [double, moved, removed],
      showDetails: false,
      publishHistoryId: "h-1",
    });
    const summary =
      "Your schedule changed on Tue, Oct 20, Thu, Oct 22 and Sat, Oct 24. Open the schedule to see it now.";

    expect(alert?.message).toBe(summary);
    expect(alert?.email).toEqual({ intro: summary, details: [], closing: "" });
    expect(JSON.stringify(alert)).not.toMatch(/Day Shift|Skilled Nursing/);
  });

  it("sends nothing when no day changed", () => {
    const same = {
      date: "2026-10-22",
      change: describeShiftChange(
        { items: [shift()] },
        { items: [shift()] },
        { date: "2026-10-22" },
      ),
    };
    expect(
      buildShiftChangeAlert({ days: [same], showDetails: true, publishHistoryId: "h-1" }),
    ).toBeNull();
  });
});
