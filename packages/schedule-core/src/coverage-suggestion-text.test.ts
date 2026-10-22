import { describe, expect, it } from "vitest";
import {
  describeCoverageRuledOut,
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
  ROW_MA,
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
  formatDate: (dateKey) =>
    ({ [SUN]: "Sun, Oct 25", [MON]: "Mon, Oct 26", [TUE]: "Tue, Oct 27" })[dateKey] ?? dateKey,
};
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
      title: "Move Ana Crawford's Day Shift · Med Aide back to Mon, Oct 26",
      detail: "Skilled Nursing. This draft moved it to Tue, Oct 27.",
      effect: "Closes 1 gap, and clears 1 over",
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
      title: "Move Ana Crawford back to Day Shift · Med Aide",
      detail:
        "Skilled Nursing, Mon, Oct 26. This draft changed it to Evening Shift in Sheltered Care.",
      effect: "Closes 1 gap",
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
      title: "Restore Ana Crawford's Day Shift · Med Aide",
      detail:
        "Skilled Nursing, Mon, Oct 26. Removed in this draft with no absence or request recorded.",
      effect: "Closes 1 gap",
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
      title: "Schedule Ana Crawford for Day Shift · Med Aide on Mon, Oct 26",
      detail:
        "Skilled Nursing. Qualified and free that day. Also works Evening Shift in Sheltered Care that day.",
      effect: "Still short 1 on Mon, Oct 26 after this",
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
    expect(describeCoverageSuggestion(assign!, LOOKUPS).effect).toBe(
      "Still short 0.65 on Mon, Oct 26 after this",
    );
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
      title: "Approve Ben Shepherd's pickup request",
      detail:
        "Skilled Nursing Day Shift · Med Aide, Mon, Oct 26. Takes effect for staff right away, without a publish.",
      effect: "Closes 1 gap",
    });
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
      title: "Skilled Nursing Day Shift · Med Aide is short every Monday in this period",
      detail: "Nobody qualified is free on those days. A repeating shift would stop it recurring.",
      effect: null,
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
