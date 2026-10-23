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
    options: { weekends?: Record<string, number>; nights?: Record<string, number> } = {},
  ): CoverageFairnessRule => ({
    standing: (employeeId, dateKey, _assignmentId, days) => {
      const day = new Date(`${dateKey}T00:00:00`).getDay();
      const weekend = day === 0 || day === 6;
      return {
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
