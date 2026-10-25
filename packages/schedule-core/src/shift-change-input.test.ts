import type { ScheduleCellState } from "@dubgrid/contracts";
import { describe, expect, it } from "vitest";
import {
  cellStateToChangeDay,
  isSameCellState,
  selectOriginalCellChange,
  splitSegmentTimes,
  type ShiftChangeResolvers,
  type ShiftChangeSegmentDefinition,
} from "./shift-change-input";

const SKILLED_NURSING = 1;
const MEMORY_CARE = 2;

const definitions: Record<string, ShiftChangeSegmentDefinition> = {
  "1:10": {
    shiftName: "Day Shift",
    jobName: "Registered Nurse",
    focusAreaId: SKILLED_NURSING,
    defaultStart: "07:00",
    defaultEnd: "15:00",
  },
  "2:10": {
    shiftName: "Evening Shift",
    jobName: "Registered Nurse",
    focusAreaId: SKILLED_NURSING,
    defaultStart: "15:00",
    defaultEnd: "23:00",
  },
  "3:10": {
    shiftName: "Night Shift",
    jobName: "Registered Nurse",
    focusAreaId: null,
    defaultStart: "23:00",
    defaultEnd: "07:00",
  },
  "null:20": {
    shiftName: null,
    jobName: "Charge Nurse",
    focusAreaId: null,
    defaultStart: null,
    defaultEnd: null,
  },
};

const resolvers: ShiftChangeResolvers = {
  segment: (shiftId, jobId) => definitions[`${shiftId ?? "null"}:${jobId}`] ?? null,
  absenceType: (id) => (id === 4 ? { name: "Sick" } : id === 3 ? { name: "Vacation" } : null),
  focusArea: (id) =>
    id === SKILLED_NURSING ? "Skilled Nursing" : id === MEMORY_CARE ? "Memory Care" : null,
};

function worked(overrides: Partial<ScheduleCellState> = {}): ScheduleCellState {
  return {
    kind: "worked",
    segments: [{ shiftId: 1, jobId: 10, position: 0 }],
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    seriesId: null,
    fromRecurring: false,
    ...overrides,
  };
}

const double = (overrides: Partial<ScheduleCellState> = {}) =>
  worked({
    segments: [
      { shiftId: 1, jobId: 10, position: 0 },
      { shiftId: 2, jobId: 10, position: 1 },
    ],
    ...overrides,
  });

function times(state: ScheduleCellState) {
  return cellStateToChangeDay(state, resolvers).items.map((item) =>
    item.kind === "shift" ? `${item.start}-${item.end}` : item.name,
  );
}

describe("splitSegmentTimes", () => {
  it("keeps empty parts in their segment's place", () => {
    expect(splitSegmentTimes("07:00|15:00")).toEqual(["07:00", "15:00"]);
    expect(splitSegmentTimes("|12:00")).toEqual([null, "12:00"]);
    expect(splitSegmentTimes("07:00:00")).toEqual(["07:00"]);
    expect(splitSegmentTimes(null)).toEqual([]);
    expect(splitSegmentTimes('"07:00"|bad')).toEqual([null, null]);
  });
});

describe("cellStateToChangeDay", () => {
  it("reads each segment's custom times, falling back to the definition", () => {
    expect(times(double({ customStartTime: "06:00|15:00", customEndTime: "14:00|23:00" }))).toEqual(
      ["06:00-14:00", "15:00-23:00"],
    );
    expect(times(double({ customEndTime: "|12:00" }))).toEqual(["07:00-15:00", "15:00-12:00"]);
  });

  it("reads Worked until on the last segment, with a rest-of-day absence", () => {
    const day = cellStateToChangeDay(
      worked({ customEndTime: "12:00", absenceTypeId: 4 }),
      resolvers,
    );
    expect(day.items).toEqual([
      expect.objectContaining({
        kind: "shift",
        shiftName: "Day Shift",
        start: "07:00",
        end: "12:00",
      }),
      { kind: "absence", key: "absence:4", name: "Sick", archived: undefined, scope: "restOfDay" },
    ]);
  });

  it("orders segments by position", () => {
    const day = cellStateToChangeDay(
      double({
        segments: [
          { shiftId: 2, jobId: 10, position: 1 },
          { shiftId: 1, jobId: 10, position: 0 },
        ],
      }),
      resolvers,
    );
    expect(day.items.map((item) => item.key)).toEqual(["1:10", "2:10"]);
  });

  it("reads a whole-day absence, and nothing for a deleted or missing cell", () => {
    const absence = worked({ kind: "absence", segments: [], absenceTypeId: 3 });
    expect(cellStateToChangeDay(absence, resolvers).items).toEqual([
      { kind: "absence", key: "absence:3", name: "Vacation", archived: undefined, scope: "allDay" },
    ]);
    expect(
      cellStateToChangeDay(worked({ kind: "deleted", segments: [] }), resolvers).items,
    ).toEqual([]);
    expect(cellStateToChangeDay(null, resolvers).items).toEqual([]);
  });

  it("uses the definition's focus area, then the cell's, and none for a shiftless job", () => {
    const home = cellStateToChangeDay(worked({ focusAreaId: MEMORY_CARE }), resolvers).items[0];
    const fallback = cellStateToChangeDay(
      worked({ segments: [{ shiftId: 3, jobId: 10, position: 0 }], focusAreaId: MEMORY_CARE }),
      resolvers,
    ).items[0];
    const shiftless = cellStateToChangeDay(
      worked({ segments: [{ shiftId: null, jobId: 20, position: 0 }], focusAreaId: MEMORY_CARE }),
      resolvers,
    ).items[0];
    expect(home).toMatchObject({ focusAreaName: "Skilled Nursing" });
    expect(fallback).toMatchObject({ focusAreaName: "Memory Care" });
    expect(shiftless).toMatchObject({
      shiftName: null,
      jobName: "Charge Nurse",
      focusAreaName: null,
    });
  });

  it("shows the job alone when a definition gives no shift name", () => {
    const local: ShiftChangeResolvers = {
      ...resolvers,
      segment: () => ({
        shiftName: null,
        jobName: "Day Shift",
        focusAreaId: SKILLED_NURSING,
        defaultStart: "07:00",
        defaultEnd: "15:00",
      }),
    };
    expect(cellStateToChangeDay(worked(), local).items[0]).toMatchObject({
      shiftName: null,
      jobName: "Day Shift",
      focusAreaName: "Skilled Nursing",
    });
  });

  it("never shows a question mark for a definition it cannot find", () => {
    const day = cellStateToChangeDay(
      worked({ segments: [{ shiftId: 99, jobId: 98, position: 0 }], absenceTypeId: 97 }),
      resolvers,
    );
    expect(day.items).toEqual([
      expect.objectContaining({ shiftName: "Unknown shift", jobName: "Unknown job", start: null }),
      expect.objectContaining({ name: "Unknown absence" }),
    ]);
  });
});

describe("cellStateToChangeDay, an absence's own time (item 50)", () => {
  it("carries the time it covers", () => {
    const day = cellStateToChangeDay(
      worked({ absenceTypeId: 4, absenceStartTime: "11:00", absenceEndTime: "15:00" }),
      resolvers,
    );
    expect(day.items.at(-1)).toMatchObject({ kind: "absence", start: "11:00", end: "15:00" });
  });

  it("leaves an untimed absence without times", () => {
    const day = cellStateToChangeDay(worked({ absenceTypeId: 4 }), resolvers);
    expect(day.items.at(-1)).not.toHaveProperty("start");
  });
});

describe("isSameCellState", () => {
  it("ignores segment order, mentoring, and how empty times are stored", () => {
    const left = double({ customEndTime: "|" });
    const right = double({
      segments: [
        { shiftId: 2, jobId: 10, position: 1, isMentored: true },
        { shiftId: 1, jobId: 10, position: 0 },
      ],
    });
    expect(isSameCellState(left, right)).toBe(true);
  });

  it("treats deleted and missing as the same empty cell", () => {
    expect(isSameCellState(null, worked({ kind: "deleted", segments: [] }))).toBe(true);
    expect(isSameCellState(null, worked())).toBe(false);
  });

  it("notices a different time, absence or focus area", () => {
    expect(isSameCellState(worked(), worked({ customEndTime: "12:00" }))).toBe(false);
    expect(isSameCellState(worked(), worked({ absenceTypeId: 4 }))).toBe(false);
    expect(
      isSameCellState(
        worked({ absenceTypeId: 4, absenceStartTime: "11:00", absenceEndTime: "15:00" }),
        worked({ absenceTypeId: 4, absenceStartTime: "12:00", absenceEndTime: "15:00" }),
      ),
    ).toBe(false);
    expect(isSameCellState(worked(), worked({ focusAreaId: MEMORY_CARE }))).toBe(false);
  });
});

describe("selectOriginalCellChange", () => {
  const day = worked();
  const evening = worked({ segments: [{ shiftId: 2, jobId: 10, position: 0 }] });
  const night = worked({ segments: [{ shiftId: 3, jobId: 10, position: 0 }] });
  const deleted = worked({ kind: "deleted", segments: [] });

  it("compares the earliest before with the latest after", () => {
    expect(
      selectOriginalCellChange([
        { fromState: day, toState: evening },
        { fromState: evening, toState: night },
      ]),
    ).toEqual({ fromState: day, toState: night });
  });

  it("is null when the cell went back to its original", () => {
    expect(
      selectOriginalCellChange([
        { fromState: day, toState: evening },
        { fromState: evening, toState: day },
      ]),
    ).toBeNull();
  });

  it("is null when a shift was added and removed in the same window", () => {
    expect(
      selectOriginalCellChange([
        { fromState: null, toState: day },
        { fromState: day, toState: deleted },
      ]),
    ).toBeNull();
  });

  it("keeps a removal after a change as original to removed", () => {
    expect(
      selectOriginalCellChange([
        { fromState: day, toState: evening },
        { fromState: evening, toState: deleted },
      ]),
    ).toEqual({ fromState: day, toState: deleted });
  });

  it("passes a single publish through, and is null with no changes", () => {
    expect(selectOriginalCellChange([{ fromState: day, toState: night }])).toEqual({
      fromState: day,
      toState: night,
    });
    expect(selectOriginalCellChange([])).toBeNull();
  });
});
