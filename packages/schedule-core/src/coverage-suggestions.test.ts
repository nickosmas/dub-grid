import { describe, expect, it } from "vitest";
import {
  planCoverageFixes,
  previewCoverageBuild,
  previewCoverageBuildAsync,
  suggestCoverageFixes,
  type CoverageDayOverride,
  type CoverageFairnessRule,
  type CoverageOvertimeRule,
  type CoverageSuggestion,
  type CoverageSuggestionInput,
  type CoverageTopUpRule,
} from "./coverage-suggestions";
import {
  DAY_CN,
  DAY_MA,
  EVE_SC,
  ROW_CN,
  ROW_MA,
  ROW_SC,
  DATE_KEYS,
  buildSuggestionWorld,
  type SuggestionWorldOptions,
} from "./coverage-suggestions.fixture";
import { getScheduleWeekStartDate } from "./dates";

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

describe("previewCoverageBuild", () => {
  it("counts what the build does, by kind, people and gaps", () => {
    // Monday: Ana's shift was removed in the draft (restore) and one more is
    // short (schedule). Every other day is short two (schedule two).
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      published: { [`ana|${MON}`]: { work: [DAY_MA] } },
      draft: {},
    });
    const preview = previewCoverageBuild(world);

    expect(preview.counts.restore).toBe(1);
    expect(preview.counts.moveBack).toBe(0);
    expect(preview.counts.assign).toBe(preview.fixes.length - 1);
    expect(preview.fixes[0].kind).toBe("restore");
    expect(preview.shortBefore).toBe(world.matrix.dateKeys.length);
    expect(preview.shortAfter).toBe(0);
    expect(preview.staffShortBefore).toBe(2 * world.matrix.dateKeys.length);
    expect(preview.staffShortAfter).toBe(0);
    expect(preview.people).toBe(new Set(preview.fixes.map((fix) => fix.employeeId)).size);
  });

  it("does not count cells that have started", () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      draft: {},
      startedDateKeys: [MON],
    });
    const preview = previewCoverageBuild(world);

    expect(preview.shortBefore).toBe(world.matrix.dateKeys.length - 1);
    expect(preview.fixes.some((fix) => fix.subject.dateKey === MON)).toBe(false);
  });

  it("builds only the rows it is given, and counts only them", () => {
    const world = buildSuggestionWorld({ draft: {} });
    const preview = previewCoverageBuild(world, { rowKeys: new Set([ROW_SC]) });

    expect(preview.fixes.length).toBeGreaterThan(0);
    expect(
      preview.fixes.every((fix) => fix.targets.every((target) => target.rowKey === ROW_SC)),
    ).toBe(true);
    expect(preview.shortBefore).toBe(world.matrix.dateKeys.length);
  });

  it("counts people still needed, so a partial fill shows progress", () => {
    // Two needed each day, one person free: every day goes from 2 to 1 short.
    const world = buildSuggestionWorld({ requirements: MA_ONLY, people: ["ana"], draft: {} });
    const preview = previewCoverageBuild(world, { dateKey: MON });

    expect(preview.shortAfter).toBe(preview.shortBefore);
    expect(preview.staffShortAfter).toBe(preview.staffShortBefore - 1);
  });

  it("is empty, with nothing changed, when nobody can fill anything", () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      qualified: { ana: [], ben: [], cat: [], dan: [], eve: [] },
      draft: {},
    });
    const preview = previewCoverageBuild(world);

    expect(preview.fixes).toEqual([]);
    expect(preview.counts).toEqual({ assign: 0, restore: 0, moveBack: 0 });
    expect(preview.shortAfter).toBe(preview.shortBefore);
    expect(preview.staffShortAfter).toBe(preview.staffShortBefore);
  });

  it("previews the same build every time", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    expect(previewCoverageBuild(world)).toEqual(previewCoverageBuild(world));
  });
});

describe("previewCoverageBuild topping up the week", () => {
  const ONE_MA = [{ ...MA_ONLY[0], minStaff: 1 }];
  // Ana covers every day; Ben and Cat have nothing yet.
  const anaEveryDay = Object.fromEntries(
    DATE_KEYS.map((dateKey) => [`ana|${dateKey}`, { work: [DAY_MA] }]),
  );
  // Ben and Cat each already work one day: Saturday Oct 31.
  const withSaturdays = {
    ...anaEveryDay,
    "ben|2026-10-31": { work: [DAY_MA] },
    "cat|2026-10-31": { work: [DAY_MA] },
  };
  const daysWorked = (
    world: CoverageSuggestionInput,
    employeeId: string,
    week: string,
    planned: ReadonlyArray<CoverageDayOverride>,
  ) =>
    DATE_KEYS.filter((dateKey) => {
      if (getScheduleWeekStartDate(dateKey) !== getScheduleWeekStartDate(week)) return false;
      const override = planned.find(
        (day) => day.employeeId === employeeId && day.dateKey === dateKey,
      );
      return (override?.day ?? world.draftDay(employeeId, dateKey)).assignmentIds.length > 0;
    }).length;
  const topUp = (
    world: CoverageSuggestionInput,
    target: number,
    employeeIds = ["ben", "cat"],
  ): CoverageTopUpRule => ({
    employeeIds,
    target: () => target,
    weekDays: (employeeId, dateKey, planned) => daysWorked(world, employeeId, dateKey, planned),
  });
  const daysOf = (fixes: CoverageSuggestion[], employeeId: string) =>
    fixes
      .filter((fix) => fix.employeeId === employeeId)
      .map((fix) => fix.subject.dateKey)
      .sort();

  it("gives people below their usual days more shifts, spread over the least-staffed days", () => {
    const world = buildSuggestionWorld({
      requirements: ONE_MA,
      people: ["ana", "ben", "cat"],
      draft: withSaturdays,
    });
    const preview = previewCoverageBuild(world, { topUp: topUp(world, 2) });

    // Week of Oct 25 (Mon to Sat loaded, Saturday already worked), then Sun Nov 1 and Mon Nov 2.
    expect(daysOf(preview.fixes, "ben")).toEqual(["2026-10-26", "2026-11-01", "2026-11-02"]);
    expect(daysOf(preview.fixes, "cat")).toEqual(["2026-10-27", "2026-11-01", "2026-11-02"]);
    expect(preview.fixes.every((fix) => fix.kind === "assign")).toBe(true);
    expect(new Set(preview.choices.map((choice) => choice.reason))).toEqual(new Set(["weekDays"]));
    expect(preview.shortAfter).toBe(0);
  });

  it("leaves alone someone with no shift in the period", () => {
    const world = buildSuggestionWorld({
      requirements: ONE_MA,
      people: ["ana", "ben"],
      draft: anaEveryDay,
    });
    expect(previewCoverageBuild(world, { topUp: topUp(world, 5, ["ben"]) }).fixes).toEqual([]);
  });

  it("leaves them alone when their only shift is on a loaded date outside the period", () => {
    const EARLIER = "2026-10-19";
    const world = buildSuggestionWorld({
      requirements: ONE_MA,
      people: ["ana", "ben"],
      draft: { ...anaEveryDay, [`ben|${EARLIER}`]: { work: [DAY_MA] } },
    });
    const loaded = { ...world, dateKeys: [EARLIER, ...DATE_KEYS] };
    expect(previewCoverageBuild(loaded, { topUp: topUp(loaded, 5, ["ben"]) }).fixes).toEqual([]);
  });

  it("tops up nobody already at their usual days", () => {
    const world = buildSuggestionWorld({
      requirements: ONE_MA,
      people: ["ana", "ben"],
      draft: withSaturdays,
    });
    expect(previewCoverageBuild(world, { topUp: topUp(world, 0, ["ben"]) }).fixes).toEqual([]);
  });

  it("skips a day with an absence or a waiting request", () => {
    const world = buildSuggestionWorld({
      requirements: ONE_MA,
      people: ["ana", "ben"],
      draft: { ...withSaturdays, [`ben|${MON}`]: { absence: 7 } },
      requests: [`ben|${TUE}`],
    });
    const days = daysOf(
      previewCoverageBuild(world, { topUp: topUp(world, 3, ["ben"]) }).fixes,
      "ben",
    );

    expect(days).not.toContain(MON);
    expect(days).not.toContain(TUE);
    expect(days.filter((dateKey) => dateKey < "2026-11-01")).toHaveLength(2);
  });

  it("goes past the overtime threshold to reach the usual days, and names it", () => {
    const world = buildSuggestionWorld({
      requirements: ONE_MA,
      people: ["ana", "ben"],
      draft: withSaturdays,
    });
    const overtime: CoverageOvertimeRule = {
      thresholdHours: 8,
      weekHours: (employeeId, dateKey, planned) =>
        8 * daysWorked(world, employeeId, dateKey, planned),
    };
    const preview = previewCoverageBuild(world, {
      topUp: topUp(world, 2, ["ben"]),
      overtime,
    });

    expect(daysOf(preview.fixes, "ben")).toHaveLength(3);
    expect(preview.overThreshold.map((entry) => entry.dateKey)).toEqual([
      "2026-10-26",
      "2026-11-02",
    ]);
  });
});

describe("previewCoverageBuild with a limit on days worked", () => {
  const WED = "2026-10-28";
  const SAT = "2026-10-31";
  const addDays = (dateKey: string, days: number) => {
    const date = new Date(`${dateKey}T00:00:00`);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  // At most 5 in a row and 5 in a Sunday-to-Saturday week, as the web adapter counts.
  const overLimit = (dateKey: string, worked: (dateKey: string) => boolean) => {
    if (worked(dateKey)) return null;
    let run = 1;
    for (let offset = -1; worked(addDays(dateKey, offset)); offset -= 1) run += 1;
    for (let offset = 1; worked(addDays(dateKey, offset)); offset += 1) run += 1;
    if (run > 5) return { kind: "workRun" as const, days: run };
    const sunday = getScheduleWeekStartDate(dateKey);
    const week = Array.from({ length: 7 }, (_, offset) => addDays(sunday, offset)).filter(
      (key) => key === dateKey || worked(key),
    ).length;
    return week > 5 ? { kind: "workWeek" as const, days: week } : null;
  };
  const withPlanned =
    (world: CoverageSuggestionInput, planned: ReadonlyArray<CoverageDayOverride>) =>
    (employeeId: string, key: string) => {
      const day = planned.find((item) => item.employeeId === employeeId && item.dateKey === key);
      return (day?.day ?? world.draftDay(employeeId, key)).assignmentIds.length > 0;
    };

  it("never restores a shift that would make a sixth day after a build's own assign", () => {
    // Ben was published Mon to Fri, and the draft took Wednesday off. Wednesday
    // needs 2 Med Aides with both regulars absent, so restoring Ben only fills
    // it; Saturday's Charge Nurse is short and only Ben is free for it.
    const draft: SuggestionWorldOptions["draft"] = {};
    const published: SuggestionWorldOptions["draft"] = {};
    for (const dateKey of DATE_KEYS) {
      for (const person of ["ana", "dan"]) {
        published[`${person}|${dateKey}`] = { work: [DAY_MA] };
        draft[`${person}|${dateKey}`] = dateKey === WED ? { absence: 7 } : { work: [DAY_MA] };
      }
      const cat = dateKey === SAT ? { absence: 7 } : { work: [DAY_CN] };
      published[`cat|${dateKey}`] = cat;
      draft[`cat|${dateKey}`] = cat;
    }
    for (const dateKey of DATE_KEYS.slice(0, 5)) {
      published[`ben|${dateKey}`] = { work: [DAY_MA] };
      if (dateKey !== WED) draft[`ben|${dateKey}`] = { work: [DAY_MA] };
    }
    const base = buildSuggestionWorld({
      requirements: [
        { ...MA_ONLY[0], minStaff: 2 },
        { ...MA_ONLY[0], jobId: 6, minStaff: 1 },
      ],
      people: ["ana", "ben", "cat", "dan"],
      focusAreasByPerson: { ana: [1], ben: [1], cat: [1], dan: [1] },
      draft,
      published,
    });
    const availabilityWith =
      (planned: ReadonlyArray<CoverageDayOverride>) => (employeeId: string, dateKey: string) => {
        const worked = withPlanned(base, planned)(employeeId, dateKey);
        const day =
          planned.find((item) => item.employeeId === employeeId && item.dateKey === dateKey)?.day ??
          base.draftDay(employeeId, dateKey);
        if (day.absenceTypeId != null) {
          return { kind: "absence" as const, absenceTypeId: day.absenceTypeId };
        }
        if (worked) return { kind: "doubleShift" as const };
        return (
          overLimit(dateKey, (key) => withPlanned(base, planned)(employeeId, key)) ?? {
            kind: "free" as const,
          }
        );
      };
    const world: CoverageSuggestionInput = {
      ...base,
      availability: availabilityWith([]),
      workLimit: (_employeeId, dateKey, worked) => overLimit(dateKey, worked),
    };
    const preview = previewCoverageBuild(world, { availabilityWith });
    const planned = preview.fixes.flatMap((fix) => fix.overrides);
    const benDays = DATE_KEYS.slice(0, 6).filter((dateKey) =>
      withPlanned(world, planned)("ben", dateKey),
    );

    expect(preview.fixes.map((fix) => `${fix.kind} ${fix.subject.dateKey}`)).toEqual([
      `assign ${SAT}`,
    ]);
    expect(benDays).toHaveLength(5);
  });

  it("still restores when the limit allows it", () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      people: ["ana", "ben"],
      draft: { [`ana|${MON}`]: { work: [DAY_MA] } },
      published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
    });
    const limited = { ...world, workLimit: () => null };
    expect(suggestCoverageFixes(limited).suggestions.map((fix) => fix.kind)).toContain("restore");
    const refused = {
      ...world,
      workLimit: () => ({ kind: "workWeek" as const, days: 6 }),
    };
    expect(suggestCoverageFixes(refused).suggestions.map((fix) => fix.kind)).not.toContain(
      "restore",
    );
  });
});

describe("previewCoverageBuild leaving people out", () => {
  it("gives the people left out no shift, restore or top-up, and says why", () => {
    // Ben's Monday shift was taken off in the draft; Mon and Tue each need 2.
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      people: ["ana", "ben", "cat"],
      focusAreasByPerson: { ana: [1], ben: [1], cat: [1] },
      draft: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${TUE}`]: { work: [DAY_MA] } },
      published: {
        [`ana|${MON}`]: { work: [DAY_MA] },
        [`ben|${MON}`]: { work: [DAY_MA] },
        [`ben|${TUE}`]: { work: [DAY_MA] },
      },
    });
    const all = previewCoverageBuild(world, {});
    expect(all.fixes.some((fix) => fix.employeeId === "ben")).toBe(true);

    const preview = previewCoverageBuild(world, {
      excludedEmployeeIds: new Set(["ben"]),
      topUp: {
        employeeIds: ["ben", "cat"],
        target: () => 5,
        weekDays: () => 0,
      },
    });
    expect(preview.fixes.some((fix) => fix.employeeId === "ben")).toBe(false);
    expect(preview.fixes.some((fix) => fix.employeeId === "cat")).toBe(true);
    expect(preview.excluded).toEqual(["ben"]);
    expect(
      preview.skipped.filter((entry) => entry.employeeId === "ben").map((entry) => entry.reason),
    ).toContainEqual({ kind: "excluded" });
  });
});

describe("previewCoverageBuild on top of recurring fills", () => {
  const day = (
    employeeId: string,
    dateKey: string,
    work: number[],
    absence: number | null = null,
  ) => ({
    employeeId,
    dateKey,
    side: "draft" as const,
    day: {
      assignmentIds: work,
      mentoredAssignmentIds: [],
      absenceTypeId: absence,
      restOfDayAbsenceTypeId: null,
    },
  });

  it("counts a recurring fill that closes a gap, and plans nothing more for it", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      baseOverrides: [day("ana", MON, [DAY_MA]), day("ben", MON, [DAY_MA])],
    });

    expect(preview.recurring).toEqual({ shifts: 2, absences: 0 });
    expect(preview.fixes).toEqual([]);
    expect(preview.people).toBe(2);
    expect(preview.staffShortAfter).toBe(preview.staffShortBefore - 2);
  });

  it("counts each person's recurring fills for the report", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const preview = previewCoverageBuild(world, {
      baseOverrides: [
        day("ben", MON, [DAY_MA]),
        day("ana", MON, [DAY_MA]),
        day("ben", TUE, [], 4),
        day("ben", NEXT_MON, [DAY_MA]),
      ],
    });

    expect(preview.recurringPeople).toEqual([
      { employeeId: "ben", shifts: 2, absences: 1 },
      { employeeId: "ana", shifts: 1, absences: 0 },
    ]);
  });

  it("never books someone again on a day their recurring schedule fills", () => {
    const world = buildSuggestionWorld({ people: ["ana", "ben"], draft: {} });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      baseOverrides: [day("ana", MON, [DAY_MA])],
    });

    expect(
      preview.fixes.some((fix) => fix.employeeId === "ana" && fix.subject.dateKey === MON),
    ).toBe(false);
  });

  it("treats a recurring absence as unavailable", () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      people: ["ana", "ben"],
      draft: {},
    });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      baseOverrides: [day("ana", MON, [], 7)],
    });

    expect(preview.recurring).toEqual({ shifts: 0, absences: 1 });
    expect(preview.fixes.map((fix) => fix.employeeId)).toEqual(["ben"]);
  });

  it("is the plain build with no recurring fills", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    expect(previewCoverageBuild(world, { baseOverrides: [] })).toEqual(previewCoverageBuild(world));
    expect(previewCoverageBuild(world).recurring).toEqual({ shifts: 0, absences: 0 });
  });
});

describe("absences and requests in a build", () => {
  it("never schedules someone with a request waiting that day, and says so", () => {
    const { suggestions, ruledOut } = run({
      requirements: MA_ONLY,
      people: ["ana", "ben"],
      requests: [`ana|${MON}`],
      draft: {},
    });

    expect(suggestions.some((fix) => fix.employeeId === "ana" && fix.subject.dateKey === MON)).toBe(
      false,
    );
    expect(ruledOut).toContainEqual(
      expect.objectContaining({
        employeeId: "ana",
        dateKey: MON,
        reason: { kind: "request", dateKey: MON },
      }),
    );
  });

  it("still suggests approving someone's own waiting pickup", () => {
    const { suggestions } = run({
      requirements: MA_ONLY,
      people: ["ana", "ben"],
      requests: [`ben|${MON}`],
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
    });

    expect(suggestions.map((fix) => [fix.kind, fix.employeeId])).toContainEqual([
      "approvePickup",
      "ben",
    ]);
  });

  it("names who was skipped for the shifts a build leaves short, and why", () => {
    // Two needed on Monday; Ana is free, Ben is Sick, Cat has a request.
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      people: ["ana", "ben", "cat"],
      requests: [`cat|${MON}`],
      // The page reads Ben's Sick day as unavailable; the fixture is told so.
      availability: { [`ben|${MON}`]: { kind: "absence", absenceTypeId: 7 } },
      draft: { [`ben|${MON}`]: { absence: 7 } },
    });
    const preview = previewCoverageBuild(world, { dateKey: MON });

    expect(preview.fixes.map((fix) => fix.employeeId)).toEqual(["ana"]);
    expect(
      preview.skipped.map((entry) => [entry.employeeId, entry.dateKey, entry.reason.kind]).sort(),
    ).toEqual([
      ["ben", MON, "absence"],
      ["cat", MON, "request"],
    ]);
  });

  it("names nobody for shifts the build fills, or rows outside it", () => {
    const filled = previewCoverageBuild(
      buildSuggestionWorld({ requirements: MA_ONLY, draft: {} }),
      { dateKey: MON },
    );
    expect(filled.skipped.some((entry) => entry.dateKey === MON)).toBe(false);

    const outside = previewCoverageBuild(
      buildSuggestionWorld({
        people: ["ana"],
        availability: { [`ana|${MON}`]: { kind: "absence", absenceTypeId: 7 } },
        draft: { [`ana|${MON}`]: { absence: 7 } },
      }),
      { dateKey: MON, rowKeys: new Set([ROW_SC]) },
    );
    expect(outside.skipped.length).toBeGreaterThan(0);
    expect(outside.skipped.every((entry) => entry.rowKey === ROW_SC)).toBe(true);
  });
});

describe("the overtime threshold in a build", () => {
  // Ana and Ben start the week at 36 hours; each planned shift adds 8.
  const startingHours: Record<string, number> = { ana: 36, ben: 36 };
  const overtime: CoverageOvertimeRule = {
    thresholdHours: 40,
    weekHours: (employeeId, _dateKey, planned: ReadonlyArray<CoverageDayOverride>) =>
      (startingHours[employeeId] ?? 0) +
      8 *
        planned.filter((day) => day.employeeId === employeeId && day.day.assignmentIds.length > 0)
          .length,
  };

  it("schedules people who stay under the threshold first", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const without = planCoverageFixes(world, { dateKey: MON });
    const withRule = planCoverageFixes(world, { dateKey: MON, overtime });

    expect(without.some((fix) => fix.employeeId === "ana" || fix.employeeId === "ben")).toBe(true);
    expect(withRule).toHaveLength(2);
    expect(withRule.some((fix) => fix.employeeId === "ana" || fix.employeeId === "ben")).toBe(
      false,
    );
    expect(previewCoverageBuild(world, { dateKey: MON, overtime }).overThreshold).toEqual([]);
  });

  it("goes over only when nobody else can fill the gap, and says so", () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      draft: {},
      qualified: { cat: [], dan: [], eve: [] },
    });
    const preview = previewCoverageBuild(world, { dateKey: MON, overtime });

    expect(preview.fixes.map((fix) => fix.employeeId).sort()).toEqual(["ana", "ben"]);
    expect(preview.shortAfter).toBe(preview.shortBefore - 1);
    expect(
      preview.overThreshold.map(({ employeeId, dateKey, hours }) => [employeeId, dateKey, hours]),
    ).toEqual(preview.fixes.map((fix) => [fix.employeeId, MON, 44]));
    expect(preview.overThreshold.map((entry) => entry.suggestionId)).toEqual(
      preview.fixes.map((fix) => fix.id),
    );
  });

  it("does not mark a fix that adds no hours to a week already over", () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      draft: {},
      qualified: { cat: [], dan: [], eve: [] },
    });
    const flat: CoverageOvertimeRule = { thresholdHours: 40, weekHours: () => 50 };
    const preview = previewCoverageBuild(world, { dateKey: MON, overtime: flat });

    expect(preview.fixes).toHaveLength(2);
    expect(preview.overThreshold).toEqual([]);
  });
});

describe("fairness in a build", () => {
  const SAT = "2026-10-31";
  const planned = (employeeId: string, days: ReadonlyArray<CoverageDayOverride>) =>
    days.filter((day) => day.employeeId === employeeId && day.day.assignmentIds.length > 0).length;
  const rule = (
    hours: Record<string, number>,
    options: {
      weekends?: Record<string, number>;
      nights?: Record<string, number>;
      splits?: string[];
      prefers?: Record<string, "match" | "none" | "other">;
    } = {},
  ): CoverageFairnessRule => ({
    standing: (employeeId, dateKey, _assignmentId, days) => {
      const day = new Date(`${dateKey}T00:00:00`).getDay();
      const weekend = day === 0 || day === 6;
      return {
        splitsDaysOff: options.splits?.includes(employeeId) ?? false,
        preference: options.prefers?.[employeeId] ?? "none",
        weekends: weekend && options.weekends ? (options.weekends[employeeId] ?? 0) : null,
        nights: options.nights ? (options.nights[employeeId] ?? 0) : null,
        hours: (hours[employeeId] ?? 0) + 8 * planned(employeeId, days),
      };
    },
  });

  it("gives a shift to the person with the fewest hours, and says why", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      fairness: rule({ ana: 30, ben: 30, cat: 0, dan: 10, eve: 20 }),
    });

    expect(preview.fixes.map((fix) => fix.employeeId)).toEqual(["cat", "dan"]);
    expect(
      preview.choices.map(({ employeeId, reason, count, others }) => [
        employeeId,
        reason,
        count,
        others,
      ]),
    ).toEqual([
      ["cat", "hours", 0, 4],
      ["dan", "hours", 10, 3],
    ]);
  });

  it("rotates weekends before balancing hours", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const plan = planCoverageFixes(world, {
      dateKey: SAT,
      fairness: rule(
        { ana: 0, ben: 0, cat: 0, dan: 40, eve: 40 },
        { weekends: { ana: 3, ben: 2, cat: 4, dan: 0, eve: 1 } },
      ),
    });

    expect(plan.map((fix) => fix.employeeId)).toEqual(["dan", "eve"]);
  });

  it("rotates nights before balancing hours", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      fairness: rule(
        { ana: 0, ben: 8, cat: 40 },
        { nights: { ana: 2, ben: 2, cat: 0, dan: 5, eve: 5 } },
      ),
    });

    expect(preview.fixes.map((fix) => fix.employeeId)).toEqual(["cat", "ana"]);
    expect(preview.choices.map((choice) => choice.reason)).toEqual(["nights", "hours"]);
  });

  it("chooses by name when everyone stands the same, and calls it a tie", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const preview = previewCoverageBuild(world, { dateKey: MON, fairness: rule({}) });

    expect(preview.fixes.map((fix) => fix.employeeId)).toEqual(["ana", "ben"]);
    expect(preview.choices[0]).toMatchObject({ reason: "tie", count: 0, others: 4 });
  });

  it("says when only one person could fill it", () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      draft: { [`ana|${MON}`]: { work: [DAY_MA] } },
      qualified: { cat: [], dan: [], eve: [] },
    });
    const preview = previewCoverageBuild(world, { dateKey: MON, fairness: rule({}) });

    expect(preview.fixes.map((fix) => fix.employeeId)).toEqual(["ben"]);
    expect(preview.choices).toEqual([
      expect.objectContaining({ employeeId: "ben", reason: "only", others: 0 }),
    ]);
  });

  it("keeps days off together before balancing anything else", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      fairness: rule(
        { ana: 0, ben: 4, cat: 30, dan: 40, eve: 40 },
        { splits: ["ana", "ben", "dan", "eve"] },
      ),
    });

    // Only Cat keeps days off together; the next pick splits for everyone, so hours decide.
    expect(preview.fixes.map((fix) => fix.employeeId)).toEqual(["cat", "ana"]);
    expect(preview.choices.map((choice) => choice.reason)).toEqual(["daysOff", "hours"]);
  });

  it("splits days off only when everyone who could fill the shift would split them", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const plan = planCoverageFixes(world, {
      dateKey: MON,
      fairness: rule(
        { ana: 8, ben: 0, cat: 0, dan: 4, eve: 4 },
        { splits: ["ana", "ben", "cat", "dan", "eve"] },
      ),
    });

    // Everyone splits, so the shift still goes out, by hours (Ben and Cat tie, Ben by name).
    expect(plan.map((fix) => fix.employeeId)).toEqual(["ben", "cat"]);
  });

  it("gives a shift to people who prefer it first and to people who prefer others last", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      fairness: rule(
        { ana: 0, ben: 0, cat: 30, dan: 40, eve: 0 },
        { prefers: { ana: "other", ben: "other", eve: "other", dan: "match" } },
      ),
    });

    // Dan prefers it; then Cat, with no preference, before anyone who prefers other shifts.
    expect(preview.fixes.map((fix) => fix.employeeId)).toEqual(["dan", "cat"]);
    expect(preview.choices.map((choice) => choice.reason)).toEqual(["preference", "preference"]);
  });

  it("keeps days off together before a preference", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const plan = planCoverageFixes(world, {
      dateKey: MON,
      fairness: rule({}, { prefers: { ana: "match" }, splits: ["ana"] }),
    });

    expect(plan[0].employeeId).toBe("ben");
  });

  it("still puts back the draft's own changes first", () => {
    const plan = planCoverageFixes(
      buildSuggestionWorld({
        requirements: MA_ONLY,
        published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
        draft: { [`ben|${MON}`]: { work: [DAY_MA] } },
      }),
      { dateKey: MON, fairness: rule({ ana: 100 }) },
    );

    expect(plan.map((fix) => [fix.kind, fix.employeeId])).toEqual([["restore", "ana"]]);
  });

  it("keeps people within 40 hours ahead of fairness", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const overtime: CoverageOvertimeRule = {
      thresholdHours: 40,
      weekHours: (employeeId, _dateKey, days) =>
        (employeeId === "ana" || employeeId === "ben" ? 0 : 40) + 8 * planned(employeeId, days),
    };
    const plan = planCoverageFixes(world, {
      dateKey: MON,
      overtime,
      fairness: rule({ ana: 30, ben: 30 }),
    });

    expect(plan.map((fix) => fix.employeeId)).toEqual(["ana", "ben"]);
  });
});

describe("the shifts a build leaves short", () => {
  it("lists each by date, then in the matrix's row order, with the staff still needed", () => {
    // Only Ana is qualified for anything, so every day stays short.
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      draft: {},
      qualified: { ben: [], cat: [], dan: [], eve: [] },
    });
    const preview = previewCoverageBuild(world);

    expect(preview.shortCells.map((cell) => cell.dateKey)).toEqual(world.matrix.dateKeys);
    expect(preview.shortCells.length).toBe(preview.shortAfter);
    expect(preview.shortCells.reduce((sum, cell) => sum + cell.staffShort, 0)).toBe(
      preview.staffShortAfter,
    );
  });

  it("lists nothing when the build staffs everything", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    expect(previewCoverageBuild(world).shortCells).toEqual([]);
  });

  it("keeps to the rows built", () => {
    const world = buildSuggestionWorld({
      draft: {},
      qualified: { ana: [], ben: [], cat: [], dan: [], eve: [] },
    });
    const preview = previewCoverageBuild(world, { rowKeys: new Set([ROW_SC]) });

    expect(preview.shortCells.length).toBeGreaterThan(0);
    expect(preview.shortCells.every((cell) => cell.rowKey === ROW_SC)).toBe(true);
  });
});

describe("previewCoverageBuildAsync", () => {
  it("gives the same preview as the synchronous build, pausing after each fix", async () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      published: { [`ana|${MON}`]: { work: [DAY_MA] } },
      draft: {},
    });
    const progress: { placed: number; filled: number; needed: number }[] = [];
    let pauses = 0;
    const preview = await previewCoverageBuildAsync(
      world,
      {},
      {
        pause: async () => {
          pauses += 1;
        },
        onProgress: (placed) => progress.push(placed),
      },
    );

    expect(preview).toEqual(previewCoverageBuild(world));
    expect(pauses).toBe(preview.fixes.length);
    expect(progress.map((step) => step.placed)).toEqual(preview.fixes.map((_, index) => index + 1));
    // Every spot gets filled here, so the last step reports all of them.
    expect(progress.every((step) => step.needed === preview.staffShortBefore)).toBe(true);
    expect(progress.at(-1)?.filled).toBe(preview.staffShortBefore);
    expect(progress.map((step) => step.filled)).toEqual(
      [...progress.map((step) => step.filled)].sort((a, b) => a - b),
    );
  });

  it("finishes without pausing when there is nothing to place", async () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      draft: {},
      qualified: { ana: [], ben: [], cat: [], dan: [], eve: [] },
    });
    let pauses = 0;
    const preview = await previewCoverageBuildAsync(
      world,
      {},
      {
        pause: async () => {
          pauses += 1;
        },
      },
    );

    expect(preview.fixes).toEqual([]);
    expect(pauses).toBe(0);
  });
});

describe("recurring fills left out", () => {
  it("are reported with the preview as given", () => {
    const world = buildSuggestionWorld({ requirements: MA_ONLY, draft: {} });
    const skipped = [{ employeeId: "ana", dateKey: MON, days: 6 }];
    expect(previewCoverageBuild(world, { skippedRecurring: skipped }).recurringSkipped).toEqual(
      skipped,
    );
    expect(previewCoverageBuild(world).recurringSkipped).toEqual([]);
  });
});

describe("a requirement's most staff in a build", () => {
  // Mondays need two Med Aides and one Charge Nurse, and both are staffed. Eve works Tuesday.
  const staffed = Object.fromEntries(
    [MON, NEXT_MON].flatMap((dateKey) => [
      [`ana|${dateKey}`, { work: [DAY_MA] }],
      [`ben|${dateKey}`, { work: [DAY_MA] }],
      [`cat|${dateKey}`, { work: [DAY_CN] }],
    ]),
  );
  const requirements = (maStaff: number | null, cnStaff: number | null) => [
    { ...MA_ONLY[0], dayOfWeek: 1, maxStaff: maStaff },
    { ...MA_ONLY[0], jobId: 6, dayOfWeek: 1, minStaff: 1, maxStaff: cnStaff },
  ];
  const topUpEve: CoverageTopUpRule = { employeeIds: ["eve"], target: () => 5, weekDays: () => 1 };
  const eveTopUps = (cnStaff: number | null, maStaff: number | null = null) =>
    previewCoverageBuild(
      buildSuggestionWorld({
        requirements: requirements(maStaff, cnStaff),
        draft: { ...staffed, [`eve|${TUE}`]: { work: [DAY_MA] } },
      }),
      { topUp: topUpEve },
    ).fixes.map((fix) => fix.subject.rowKey);

  it("tops up into the shift the person adds least to, so a one-person shift is last", () => {
    expect(eveTopUps(null)).toEqual([ROW_MA, ROW_MA]);
  });

  it("never tops up a requirement past its most", () => {
    expect(eveTopUps(1)).toEqual([ROW_MA, ROW_MA]);
    expect(eveTopUps(1, 2)).toEqual([]);
  });
});

describe("a build moving its own shifts to a gap", () => {
  // Monday needs one Med Aide and one Evening. Ana can do either, Ben only the Med Aide.
  const requirements = [
    { ...MA_ONLY[0], minStaff: 1 },
    { ...MA_ONLY[0], focusAreaId: 2, preferredShiftId: 3, minStaff: 1 },
  ];
  const qualified = { ana: [DAY_MA, EVE_SC], ben: [DAY_MA] };
  const placed = (preview: ReturnType<typeof previewCoverageBuild>) =>
    preview.fixes.map((fix) => `${fix.employeeId} ${fix.subject.dateKey} ${fix.subject.rowKey}`);

  it("moves someone it placed to a gap only they can fill, and gives their shift to someone free", () => {
    const world = buildSuggestionWorld({
      requirements,
      people: ["ana", "ben"],
      qualified,
      draft: {},
    });
    const preview = previewCoverageBuild(world, { dateKey: MON });

    expect(placed(preview).sort()).toEqual([`ana ${MON} ${ROW_SC}`, `ben ${MON} ${ROW_MA}`]);
    expect(preview.shortCells).toEqual([]);
    expect(preview.choices.find((choice) => choice.employeeId === "ana")?.reason).toBe("moved");
  });

  it("moves a shift to another day when that frees the person for a gap", () => {
    // Monday needs a Med Aide, Tuesday an Evening; each person works one day.
    // Cat covers the next Monday from the draft.
    const world = buildSuggestionWorld({
      requirements: [
        { ...requirements[0], dayOfWeek: 1 },
        { ...requirements[1], dayOfWeek: 2 },
      ],
      people: ["ana", "ben", "cat"],
      qualified: { ...qualified, cat: [] },
      draft: { [`cat|${NEXT_MON}`]: { work: [DAY_MA] } },
    });
    const oneDay =
      (planned: ReadonlyArray<CoverageDayOverride>) => (employeeId: string, dateKey: string) =>
        planned.some(
          (day) =>
            day.employeeId === employeeId &&
            day.dateKey !== dateKey &&
            day.day.assignmentIds.length > 0,
        )
          ? { kind: "workWeek" as const, days: 2 }
          : { kind: "free" as const };
    const preview = previewCoverageBuild(world, { availabilityWith: oneDay });

    expect(placed(preview).sort()).toEqual([`ana ${TUE} ${ROW_SC}`, `ben ${MON} ${ROW_MA}`]);
    expect(preview.shortAfter).toBe(0);
  });

  it("leaves a recurring fill where it is", () => {
    const world = buildSuggestionWorld({
      requirements,
      people: ["ana", "ben"],
      qualified,
      draft: {},
    });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      baseOverrides: [
        {
          employeeId: "ana",
          dateKey: MON,
          side: "draft",
          day: {
            assignmentIds: [DAY_MA],
            mentoredAssignmentIds: [],
            absenceTypeId: null,
            restOfDayAbsenceTypeId: null,
          },
        },
      ],
    });

    expect(placed(preview)).toEqual([]);
    expect(preview.shortCells).toEqual([{ rowKey: ROW_SC, dateKey: MON, staffShort: 1 }]);
  });

  it("never takes the backfill from someone left out of the build", () => {
    const world = buildSuggestionWorld({
      requirements,
      people: ["ana", "ben"],
      qualified,
      draft: {},
    });
    const preview = previewCoverageBuild(world, {
      dateKey: MON,
      excludedEmployeeIds: new Set(["ben"]),
    });

    expect(placed(preview)).toEqual([`ana ${MON} ${ROW_MA}`]);
    expect(preview.shortCells).toEqual([{ rowKey: ROW_SC, dateKey: MON, staffShort: 1 }]);
  });
});
