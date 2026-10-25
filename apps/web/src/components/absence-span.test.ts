import { describe, expect, it } from "vitest";

import {
  absenceBaseFromCell,
  absenceSideOf,
  clockSpanMinutes,
  planAbsenceCell,
  planAbsenceSpan,
} from "./absence-span";

const DAY = { start: "07:00", end: "15:00" };
const EVENING = { start: "15:00", end: "23:00" };
const NIGHT = { start: "23:00", end: "07:00" };

describe("planAbsenceSpan, left early", () => {
  it("cuts the one shift and covers the rest of it", () => {
    expect(planAbsenceSpan({ shifts: [DAY], side: "left-early", at: "11:00" })).toEqual({
      problem: null,
      cutIndex: 0,
      keptIndexes: [0],
      removedIndexes: [],
      absence: { start: "11:00", end: "15:00" },
    });
  });

  it("takes off a later shift that wasn't worked and covers it too", () => {
    expect(planAbsenceSpan({ shifts: [DAY, EVENING], side: "left-early", at: "13:00" })).toEqual({
      problem: null,
      cutIndex: 0,
      keptIndexes: [0],
      removedIndexes: [1],
      absence: { start: "13:00", end: "23:00" },
    });
  });

  it("keeps both shifts when the time falls in the second", () => {
    const plan = planAbsenceSpan({ shifts: [DAY, EVENING], side: "left-early", at: "19:00" });
    expect(plan.keptIndexes).toEqual([0, 1]);
    expect(plan.cutIndex).toBe(1);
    expect(plan.absence).toEqual({ start: "19:00", end: "23:00" });
  });

  it("on the boundary keeps the first whole and covers the second", () => {
    const plan = planAbsenceSpan({ shifts: [DAY, EVENING], side: "left-early", at: "15:00" });
    expect(plan).toMatchObject({ cutIndex: null, keptIndexes: [0], removedIndexes: [1] });
    expect(plan.absence).toEqual({ start: "15:00", end: "23:00" });
  });

  it("between two shifts covers the second from its start", () => {
    const plan = planAbsenceSpan({
      shifts: [DAY, { start: "16:00", end: "20:00" }],
      side: "left-early",
      at: "15:30",
    });
    expect(plan.removedIndexes).toEqual([1]);
    expect(plan.absence).toEqual({ start: "16:00", end: "20:00" });
  });

  it("names a time at the start, at the end, past it, or none", () => {
    const at = (time: string | null) =>
      planAbsenceSpan({ shifts: [DAY], side: "left-early", at: time }).problem;
    expect(at("07:00")).toBe("never-started");
    expect(at("15:00")).toBe("no-time-covered");
    expect(at("16:00")).toBe("outside-shift");
    expect(at("06:45")).toBe("outside-shift");
    expect(at(null)).toBe("unset");
  });

  it("follows an overnight shift past midnight", () => {
    const plan = planAbsenceSpan({ shifts: [NIGHT], side: "left-early", at: "03:00" });
    expect(plan.absence).toEqual({ start: "03:00", end: "07:00" });
    expect(planAbsenceSpan({ shifts: [NIGHT], side: "left-early", at: "08:00" }).problem).toBe(
      "outside-shift",
    );
  });

  it("keeps a stored end that reaches past the shifts", () => {
    const plan = planAbsenceSpan({
      shifts: [DAY],
      side: "left-early",
      at: "13:00",
      extendTo: "23:00",
    });
    expect(plan.absence).toEqual({ start: "13:00", end: "23:00" });
  });
});

describe("planAbsenceSpan, arrived late", () => {
  it("starts the shift late and covers its start", () => {
    expect(planAbsenceSpan({ shifts: [DAY], side: "arrived-late", at: "11:00" })).toEqual({
      problem: null,
      cutIndex: 0,
      keptIndexes: [0],
      removedIndexes: [],
      absence: { start: "07:00", end: "11:00" },
    });
  });

  it("takes off an earlier shift that wasn't worked", () => {
    const plan = planAbsenceSpan({ shifts: [DAY, EVENING], side: "arrived-late", at: "17:00" });
    expect(plan).toMatchObject({ cutIndex: 1, keptIndexes: [1], removedIndexes: [0] });
    expect(plan.absence).toEqual({ start: "07:00", end: "17:00" });
  });

  it("on the boundary covers the first shift whole", () => {
    const plan = planAbsenceSpan({ shifts: [DAY, EVENING], side: "arrived-late", at: "15:00" });
    expect(plan).toMatchObject({ cutIndex: null, keptIndexes: [1], removedIndexes: [0] });
    expect(plan.absence).toEqual({ start: "07:00", end: "15:00" });
  });

  it("names the mirror problems", () => {
    const at = (time: string) =>
      planAbsenceSpan({ shifts: [DAY], side: "arrived-late", at: time }).problem;
    expect(at("15:00")).toBe("never-started");
    expect(at("07:00")).toBe("no-time-covered");
    expect(at("16:00")).toBe("outside-shift");
  });

  it("keeps a stored start that reaches before the shifts", () => {
    const plan = planAbsenceSpan({
      shifts: [EVENING],
      side: "arrived-late",
      at: "17:00",
      extendTo: "07:00",
    });
    expect(plan.absence).toEqual({ start: "07:00", end: "17:00" });
  });
});

describe("absenceSideOf", () => {
  it("reads an absence ending where (or before) the work starts as arrived late", () => {
    expect(absenceSideOf({ start: "07:00", end: "11:00" }, { start: "11:00", end: "15:00" })).toBe(
      "arrived-late",
    );
    expect(absenceSideOf({ start: "07:00", end: "15:00" }, { start: "16:00", end: "23:00" })).toBe(
      "arrived-late",
    );
  });

  it("reads one starting in or after the work, or none, as left early", () => {
    const day = { start: "07:00", end: "15:00" };
    expect(absenceSideOf({ start: "11:00", end: "15:00" }, day)).toBe("left-early");
    expect(absenceSideOf({ start: "15:00", end: "23:00" }, day)).toBe("left-early");
    expect(absenceSideOf({ start: "16:00", end: "20:00" }, day)).toBe("left-early");
    expect(absenceSideOf({ start: "19:00", end: "23:00" }, { start: "07:00", end: "19:00" })).toBe(
      "left-early",
    );
    expect(absenceSideOf({ start: "03:00", end: "07:00" }, { start: "23:00", end: "03:00" })).toBe(
      "left-early",
    );
    expect(absenceSideOf(null, day)).toBe("left-early");
  });
});

describe("clockSpanMinutes", () => {
  it("measures across midnight", () => {
    expect(clockSpanMinutes({ start: "23:00", end: "07:00" })).toBe(480);
    expect(clockSpanMinutes(DAY)).toBe(480);
  });
});

describe("absenceBaseFromCell and planAbsenceCell", () => {
  const shift = (
    scheduled: { start: string; end: string },
    customStart = null as string | null,
    customEnd = null as string | null,
  ) => ({
    scheduled,
    customStart,
    customEnd,
  });

  it("puts a left-early cut back to its scheduled end and finds the time", () => {
    const { base, at } = absenceBaseFromCell({
      shifts: [shift(DAY, "07:00", "11:00")],
      side: "left-early",
      absence: { start: "11:00", end: "15:00" },
    });
    expect(at).toBe("11:00");
    expect(base).toEqual({ shifts: [shift(DAY)], extendTo: null });
  });

  it("keeps a stored end that covered a shift taken off earlier", () => {
    const { base, at } = absenceBaseFromCell({
      shifts: [shift(DAY, "07:00", "13:00")],
      side: "left-early",
      absence: { start: "13:00", end: "23:00" },
    });
    expect(base.extendTo).toBe("23:00");
    expect(planAbsenceCell(base, "left-early", at).plan.absence).toEqual({
      start: "13:00",
      end: "23:00",
    });
  });

  it("reads an untimed absence's time from the last shift's custom end", () => {
    const { base, at } = absenceBaseFromCell({
      shifts: [shift(DAY, "07:00", "11:00")],
      side: "left-early",
      absence: null,
    });
    expect(at).toBe("11:00");
    expect(base.shifts[0]).toEqual(shift(DAY));
  });

  it("puts an arrived-late cut back and keeps an earlier stored start", () => {
    const { base, at } = absenceBaseFromCell({
      shifts: [shift(EVENING, "17:00", "23:00")],
      side: "arrived-late",
      absence: { start: "07:00", end: "17:00" },
    });
    expect(at).toBe("17:00");
    expect(base).toEqual({ shifts: [shift(EVENING)], extendTo: "07:00" });
  });

  it("cuts the shift, keeps a custom start, and drops a shift that wasn't worked", () => {
    const cell = planAbsenceCell(
      { shifts: [shift(DAY, "07:30", "15:00"), shift(EVENING)], extendTo: null },
      "left-early",
      "13:00",
    );
    expect(cell.kept).toEqual([{ index: 0, customStart: "07:30", customEnd: "13:00" }]);
    expect(cell.plan.absence).toEqual({ start: "13:00", end: "23:00" });
  });

  it("starts an arrived-late shift at the time and keeps its end", () => {
    const cell = planAbsenceCell({ shifts: [shift(DAY)], extendTo: null }, "arrived-late", "11:00");
    expect(cell.kept).toEqual([{ index: 0, customStart: "11:00", customEnd: "15:00" }]);
  });

  it("has no kept shifts while the time can't stand", () => {
    expect(
      planAbsenceCell({ shifts: [shift(DAY)], extendTo: null }, "left-early", "15:00").kept,
    ).toBeNull();
  });
});
