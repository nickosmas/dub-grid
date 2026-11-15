import { describe, expect, it } from "vitest";
import { buildRowAbsenceRuns, type AbsenceRunReads } from "./absenceRuns";

const dates = [16, 17, 18].map((day) => new Date(2026, 10, day));
const OFF = 4;

function reads(overrides: Partial<AbsenceRunReads> = {}): AbsenceRunReads {
  return {
    shiftForKey: () => "Off",
    absenceTypeIdForKey: () => OFF,
    segmentsForKey: () => [],
    hasAbsenceType: (id) => id === OFF,
    ...overrides,
  };
}

describe("buildRowAbsenceRuns", () => {
  it("joins plain whole-day absences on days in a row", () => {
    const runs = buildRowAbsenceRuns("thomas", dates, reads());
    expect(runs.days[0]).toMatchObject({ start: 0, length: 3 });
  });

  it("keeps a day a waiting request touches on its own pill, for the fold", () => {
    const runs = buildRowAbsenceRuns(
      "thomas",
      dates,
      reads({
        activeRequestForKey: (_empId, date) =>
          date.getDate() === 17 ? { waitingOn: "teammate" } : null,
      }),
    );
    expect(runs.days[1]).toBeNull();
  });
});
