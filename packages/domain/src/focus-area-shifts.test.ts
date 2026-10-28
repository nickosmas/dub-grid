import { describe, expect, it } from "vitest";
import {
  describeFocusAreaShiftsQuestion,
  FOCUS_AREA_SHIFTS_DECISION_CODE,
  focusAreaShiftsClearFailed,
  focusAreaShiftsRefusal,
  parseFocusAreaShiftsQuestion,
  removedFocusAreaIds,
  type FocusAreaUpcomingShifts,
} from "./focus-area-shifts";

const east: FocusAreaUpcomingShifts = {
  focusAreaId: 1,
  focusAreaName: "East Wing",
  count: 3,
  firstDate: "2026-11-03",
  lastDate: "2026-11-20",
};
const west: FocusAreaUpcomingShifts = {
  focusAreaId: 2,
  focusAreaName: "West Wing",
  count: 1,
  firstDate: "2026-11-01",
  lastDate: "2026-11-01",
};

describe("removedFocusAreaIds", () => {
  it("lists the focus areas the save takes away", () => {
    expect(removedFocusAreaIds([1, 2, 3], [3, 4])).toEqual([1, 2]);
    expect(removedFocusAreaIds([1], [1, 2])).toEqual([]);
    expect(removedFocusAreaIds([1, 1], [])).toEqual([1]);
  });
});

describe("describeFocusAreaShiftsQuestion", () => {
  it("names one focus area in the title and the date range in the message", () => {
    const question = describeFocusAreaShiftsQuestion("Barbara Trent", [east]);
    expect(question.title).toBe("Clear Barbara Trent's upcoming shifts in East Wing?");
    expect(question.message).toBe(
      "They have 3 upcoming shifts in East Wing, Tue, Nov 3 to Fri, Nov 20.",
    );
    expect(question.points).toEqual([
      "Cleared shifts come off in the draft and leave the schedule when it's published.",
      "Open requests for those shifts are closed.",
    ]);
    expect(question.clearLabel).toBe("Clear shifts");
    expect(question.keepLabel).toBe("Keep shifts");
  });

  it("reads one shift on its day", () => {
    expect(describeFocusAreaShiftsQuestion("Barbara Trent", [west]).message).toBe(
      "They have 1 upcoming shift in West Wing, on Sun, Nov 1.",
    );
  });

  it("lists several focus areas with one range across them", () => {
    const question = describeFocusAreaShiftsQuestion("Barbara Trent", [east, west]);
    expect(question.title).toBe("Clear Barbara Trent's upcoming shifts?");
    expect(question.message).toBe(
      "They have 3 upcoming shifts in East Wing and 1 in West Wing, Sun, Nov 1 to Fri, Nov 20.",
    );
  });
});

describe("describeFocusAreaShiftsQuestion for your own record", () => {
  it("speaks to you", () => {
    const question = describeFocusAreaShiftsQuestion("Barbara Trent", [east], { self: true });
    expect(question.title).toBe("Clear your upcoming shifts in East Wing?");
    expect(question.message).toBe(
      "You have 3 upcoming shifts in East Wing, Tue, Nov 3 to Fri, Nov 20.",
    );
  });
});

describe("refusal and failure copy", () => {
  it("totals the shifts and names every focus area", () => {
    expect(focusAreaShiftsRefusal([east])).toBe(
      "Choose whether to clear or keep their 3 upcoming shifts in East Wing.",
    );
    expect(focusAreaShiftsRefusal([east, west])).toBe(
      "Choose whether to clear or keep their 4 upcoming shifts in East Wing and West Wing.",
    );
    expect(focusAreaShiftsClearFailed([east])).toBe(
      "Saved, but their shifts in East Wing weren't cleared. Remove them on the schedule.",
    );
  });
});

describe("parseFocusAreaShiftsQuestion", () => {
  it("reads the focus areas from a refusal", () => {
    expect(
      parseFocusAreaShiftsQuestion({
        code: FOCUS_AREA_SHIFTS_DECISION_CODE,
        error: "Choose",
        focusAreaShifts: [east],
      }),
    ).toEqual([east]);
  });

  it("ignores any other body", () => {
    expect(parseFocusAreaShiftsQuestion(null)).toBeNull();
    expect(parseFocusAreaShiftsQuestion({ code: "EMPLOYEE_CONFLICT" })).toBeNull();
    expect(
      parseFocusAreaShiftsQuestion({ code: FOCUS_AREA_SHIFTS_DECISION_CODE, focusAreaShifts: [] }),
    ).toBeNull();
    expect(
      parseFocusAreaShiftsQuestion({
        code: FOCUS_AREA_SHIFTS_DECISION_CODE,
        focusAreaShifts: [{ ...east, count: "3" }],
      }),
    ).toBeNull();
  });
});
