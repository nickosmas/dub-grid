import { describe, expect, it } from "vitest";
import {
  describeCoverageRuledOut,
  describeCoverageRuledOutReason,
  describeCoverageSuggestion,
  type CoverageSuggestionTextLookups,
} from "./coverage-suggestion-text";
import {
  suggestCoverageFixes,
  type CoverageRuledOut,
  type CoverageSuggestion,
} from "./coverage-suggestions";
import {
  DAY_CN,
  DAY_MA,
  EVE_SC,
  NAMES,
  ROW_CN,
  ROW_MA,
  ROW_SC,
  buildSuggestionWorld,
} from "./coverage-suggestions.fixture";

const MON = "2026-10-26";
const TUE = "2026-10-27";
const SUN = "2026-10-25";
const LOOKUPS: CoverageSuggestionTextLookups = {
  personName: (id) => NAMES[id] ?? null,
  assignmentName: (id) =>
    ({
      [DAY_MA]: "Day Shift · Med Aide",
      [DAY_CN]: "Day Shift · Charge Nurse",
      [EVE_SC]: "Evening Shift",
    })[id] ?? "Night Shift (archived)",
  assignmentFocusAreaId: (id) => (id === EVE_SC ? 2 : 1),
  focusAreaName: (id) => ({ 1: "Skilled Nursing", 2: "Sheltered Care" })[id] ?? null,
  absenceName: (id) => ({ 7: "Sick", 8: "Jury Duty (archived)" })[id] ?? "Unknown absence",
  rowLabel: (rowKey) =>
    ({
      [ROW_MA]: "Skilled Nursing · Day Shift · Med Aide",
      [ROW_CN]: "Skilled Nursing · Day Shift · Charge Nurse",
      [ROW_SC]: "Sheltered Care · Evening Shift",
    })[rowKey] ?? null,
  formatDate: (dateKey) =>
    ({ [SUN]: "Sun, Oct 25", [MON]: "Mon, Oct 26", [TUE]: "Tue, Oct 27" })[dateKey] ?? dateKey,
};
const DRAFT_OUTCOME = "Changes the draft only. Staff see it after you publish.";
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

function first(kind: CoverageSuggestion["kind"], suggestions: CoverageSuggestion[]) {
  const found = suggestions.find((suggestion) => suggestion.kind === kind);
  if (!found) throw new Error(`no ${kind}`);
  return describeCoverageSuggestion(found, LOOKUPS);
}

describe("describeCoverageSuggestion", () => {
  it("moves a shift back to its day", () => {
    const { suggestions } = suggestCoverageFixes(
      buildSuggestionWorld({
        requirements: MA_ONLY,
        qualified: { cat: [], dan: [], eve: [] },
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
      }),
    );
    expect(first("moveBack", suggestions)).toEqual({
      title:
        "Move Ana Crawford's Day Shift · Med Aide in Skilled Nursing from Tue, Oct 27 back to Mon, Oct 26",
      detail: "It was published on Mon, Oct 26, and this draft moved it.",
      outcome: DRAFT_OUTCOME,
      effect: "Closes 1 gap, and clears 1 over",
      changes: [
        "Mon, Oct 26 · Skilled Nursing · Day Shift · Med Aide: 1/2 staffed now, 2/2 after (staffed)",
        "Tue, Oct 27 · Skilled Nursing · Day Shift · Med Aide: 3/2 staffed now, 2/2 after (staffed)",
      ],
    });
  });

  it("moves someone back from other work, naming its focus area", () => {
    const { suggestions } = suggestCoverageFixes(
      buildSuggestionWorld({
        requirements: MA_ONLY,
        qualified: { cat: [], dan: [], eve: [] },
        published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
        draft: { [`ana|${MON}`]: { work: [EVE_SC] }, [`ben|${MON}`]: { work: [DAY_MA] } },
      }),
    );
    expect(first("moveBack", suggestions)).toEqual({
      title: "Change Ana Crawford back to Day Shift · Med Aide in Skilled Nursing on Mon, Oct 26",
      detail:
        "It was published as Day Shift · Med Aide, and this draft changed it to Evening Shift in Sheltered Care.",
      outcome: DRAFT_OUTCOME,
      effect: "Closes 1 gap",
      changes: [
        "Mon, Oct 26 · Skilled Nursing · Day Shift · Med Aide: 1/2 staffed now, 2/2 after (staffed)",
      ],
    });
  });

  it("restores a removed shift", () => {
    const { suggestions } = suggestCoverageFixes(
      buildSuggestionWorld({
        requirements: MA_ONLY,
        qualified: { cat: [], dan: [], eve: [] },
        published: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
        draft: { [`ben|${MON}`]: { work: [DAY_MA] } },
      }),
    );
    expect(first("restore", suggestions)).toEqual({
      title: "Restore Ana Crawford's Day Shift · Med Aide in Skilled Nursing on Mon, Oct 26",
      detail: "It was published, and this draft removed it with no absence or request recorded.",
      outcome: DRAFT_OUTCOME,
      effect: "Closes 1 gap",
      changes: [
        "Mon, Oct 26 · Skilled Nursing · Day Shift · Med Aide: 1/2 staffed now, 2/2 after (staffed)",
      ],
    });
  });

  it("schedules a free person, saying what else they work and what is left", () => {
    const { suggestions } = suggestCoverageFixes(
      buildSuggestionWorld({
        requirements: MA_ONLY,
        people: ["ana"],
        draft: { [`ana|${MON}`]: { work: [EVE_SC] } },
      }),
    );
    const assign = suggestions.find(
      (suggestion) => suggestion.kind === "assign" && suggestion.subject.dateKey === MON,
    );
    expect(describeCoverageSuggestion(assign!, LOOKUPS)).toEqual({
      title: "Schedule Ana Crawford for Day Shift · Med Aide in Skilled Nursing on Mon, Oct 26",
      detail:
        "Qualified for this shift and free at that time. Also works Evening Shift in Sheltered Care that day.",
      outcome: DRAFT_OUTCOME,
      effect: "Fills 1 spot",
      changes: [
        "Mon, Oct 26 · Skilled Nursing · Day Shift · Med Aide: 0/2 staffed now, 1/2 after (still short 1)",
      ],
    });
  });

  it("shows mentored credit exactly in what is left", () => {
    const world = buildSuggestionWorld({
      requirements: MA_ONLY,
      people: ["ana", "ben"],
      mentoredCredit: 0.35,
      draft: { [`ana|${MON}`]: { work: [DAY_MA], mentored: [DAY_MA] } },
    });
    const assign = suggestCoverageFixes(world).suggestions.find(
      (suggestion) => suggestion.kind === "assign" && suggestion.subject.dateKey === MON,
    );
    expect(describeCoverageSuggestion(assign!, LOOKUPS).changes).toEqual([
      "Mon, Oct 26 · Skilled Nursing · Day Shift · Med Aide: 0.35/2 staffed now, 1.35/2 after (still short 0.65)",
    ]);
  });

  it("approves a pickup", () => {
    const { suggestions } = suggestCoverageFixes(
      buildSuggestionWorld({
        requirements: MA_ONLY,
        people: ["ana", "ben"],
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
    );
    expect(first("approvePickup", suggestions)).toEqual({
      title:
        "Approve Ben Shepherd's pickup request for Day Shift · Med Aide in Skilled Nursing on Mon, Oct 26",
      detail: "Ben Shepherd asked to pick up this shift, and the request is waiting for approval.",
      outcome:
        "Publishes right away: staff see it without a publish, and it replaces any draft of that day.",
      effect: "Closes 1 gap",
      changes: [
        "Mon, Oct 26 · Skilled Nursing · Day Shift · Med Aide: 1/2 staffed now, 2/2 after (staffed)",
      ],
    });
  });

  it("tells apart the same shift name in two focus areas", () => {
    const lookups: CoverageSuggestionTextLookups = {
      ...LOOKUPS,
      // A shift without a job reads as its plain name in each focus area.
      assignmentName: (id) => (id === DAY_CN ? LOOKUPS.assignmentName(id) : "Day Shift"),
    };
    const { suggestions } = suggestCoverageFixes(
      buildSuggestionWorld({ people: ["ana"], draft: {} }),
    );
    const titles = suggestions
      .filter((suggestion) => suggestion.kind === "assign" && suggestion.subject.dateKey === MON)
      .map((suggestion) => describeCoverageSuggestion(suggestion, lookups).title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).toContain(
      "Schedule Ana Crawford for Day Shift in Skilled Nursing on Mon, Oct 26",
    );
    expect(titles).toContain(
      "Schedule Ana Crawford for Day Shift in Sheltered Care on Mon, Oct 26",
    );
  });

  it("names a repeating gap without an effect", () => {
    const { suggestions } = suggestCoverageFixes(
      buildSuggestionWorld({
        requirements: [
          {
            focusAreaId: 1,
            jobId: 5,
            preferredShiftId: 2,
            assignmentId: null,
            dayOfWeek: 1,
            minStaff: 1,
          },
        ],
        qualified: { ana: [], ben: [], cat: [], dan: [], eve: [] },
        draft: {},
      }),
    );
    expect(first("pattern", suggestions)).toEqual({
      title: "Skilled Nursing · Day Shift · Med Aide is short every Monday in this period",
      detail: "Nobody qualified is free on those days. A repeating shift would stop it recurring.",
      outcome: null,
      effect: null,
      changes: [],
    });
  });
});

describe("describeCoverageRuledOut", () => {
  const entry = (
    reason: CoverageRuledOut["reason"],
    overrides: Partial<CoverageRuledOut> = {},
  ): CoverageRuledOut => ({
    rowKey: ROW_MA,
    dateKey: MON,
    employeeId: "ana",
    requestId: null,
    reason,
    ...overrides,
  });

  it.each([
    [{ kind: "absence", absenceTypeId: 7 }, "Ana Crawford: Sick that day"],
    [{ kind: "restOfDayAbsence", absenceTypeId: 7 }, "Ana Crawford: Sick for the rest of the day"],
    [
      { kind: "overlap", dateKey: MON, assignmentId: EVE_SC },
      "Ana Crawford: works Evening Shift that day, which overlaps",
    ],
    [
      { kind: "overlap", dateKey: SUN, assignmentId: EVE_SC },
      "Ana Crawford: works Evening Shift on Sun, Oct 25, which runs into this shift",
    ],
    [
      { kind: "overlap", dateKey: TUE, assignmentId: DAY_CN },
      "Ana Crawford: works Day Shift · Charge Nurse on Tue, Oct 27, which starts before this one ends",
    ],
    [
      { kind: "unverified", dateKey: SUN },
      "Ana Crawford: Sun, Oct 25 isn't loaded, so it couldn't be checked",
    ],
    [{ kind: "absence", absenceTypeId: 8 }, "Ana Crawford: Jury Duty (archived) that day"],
  ] as const)("words %o", (reason, line) => {
    expect(describeCoverageRuledOut(entry(reason), LOOKUPS)).toBe(line);
  });

  it("names a pickup request and an unknown person", () => {
    expect(
      describeCoverageRuledOut(
        entry({ kind: "absence", absenceTypeId: 7 }, { requestId: "r1", employeeId: "ben" }),
        LOOKUPS,
      ),
    ).toBe("Ben Shepherd's pickup request: Sick that day");
    expect(
      describeCoverageRuledOut(
        entry({ kind: "absence", absenceTypeId: 7 }, { employeeId: "zed" }),
        LOOKUPS,
      ),
    ).toBe("Someone: Sick that day");
  });
});

describe("describeCoverageRuledOutReason", () => {
  it("gives the reason alone, including a waiting request", () => {
    const entry: CoverageRuledOut = {
      rowKey: ROW_MA,
      dateKey: MON,
      employeeId: "ana",
      requestId: null,
      reason: { kind: "request", dateKey: MON },
    };
    expect(describeCoverageRuledOutReason(entry, LOOKUPS)).toBe("has a request waiting that day");
    expect(describeCoverageRuledOut(entry, LOOKUPS)).toBe(
      "Ana Crawford: has a request waiting that day",
    );
  });

  it("says how many days in a row a shift would make", () => {
    const entry: CoverageRuledOut = {
      rowKey: ROW_MA,
      dateKey: MON,
      employeeId: "ana",
      requestId: null,
      reason: { kind: "workRun", days: 6 },
    };
    expect(describeCoverageRuledOut(entry, LOOKUPS)).toBe(
      "Ana Crawford: would work 6 days in a row",
    );
    expect(describeCoverageRuledOut({ ...entry, reason: { kind: "onlyShifts" } }, LOOKUPS)).toBe(
      "Ana Crawford: works only their chosen shifts",
    );
    expect(describeCoverageRuledOut({ ...entry, reason: { kind: "onlyJobs" } }, LOOKUPS)).toBe(
      "Ana Crawford: works only their chosen jobs",
    );
    expect(describeCoverageRuledOut({ ...entry, reason: { kind: "excluded" } }, LOOKUPS)).toBe(
      "Ana Crawford: excluded from this build",
    );
    expect(
      describeCoverageRuledOut({ ...entry, reason: { kind: "workWeek", days: 6 } }, LOOKUPS),
    ).toBe("Ana Crawford: would work 6 days that week");
    expect(describeCoverageRuledOut({ ...entry, reason: { kind: "doubleShift" } }, LOOKUPS)).toBe(
      "Ana Crawford: already works that day",
    );
  });
});
