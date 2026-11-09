import { describe, expect, it } from "vitest";
import { describeShiftChange, type ShiftChangeShiftInput } from "./shift-change";
import {
  formatShiftChangeCompact,
  formatShiftChangeCompactSides,
  formatShiftChangePlain,
} from "./shift-change-text";

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

const monday = describeShiftChange(
  { items: [shift()] },
  { items: [shift({ focusAreaName: "Memory Care" })] },
  { date: "2026-10-19" },
);

const thursday = describeShiftChange(
  { items: [shift(), evening] },
  { items: [shift({ end: "12:00" }), sick] },
  { date: "2026-10-22" },
);

describe("formatShiftChangePlain", () => {
  it("writes a single change as Before and After lines (Mon)", () => {
    expect(formatShiftChangePlain(monday)).toEqual([
      "Before: Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 3:00 PM (8 hrs)",
      "After: Day Shift · Registered Nurse · Memory Care · 7:00 AM - 3:00 PM (8 hrs)",
    ]);
  });

  it("writes a whole day with totals, labels and tags (Thu)", () => {
    expect(formatShiftChangePlain(thursday)).toEqual([
      "Before (16 hrs):",
      "Shift 1: Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 3:00 PM (8 hrs)",
      "Shift 2: Evening Shift · Registered Nurse · Skilled Nursing · 3:00 PM - 11:00 PM (8 hrs) (removed)",
      "After (5 hrs):",
      "Shift 1: Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 12:00 PM (5 hrs)",
      "Absence: Sick (part of day) (added)",
    ]);
  });

  it("writes a shift on a day that had nothing as New, without Before and After", () => {
    const change = describeShiftChange({ items: [] }, { items: [shift()] }, { date: "2026-10-23" });
    expect(formatShiftChangePlain(change)).toEqual([
      "New: Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 3:00 PM (8 hrs)",
    ]);
    expect(formatShiftChangeCompact(change)).toBe(
      "New: Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 3:00 PM (8 hrs)",
    );
  });

  it("writes the break in a split double", () => {
    const change = describeShiftChange(
      { items: [shift()] },
      { items: [shift({ end: "11:00" }), evening] },
      { date: "2026-10-26" },
    );
    expect(formatShiftChangePlain(change).slice(2)).toEqual([
      "After (12 hrs):",
      "Shift 1: Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 11:00 AM (4 hrs)",
      "Break: 4 hrs, 11:00 AM - 3:00 PM",
      "Shift 2: Evening Shift · Registered Nurse · Skilled Nursing · 3:00 PM - 11:00 PM (8 hrs) (added)",
    ]);
  });

  it("writes nothing when nothing changed", () => {
    const same = describeShiftChange(
      { items: [shift()] },
      { items: [shift()] },
      { date: "2026-10-19" },
    );
    expect(formatShiftChangePlain(same)).toEqual([]);
  });
});

describe("formatShiftChangeCompact", () => {
  it("writes the push line with an arrow (Mon)", () => {
    expect(formatShiftChangeCompact(monday)).toBe(
      "Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 3:00 PM (8 hrs) → Day Shift · Registered Nurse · Memory Care · 7:00 AM - 3:00 PM (8 hrs)",
    );
  });

  it("joins a whole day's items (Thu)", () => {
    expect(formatShiftChangeCompact(thursday)).toBe(
      "Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 3:00 PM (8 hrs) + Evening Shift · Registered Nurse · Skilled Nursing · 3:00 PM - 11:00 PM (8 hrs) → Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 12:00 PM (5 hrs) + Sick (part of day)",
    );
  });
});

describe("formatShiftChangeCompactSides", () => {
  it("keeps Before and After apart (Mon)", () => {
    expect(formatShiftChangeCompactSides(monday)).toEqual({
      before: "Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 3:00 PM (8 hrs)",
      after: "Day Shift · Registered Nurse · Memory Care · 7:00 AM - 3:00 PM (8 hrs)",
    });
  });

  it("has no Before for a day that had nothing", () => {
    const change = describeShiftChange({ items: [] }, { items: [shift()] }, { date: "2026-10-26" });
    expect(formatShiftChangeCompactSides(change)).toEqual({
      before: null,
      after: "Day Shift · Registered Nurse · Skilled Nursing · 7:00 AM - 3:00 PM (8 hrs)",
    });
  });
});
