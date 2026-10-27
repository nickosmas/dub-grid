import { describe, expect, it } from "vitest";
import { buildAbsenceRuns, formatAbsenceRunLabel, type AbsenceRunInputDay } from "./absence-runs";

const VACATION = 1;
const SICK = 2;

function absent(absenceTypeId: number): AbsenceRunInputDay {
  return { absenceTypeId, hasShift: false, changed: false };
}
const empty: AbsenceRunInputDay = {
  absenceTypeId: null,
  hasShift: false,
  changed: false,
};
const worked: AbsenceRunInputDay = {
  absenceTypeId: null,
  hasShift: true,
  changed: false,
};

describe("buildAbsenceRuns", () => {
  it("leaves single absence days alone", () => {
    const { days, runs } = buildAbsenceRuns([absent(VACATION), empty, absent(VACATION)]);
    expect(runs).toEqual([]);
    expect(days).toEqual([null, null, null]);
  });

  it("groups days in a row with the same absence", () => {
    const { days, runs } = buildAbsenceRuns([
      empty,
      absent(VACATION),
      absent(VACATION),
      absent(VACATION),
      absent(VACATION),
      empty,
    ]);
    expect(runs).toEqual([{ absenceTypeId: VACATION, start: 1, length: 4 }]);
    expect(days.map((day) => day?.position ?? null)).toEqual([
      null,
      "start",
      "middle",
      "middle",
      "end",
      null,
    ]);
    expect(days[3]).toEqual({
      runIndex: 0,
      start: 1,
      length: 4,
      position: "middle",
    });
  });

  it("breaks a run at a different absence", () => {
    const { runs } = buildAbsenceRuns([
      absent(VACATION),
      absent(VACATION),
      absent(SICK),
      absent(SICK),
      absent(VACATION),
    ]);
    expect(runs).toEqual([
      { absenceTypeId: VACATION, start: 0, length: 2 },
      { absenceTypeId: SICK, start: 2, length: 2 },
    ]);
  });

  it("breaks a run at a shift", () => {
    const { runs } = buildAbsenceRuns([
      absent(VACATION),
      worked,
      absent(VACATION),
      absent(VACATION),
    ]);
    expect(runs).toEqual([{ absenceTypeId: VACATION, start: 2, length: 2 }]);
  });

  it("breaks a run at a rest-of-day absence, which has a shift", () => {
    const { runs } = buildAbsenceRuns([
      absent(VACATION),
      { absenceTypeId: VACATION, hasShift: true, changed: false },
      absent(VACATION),
    ]);
    expect(runs).toEqual([]);
  });

  it("breaks a run at a draft change", () => {
    const { days, runs } = buildAbsenceRuns([
      absent(VACATION),
      absent(VACATION),
      { absenceTypeId: VACATION, hasShift: false, changed: true },
      absent(VACATION),
    ]);
    expect(runs).toEqual([{ absenceTypeId: VACATION, start: 0, length: 2 }]);
    expect(days[2]).toBeNull();
    expect(days[3]).toBeNull();
  });

  it("never crosses the week split", () => {
    const fortnight = Array.from({ length: 14 }, () => absent(VACATION));
    const { days, runs } = buildAbsenceRuns(fortnight, { splitAt: 7 });
    expect(runs).toEqual([
      { absenceTypeId: VACATION, start: 0, length: 7 },
      { absenceTypeId: VACATION, start: 7, length: 7 },
    ]);
    expect(days[6]?.position).toBe("end");
    expect(days[7]?.position).toBe("start");
  });

  it("leaves a lone day on each side of the split", () => {
    const row = Array.from({ length: 14 }, () => empty);
    row[6] = absent(VACATION);
    row[7] = absent(VACATION);
    expect(buildAbsenceRuns(row, { splitAt: 7 }).runs).toEqual([]);
  });

  it("finds two runs in one week", () => {
    const { days, runs } = buildAbsenceRuns([
      absent(VACATION),
      absent(VACATION),
      empty,
      absent(SICK),
      absent(SICK),
      absent(SICK),
      empty,
    ]);
    expect(runs).toEqual([
      { absenceTypeId: VACATION, start: 0, length: 2 },
      { absenceTypeId: SICK, start: 3, length: 3 },
    ]);
    expect(days[4]?.runIndex).toBe(1);
  });
});

describe("formatAbsenceRunLabel", () => {
  it("shows just the name for one day", () => {
    expect(formatAbsenceRunLabel("Vacation", 1)).toBe("Vacation");
  });

  it("adds the count for a run without pluralizing", () => {
    expect(formatAbsenceRunLabel("Vacation", 4)).toBe("Vacation ×4");
    expect(formatAbsenceRunLabel("Off Day", 2)).toBe("Off Day ×2");
  });
});
