import { describe, expect, it } from "vitest";

import {
  layoutAbsencePill,
  layoutEntryAbsence,
  overnightShortRange,
  withoutAbsenceBesideShifts,
} from "./absence-pill";

const THURSDAY = new Date(2026, 9, 22);

describe("layoutAbsencePill", () => {
  it("puts a left-early absence after the shift, joined, with its span", () => {
    expect(
      layoutAbsencePill({
        date: THURSDAY,
        shifts: [{ start: "07:00", end: "11:00" }],
        absence: { start: "11:00", end: "15:00" },
      }),
    ).toEqual({
      first: false,
      joinsShift: true,
      shortTime: "11 - 3",
      time: "11:00 AM - 3:00 PM",
    });
  });

  it("puts an arrived-late absence first", () => {
    const layout = layoutAbsencePill({
      date: THURSDAY,
      shifts: [{ start: "11:00", end: "15:00" }],
      absence: { start: "07:00", end: "11:00" },
    });
    expect(layout).toMatchObject({ first: true, joinsShift: true, shortTime: "7 - 11" });
  });

  it("names the next day on a time past midnight", () => {
    const layout = layoutAbsencePill({
      date: THURSDAY,
      shifts: [{ start: "23:00", end: "03:00" }],
      absence: { start: "03:00", end: "07:00" },
    });
    expect(layout.shortTime).toBe("Fri 3 - 7");
    expect(layout.time).toBe("Fri 3:00 AM - 7:00 AM");
  });

  it("names the next day on an end past midnight", () => {
    const layout = layoutAbsencePill({
      date: THURSDAY,
      shifts: [{ start: "07:00", end: "13:00" }],
      absence: { start: "13:00", end: "01:00" },
    });
    expect(layout.time).toBe("1:00 PM - Fri 1:00 AM");
  });

  it("keeps a gap when the absence covers a later shift's time", () => {
    const layout = layoutAbsencePill({
      date: THURSDAY,
      shifts: [{ start: "07:00", end: "15:00" }],
      absence: { start: "16:00", end: "20:00" },
    });
    expect(layout.joinsShift).toBe(false);
  });

  it("reads an untimed absence as before: last and joined, with no time", () => {
    expect(
      layoutAbsencePill({
        date: THURSDAY,
        shifts: [{ start: "07:00", end: "11:00" }],
        absence: null,
      }),
    ).toEqual({ first: false, joinsShift: true, shortTime: null, time: null });
  });
});

describe("overnightShortRange", () => {
  it("names the next day on an overnight end", () => {
    expect(overnightShortRange(THURSDAY, { start: "23:00", end: "03:00" })).toBe("11 - Fri 3");
    expect(overnightShortRange(THURSDAY, { start: "07:00", end: "11:00" })).toBe("7 - 11");
  });
});

describe("layoutEntryAbsence", () => {
  const day = { startTime: "07:00:00", endTime: "15:00:00" };

  it("reads each shift's custom time over its default", () => {
    expect(
      layoutEntryAbsence(
        {
          segments: [day],
          customStartTime: "11:00",
          customEndTime: "15:00",
          absenceStartTime: "07:00",
          absenceEndTime: "11:00",
        },
        THURSDAY,
      ),
    ).toMatchObject({ first: true, joinsShift: true, shortTime: "7 - 11" });
  });

  it("reads pipe-joined times for two shifts", () => {
    const layout = layoutEntryAbsence(
      {
        segments: [day, { startTime: "15:00", endTime: "23:00" }],
        customStartTime: "|15:00",
        customEndTime: "|19:00",
        absenceStartTime: "19:00",
        absenceEndTime: "23:00",
      },
      THURSDAY,
    );
    expect(layout).toMatchObject({ first: false, joinsShift: true, shortTime: "7 - 11" });
  });

  it("leaves the absence untimed beside a shift with no time", () => {
    expect(
      layoutEntryAbsence(
        { segments: [{ startTime: null }], absenceStartTime: "11:00", absenceEndTime: "15:00" },
        THURSDAY,
      ),
    ).toEqual({ first: false, joinsShift: true, shortTime: null, time: null });
  });
});

describe("withoutAbsenceBesideShifts (item 50g)", () => {
  const worked = {
    kind: "worked" as const,
    segments: [{ shiftId: 1, jobId: 2, position: 0, isMentored: false }],
    seriesId: null,
    fromRecurring: false,
  };
  const day = [{ startTime: "07:00:00", endTime: "15:00:00" }];

  it("drops a left-early absence and puts the shift back to its scheduled end", () => {
    expect(
      withoutAbsenceBesideShifts(
        {
          ...worked,
          absenceTypeId: 4,
          customStartTime: "07:00",
          customEndTime: "11:00",
          absenceStartTime: "11:00",
          absenceEndTime: "15:00",
        },
        day,
      ),
    ).toMatchObject({ absenceTypeId: null, customStartTime: null, customEndTime: null });
  });

  it("drops an arrived-late absence and puts the shift back to its scheduled start", () => {
    expect(
      withoutAbsenceBesideShifts(
        {
          ...worked,
          absenceTypeId: 4,
          customStartTime: "11:00",
          customEndTime: "15:00",
          absenceStartTime: "07:00",
          absenceEndTime: "11:00",
        },
        day,
      ),
    ).toMatchObject({ absenceTypeId: null, customStartTime: null, customEndTime: null });
  });

  it("leaves a cell without an absence alone", () => {
    const input = { ...worked, absenceTypeId: null, customStartTime: null, customEndTime: null };
    expect(withoutAbsenceBesideShifts(input, day)).toBe(input);
  });
});
