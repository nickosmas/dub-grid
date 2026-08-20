import { describe, expect, it } from "vitest";
import type { MobileOpenShift } from "@dubgrid/contracts";
import {
  getOpenShiftAbsenceTypeId,
  getOpenShiftFocusAreaName,
  getOpenShiftTimeRange,
} from "./openShiftPresentation";

function makeOpenShift(overrides: {
  presentation?: Partial<MobileOpenShift["presentation"]>;
  state?: Partial<MobileOpenShift["state"]>;
  focusAreaName?: string | null;
}): MobileOpenShift {
  return {
    presentation: {
      segments: [],
      label: "Open Shift",
      shiftName: null,
      displayFocusAreaName: null,
      startTime: null,
      endTime: null,
      ...overrides.presentation,
    },
    state: {
      kind: "coverage",
      customStartTime: null,
      customEndTime: null,
      ...overrides.state,
    },
    focusAreaName: overrides.focusAreaName ?? null,
  } as unknown as MobileOpenShift;
}

describe("open shift presentation", () => {
  describe("getOpenShiftTimeRange", () => {
    it("prefers the first segment that carries both times", () => {
      const openShift = makeOpenShift({
        presentation: {
          segments: [
            { startTime: null, endTime: null },
            { startTime: "07:00:00", endTime: "15:00:00" },
          ] as MobileOpenShift["presentation"]["segments"],
          startTime: "09:00:00",
          endTime: "17:00:00",
        },
      });

      expect(getOpenShiftTimeRange(openShift)).toBe("7:00 AM - 3:00 PM");
    });

    it("falls back to the presentation times when no segment has them", () => {
      const openShift = makeOpenShift({
        presentation: { startTime: "09:00:00", endTime: "17:00:00" },
      });

      expect(getOpenShiftTimeRange(openShift)).toBe("9:00 AM - 5:00 PM");
    });

    // The Schedule tab used to return null here while the Requests tab showed a
    // range, so the same open shift rendered differently on each tab.
    it("falls back to the shift's custom times", () => {
      const openShift = makeOpenShift({
        state: { customStartTime: "11:00:00", customEndTime: "19:00:00" },
      });

      expect(getOpenShiftTimeRange(openShift)).toBe("11:00 AM - 7:00 PM");
    });

    it("returns null when the shift carries no times at all", () => {
      expect(getOpenShiftTimeRange(makeOpenShift({}))).toBeNull();
    });
  });

  describe("getOpenShiftFocusAreaName", () => {
    it("prefers a segment's display name over the shift-level ones", () => {
      const openShift = makeOpenShift({
        presentation: {
          segments: [
            { displayFocusAreaName: "ICU" },
          ] as MobileOpenShift["presentation"]["segments"],
          displayFocusAreaName: "Ward",
        },
        focusAreaName: "Fallback",
      });

      expect(getOpenShiftFocusAreaName(openShift)).toBe("ICU");
    });

    it("falls back to the shift's own focus area name", () => {
      expect(getOpenShiftFocusAreaName(makeOpenShift({ focusAreaName: "Fallback" }))).toBe(
        "Fallback",
      );
    });
  });

  describe("getOpenShiftAbsenceTypeId", () => {
    it("returns the absence type only for absence-backed vacancies", () => {
      expect(
        getOpenShiftAbsenceTypeId(
          makeOpenShift({ state: { kind: "absence", absenceTypeId: 4 } as never }),
        ),
      ).toBe(4);
      expect(getOpenShiftAbsenceTypeId(makeOpenShift({}))).toBeNull();
    });
  });
});
