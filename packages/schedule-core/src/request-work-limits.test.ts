import { describe, expect, it } from "vitest";
import type { ScheduleCellState } from "@dubgrid/contracts";
import {
  describeApprovalWorkLimits,
  describeWorkLimit,
  requestDayChanges,
  requestWorkLimitBreaks,
  type DayWork,
  type RequestWorkLimitSubject,
} from "./request-work-limits";

const shift = (count = 1): ScheduleCellState => ({
  kind: "worked",
  segments: Array.from({ length: count }, (_, position) => ({
    shiftId: 1,
    jobId: 10,
    position,
  })) as ScheduleCellState["segments"],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
});
const hoursOf = (state: ScheduleCellState) => state.segments.length * 8;

/** Published days: each listed date is one 8-hour shift. */
const publishedOn =
  (byPerson: Record<string, string[]>) =>
  (employeeId: string, dateKey: string): DayWork =>
    byPerson[employeeId]?.includes(dateKey) ? { shifts: 1, hours: 8 } : { shifts: 0, hours: 0 };

// Ana works Tuesday, Nov 24 to Saturday, Nov 28.
const anaWeek = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];

const pickup = (overrides: Partial<RequestWorkLimitSubject> = {}): RequestWorkLimitSubject => ({
  type: "pickup",
  requesterEmpId: "ben",
  requesterShiftDate: "2026-11-29",
  requesterState: shift(),
  targetEmpId: "ana",
  targetShiftDate: null,
  ...overrides,
});

describe("requestDayChanges", () => {
  it("gives a pickup's shift to the person picking it up", () => {
    expect(requestDayChanges(pickup(), hoursOf)).toEqual([
      { employeeId: "ana", dateKey: "2026-11-29", shifts: 1, hours: 8 },
      { employeeId: "ben", dateKey: "2026-11-29", shifts: -1, hours: -8 },
    ]);
  });

  it("gives an open shift to its volunteer", () => {
    expect(requestDayChanges(pickup({ targetEmpId: null }), hoursOf)).toEqual([
      { employeeId: "ben", dateKey: "2026-11-29", shifts: 1, hours: 8 },
    ]);
  });

  it("trades a swap's shifts across their days", () => {
    const swap = pickup({
      type: "swap",
      targetShiftDate: "2026-11-30",
      targetState: shift(),
    });
    expect(requestDayChanges(swap, hoursOf)).toEqual([
      { employeeId: "ben", dateKey: "2026-11-30", shifts: 1, hours: 8 },
      { employeeId: "ben", dateKey: "2026-11-29", shifts: -1, hours: -8 },
      { employeeId: "ana", dateKey: "2026-11-29", shifts: 1, hours: 8 },
      { employeeId: "ana", dateKey: "2026-11-30", shifts: -1, hours: -8 },
    ]);
  });

  it("gives nobody a shift for a call-off", () => {
    expect(requestDayChanges(pickup({ type: "calloff", targetEmpId: null }), hoursOf)).toEqual([]);
  });
});

describe("requestWorkLimitBreaks", () => {
  it("names a sixth day in a row the pickup gives, across the week's end", () => {
    const changes = requestDayChanges(pickup(), hoursOf);
    expect(requestWorkLimitBreaks({ changes, published: publishedOn({ ana: anaWeek }) })).toEqual([
      {
        employeeId: "ana",
        breaks: [{ limit: "row", days: 6, start: "2026-11-24", end: "2026-11-29" }],
      },
    ]);
  });

  it("names nothing at five days, and never for the person giving the shift up", () => {
    const changes = requestDayChanges(pickup(), hoursOf);
    expect(
      requestWorkLimitBreaks({
        changes,
        published: publishedOn({ ana: anaWeek.slice(1), ben: anaWeek }),
      }),
    ).toEqual([]);
  });

  it("counts a swap on one day as the same days, with the new shift's hours", () => {
    const swap = pickup({
      type: "swap",
      requesterState: shift(2),
      targetShiftDate: "2026-11-28",
      requesterShiftDate: "2026-11-28",
      targetState: shift(),
    });
    // Ana keeps five days; her Saturday becomes two shifts, 48 hours that week.
    expect(
      requestWorkLimitBreaks({
        changes: requestDayChanges(swap, hoursOf),
        published: publishedOn({ ana: anaWeek, ben: ["2026-11-28"] }),
      }),
    ).toEqual([
      {
        employeeId: "ana",
        breaks: [{ limit: "hours", hours: 48, start: "2026-11-22", end: "2026-11-28" }],
      },
    ]);
  });

  it("names a sixth day in the week", () => {
    const changes = requestDayChanges(pickup({ requesterShiftDate: "2026-11-22" }), hoursOf);
    const result = requestWorkLimitBreaks({
      changes,
      published: publishedOn({ ana: ["2026-11-23", ...anaWeek.slice(0, 2), ...anaWeek.slice(3)] }),
    });
    expect(result[0].breaks.map((limit) => limit.limit)).toEqual(["week", "hours"]);
  });
});

describe("wording", () => {
  it("describes each limit with its dates", () => {
    expect(
      describeWorkLimit({ limit: "row", days: 6, start: "2026-11-25", end: "2026-11-30" }),
    ).toBe("6 days in a row, Wed, Nov 25 to Mon, Nov 30");
    expect(
      describeWorkLimit({ limit: "week", days: 6, start: "2026-11-29", end: "2026-12-05" }),
    ).toBe("6 days in the week of Sun, Nov 29");
    expect(
      describeWorkLimit({ limit: "hours", hours: 42.5, start: "2026-11-29", end: "2026-12-05" }),
    ).toBe("42.5 hours in the week of Sun, Nov 29");
  });

  it("names who the approval puts over", () => {
    expect(
      describeApprovalWorkLimits(
        [
          {
            employeeId: "ana",
            breaks: [{ limit: "row", days: 6, start: "2026-11-24", end: "2026-11-29" }],
          },
        ],
        () => "Ana Diaz",
      ),
    ).toEqual(["Approving gives Ana Diaz 6 days in a row, Tue, Nov 24 to Sun, Nov 29."]);
  });
});
