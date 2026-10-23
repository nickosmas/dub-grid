import { describe, expect, it } from "vitest";
import {
  planCoverageFixes,
  suggestCoverageFixes,
  type CoverageSuggestion,
} from "./coverage-suggestions";
import {
  DAY_CN,
  DAY_MA,
  EVE_SC,
  ROW_CN,
  ROW_MA,
  ROW_SC,
  buildSuggestionWorld,
  type SuggestionWorldOptions,
} from "./coverage-suggestions.fixture";

const MON = "2026-10-26";
const TUE = "2026-10-27";
const NEXT_MON = "2026-11-02";
const MA_ONLY = [
  {
    focusAreaId: 1,
    jobId: 5,
    preferredShiftId: 2,
    assignmentId: null,
    dayOfWeek: null,
    minStaff: 2,
  },
];

function run(options: SuggestionWorldOptions) {
  return suggestCoverageFixes(buildSuggestionWorld(options));
}

function about(suggestions: CoverageSuggestion[], rowKey: string, dateKey: string) {
  return suggestions.filter((suggestion) =>
    suggestion.targets.some((target) => target.rowKey === rowKey && target.dateKey === dateKey),
  );
}

const nobodyElse = { qualified: { cat: [], dan: [], eve: [] } };

describe("suggestCoverageFixes: the draft's own changes", () => {
  it("moves back a shift whose move opened a gap and made an over", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      ...nobodyElse,
      published: {
        [`ana|${MON}`]: { work: [DAY_MA] },
        [`ben|${MON}`]: { work: [DAY_MA] },
        [`ben|${TUE}`]: { work: [DAY_MA] },
        [`cat|${TUE}`]: { work: [DAY_MA] },
      },
      draft: {
        [`ben|${MON}`]: { work: [DAY_MA] },
        [`ana|${TUE}`]: { work: [DAY_MA] },
        [`ben|${TUE}`]: { work: [DAY_MA] },
        [`cat|${TUE}`]: { work: [DAY_MA] },
      },
    });

    const move = suggestions.find((suggestion) => suggestion.kind === "moveBack");
    expect(move).toMatchObject({
      id: `moveBack:ana:${MON},${TUE}`,
      employeeId: "ana",
      final: false,
      subject: { rowKey: ROW_MA, assignmentId: DAY_MA, dateKey: MON, otherDateKey: TUE },
      targets: [{ rowKey: ROW_MA, dateKey: MON }],
      closes: 1,
      clearsOver: 1,
    });
    expect(
      move?.overrides.map((override) => [override.dateKey, override.day.assignmentIds]),
    ).toEqual([
      [MON, [DAY_MA]],
      [TUE, []],
    ]);
  });

  it("drops a move back that would leave the other day short", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      ...nobodyElse,
      published: {
        [`ana|${MON}`]: { work: [DAY_MA] },
        [`ben|${MON}`]: { work: [DAY_MA] },
        [`ben|${TUE}`]: { work: [DAY_MA] },
      },
      draft: {
        [`ben|${MON}`]: { work: [DAY_MA] },
        [`ana|${TUE}`]: { work: [DAY_MA] },
        [`ben|${TUE}`]: { work: [DAY_MA] },
      },
    });

    expect(suggestions.filter((suggestion) => suggestion.kind === "moveBack")).toEqual([]);
  });

  it("moves back a shift changed to other work", () => {
    const { suggestions } = run({
      ...nobodyElse,
      published: {
        [`ana|${MON}`]: { work: [DAY_MA] },
        [`ben|${MON}`]: { work: [DAY_MA] },
        [`cat|${MON}`]: { work: [DAY_CN] },
      },
      draft: {
        [`ana|${MON}`]: { work: [DAY_CN] },
        [`ben|${MON}`]: { work: [DAY_MA] },
        [`cat|${MON}`]: { work: [DAY_CN] },
      },
    });

    expect(suggestions.find((suggestion) => suggestion.kind === "moveBack")).toMatchObject({
      id: `moveBack:ana:${MON}`,
      subject: { assignmentId: DAY_MA, otherDateKey: null, otherAssignmentIds: [DAY_CN] },
      closes: 1,
      clearsOver: 1,
    });
  });

  it("restores a shift removed with no absence or request", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      ...nobodyElse,
      published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
      draft: { [`ben|${MON}`]: { work: [DAY_MA] } },
    });

    expect(suggestions.find((suggestion) => suggestion.kind === "restore")).toMatchObject({
      id: `restore:ana:${MON}`,
      targets: [{ rowKey: ROW_MA, dateKey: MON }],
      closes: 1,
    });
  });

  it("does not restore a removal while a request waits", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      ...nobodyElse,
      requests: [`ana|${MON}`],
      published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
      draft: { [`ben|${MON}`]: { work: [DAY_MA] } },
    });

    expect(suggestions.filter((suggestion) => suggestion.kind === "restore")).toEqual([]);
  });

  it("does not restore a shift replaced by an absence", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      ...nobodyElse,
      published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
      draft: { [`ana|${MON}`]: { absence: 7 }, [`ben|${MON}`]: { work: [DAY_MA] } },
    });

    expect(
      about(suggestions, ROW_MA, MON).filter((suggestion) =>
        ["restore", "moveBack"].includes(suggestion.kind),
      ),
    ).toEqual([]);
  });

  it("suggests nothing for a day that has started", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      ...nobodyElse,
      startedDateKeys: [MON],
      published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
      draft: { [`ben|${MON}`]: { work: [DAY_MA] } },
    });

    expect(about(suggestions, ROW_MA, MON)).toEqual([]);
  });
});

describe("suggestCoverageFixes: people and pickups", () => {
  const oneShort = { [`ana|${MON}`]: { work: [DAY_MA] } };

  it("suggests a free, qualified person and never someone already counted", () => {
    const { suggestions, ruledOut } = run({
      requirements: MA_ONLY,
      people: ["ana", "ben"],
      draft: oneShort,
    });

    const here = about(suggestions, ROW_MA, MON);
    expect(here.map((suggestion) => [suggestion.kind, suggestion.employeeId])).toEqual([
      ["assign", "ben"],
    ]);
    expect(here[0]).toMatchObject({
      closes: 1,
      subject: { assignmentId: DAY_MA, otherAssignmentIds: [] },
    });
    expect(here[0].overrides).toEqual([
      expect.objectContaining({ employeeId: "ben", dateKey: MON, side: "draft" }),
    ]);
    expect(ruledOut.filter((entry) => entry.employeeId === "ana")).toEqual([]);
  });

  it("gives every qualified person who is not free a reason", () => {
    const { suggestions, ruledOut } = run({
      requirements: MA_ONLY,
      draft: oneShort,
      availability: {
        [`ben|${MON}`]: { kind: "absence", absenceTypeId: 7 },
        [`cat|${MON}`]: { kind: "restOfDayAbsence", absenceTypeId: 7 },
        [`dan|${MON}`]: { kind: "overlap", dateKey: MON, assignmentId: EVE_SC },
        [`eve|${MON}`]: { kind: "unverified", dateKey: "2026-10-25" },
      },
    });

    expect(about(suggestions, ROW_MA, MON)).toEqual([]);
    expect(
      ruledOut
        .filter((entry) => entry.dateKey === MON)
        .map((entry) => [entry.employeeId, entry.reason.kind]),
    ).toEqual([
      ["ben", "absence"],
      ["cat", "restOfDayAbsence"],
      ["dan", "overlap"],
      ["eve", "unverified"],
    ]);
  });

  it("leaves out people who are unqualified, inactive or in another focus area", () => {
    const { suggestions, ruledOut } = run({
      draft: oneShort,
      qualified: { ben: [] },
      inactive: ["cat"],
      focusAreasByPerson: { dan: [2] },
      people: ["ana", "ben", "cat", "dan"],
      availability: { [`ben|${MON}`]: { kind: "absence", absenceTypeId: 7 } },
    });

    const people = (rowKey: string) =>
      new Set([
        ...about(suggestions, rowKey, MON).map((suggestion) => suggestion.employeeId),
        ...ruledOut
          .filter((entry) => entry.rowKey === rowKey && entry.dateKey === MON)
          .map((entry) => entry.employeeId),
      ]);
    expect(people(ROW_MA)).toEqual(new Set());
    expect(people(ROW_SC)).toEqual(new Set(["ana", "dan"]));
  });

  it("suggests approving a pickup, which publishes", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      people: ["ana", "ben"],
      draft: oneShort,
      pendingPickups: [
        {
          requestId: "r1",
          employeeId: "ben",
          dateKey: MON,
          focusAreaId: 1,
          assignmentIds: [DAY_MA],
        },
      ],
    });

    const here = about(suggestions, ROW_MA, MON);
    expect(here.map((suggestion) => suggestion.kind)).toEqual(["approvePickup"]);
    expect(here[0]).toMatchObject({ requestId: "r1", final: true, closes: 1 });
    expect(here[0].overrides.map((override) => override.side).sort()).toEqual([
      "draft",
      "published",
    ]);
    expect(here[0].effects[0].publishedAfter?.actual).toBe(2);
  });

  it("rules out a pickup whose requester is no longer free", () => {
    const { suggestions, ruledOut } = run({
      requirements: MA_ONLY,
      people: ["ana", "ben"],
      draft: oneShort,
      availability: { [`ben|${MON}`]: { kind: "overlap", dateKey: MON, assignmentId: EVE_SC } },
      pendingPickups: [
        {
          requestId: "r1",
          employeeId: "ben",
          dateKey: MON,
          focusAreaId: 1,
          assignmentIds: [DAY_MA],
        },
      ],
    });

    expect(about(suggestions, ROW_MA, MON)).toEqual([]);
    expect(
      ruledOut.filter((entry) => entry.dateKey === MON).map((entry) => entry.requestId),
    ).toEqual(["r1", null]);
  });

  it("suggests a person for every cell they could fill that day", () => {
    const { suggestions } = run({ people: ["ana"], draft: {} });

    const forAna = suggestions.filter(
      (suggestion) => suggestion.employeeId === "ana" && suggestion.subject.dateKey === MON,
    );
    expect(forAna.map((suggestion) => suggestion.subject.rowKey).sort()).toEqual(
      [ROW_CN, ROW_MA, ROW_SC].sort(),
    );
  });
  it("suggests one action once, even when it fills two short requirements", () => {
    // A legacy requirement by shift and a job requirement both count Day Shift ·
    // Med Aide, so scheduling Ana once helps two rows that are short together.
    const { suggestions } = run({
      requirements: [
        {
          focusAreaId: 1,
          jobId: null,
          preferredShiftId: null,
          assignmentId: DAY_MA,
          dayOfWeek: null,
          minStaff: 1,
        },
        {
          focusAreaId: 1,
          jobId: 5,
          preferredShiftId: 2,
          assignmentId: null,
          dayOfWeek: null,
          minStaff: 1,
        },
      ],
      people: ["ana"],
      qualified: { ana: [DAY_MA] },
      draft: {},
    });

    const forAna = suggestions.filter(
      (suggestion) => suggestion.employeeId === "ana" && suggestion.subject.dateKey === MON,
    );
    expect(forAna.map((suggestion) => suggestion.id)).toEqual([`assign:ana:${MON}:${DAY_MA}`]);
    expect(forAna[0].closes).toBe(2);
    expect(forAna[0].targets).toHaveLength(2);
    expect(new Set(suggestions.map((suggestion) => suggestion.id)).size).toBe(suggestions.length);
  });
});

describe("suggestCoverageFixes: order and repeating gaps", () => {
  it("ranks by gaps closed, staff added, then kind", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      people: ["ana", "ben", "cat"],
      published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
      draft: { [`ben|${MON}`]: { work: [DAY_MA] } },
    });

    const here = about(suggestions, ROW_MA, MON);
    expect(here.map((suggestion) => `${suggestion.kind}:${suggestion.employeeId}`)).toEqual([
      "restore:ana",
      "assign:cat",
    ]);
    const firstPartial = suggestions.findIndex((suggestion) => suggestion.closes === 0);
    expect(suggestions.slice(0, firstPartial).every((suggestion) => suggestion.closes > 0)).toBe(
      true,
    );
  });

  it("returns the same ids in the same order on every run", () => {
    const options = { draft: { [`ana|${MON}`]: { work: [DAY_MA] } } };
    expect(run(options).suggestions.map((suggestion) => suggestion.id)).toEqual(
      run(options).suggestions.map((suggestion) => suggestion.id),
    );
  });

  it("names a weekday that is short every week with nothing to fix it", () => {
    const { suggestions } = run({
      requirements: [
        {
          focusAreaId: 2,
          jobId: 5,
          preferredShiftId: 3,
          assignmentId: null,
          dayOfWeek: 1,
          minStaff: 1,
        },
        {
          focusAreaId: 2,
          jobId: 5,
          preferredShiftId: 3,
          assignmentId: null,
          dayOfWeek: 2,
          minStaff: 1,
        },
      ],
      qualified: { ana: [], ben: [], cat: [], dan: [], eve: [] },
      draft: {},
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        id: `pattern:${ROW_SC}|1`,
        kind: "pattern",
        overrides: [],
        targets: [
          { rowKey: ROW_SC, dateKey: MON },
          { rowKey: ROW_SC, dateKey: NEXT_MON },
        ],
      }),
    ]);
  });

  it("does not call it a pattern when one of the days has a fix", () => {
    const { suggestions } = run({
      requirements: [
        {
          focusAreaId: 2,
          jobId: 5,
          preferredShiftId: 3,
          assignmentId: null,
          dayOfWeek: 1,
          minStaff: 1,
        },
      ],
      people: ["eve"],
      availability: { [`eve|${MON}`]: { kind: "absence", absenceTypeId: 7 } },
      draft: {},
    });

    expect(suggestions.map((suggestion) => suggestion.kind)).toEqual(["assign"]);
    expect(suggestions[0].subject.dateKey).toBe(NEXT_MON);
  });
});

describe("planCoverageFixes", () => {
  it("fills a gap once, however many people could fill it", () => {
    // Two short on Monday, five free people: two are scheduled, not five.
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const plan = planCoverageFixes(world, { dateKey: MON });

    expect(plan.every((fix) => fix.kind === "assign")).toBe(true);
    expect(plan).toHaveLength(2);
    expect(new Set(plan.map((fix) => fix.employeeId)).size).toBe(2);
    expect(plan.every((fix) => fix.targets.some((target) => target.dateKey === MON))).toBe(true);
  });

  it("covers every date when no date is given, leaving nothing short", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const plan = planCoverageFixes(world);

    const scheduled = plan.map((fix) => `${fix.employeeId}|${fix.subject.dateKey}`);
    expect(new Set(scheduled).size).toBe(plan.length);
    expect(plan).toHaveLength(2 * world.matrix.dateKeys.length);
  });

  it("puts back the draft's own changes before adding anyone", () => {
    const plan = planCoverageFixes(
      buildSuggestionWorld({
        requirements: MA_ONLY,
        published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
        draft: { [`ben|${MON}`]: { work: [DAY_MA] } },
      }),
      { dateKey: MON },
    );

    expect(plan.map((fix) => [fix.kind, fix.employeeId])).toEqual([["restore", "ana"]]);
  });

  it("never approves a pickup, which would publish", () => {
    const plan = planCoverageFixes(
      buildSuggestionWorld({
        requirements: MA_ONLY,
        people: ["ana", "ben"],
        qualified: { ben: [] },
        draft: { [`ana|${MON}`]: { work: [DAY_MA] } },
        pendingPickups: [
          {
            requestId: "r1",
            employeeId: "ben",
            dateKey: MON,
            focusAreaId: 1,
            assignmentIds: [DAY_MA],
          },
        ],
      }),
      { dateKey: MON },
    );

    expect(plan.some((fix) => fix.kind === "approvePickup")).toBe(false);
  });

  it("gives one person one fix a day, even with two short requirements", () => {
    const plan = planCoverageFixes(buildSuggestionWorld({ people: ["ana"], draft: {} }), {
      dateKey: MON,
    });

    expect(plan.filter((fix) => fix.employeeId === "ana")).toHaveLength(1);
  });

  it("asks the caller whether a planned day leaves someone free", () => {
    // One short on Monday and Tuesday, only Ana free: the caller says a
    // Monday shift does not stop a Tuesday one, so she gets both.
    const world = buildSuggestionWorld({
      requirements: [{ ...MA_ONLY[0], minStaff: 1 }],
      people: ["ana"],
      draft: {},
    });
    const cautious = planCoverageFixes(world);
    const exact = planCoverageFixes(world, {
      availabilityWith: (planned) => (employeeId, dateKey) =>
        planned.some((day) => day.employeeId === employeeId && day.dateKey === dateKey)
          ? { kind: "overlap", dateKey, assignmentId: DAY_MA }
          : { kind: "free" },
    });

    expect(cautious.map((fix) => fix.subject.dateKey)).not.toContain(TUE);
    expect(exact.map((fix) => fix.subject.dateKey)).toContain(TUE);
    expect(exact.length).toBeGreaterThan(cautious.length);
  });

  it("is empty when nothing is short", () => {
    const staffed = { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } };
    expect(
      planCoverageFixes(buildSuggestionWorld({ requirements: MA_ONLY, draft: staffed }), {
        dateKey: MON,
      }),
    ).toEqual([]);
  });
});
