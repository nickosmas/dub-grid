import { describe, expect, it } from "vitest";
import {
  buildAssignmentDefinitionIdsByFocusArea,
  computeCoverageCategorySnapshots,
  type CoverageAssignmentDefinitionLike,
} from "./coverage";
import { buildCoverageMatrix } from "./coverage-matrix";
import {
  suggestCoverageFixes,
  type CoverageSuggestionDay,
  type CoverageSuggestionInput,
} from "./coverage-suggestions";
import { formatLocalDateKey, parseLocalDateKey } from "./dates";

const DATE_KEYS = Array.from({ length: 14 }, (_, index) =>
  formatLocalDateKey(new Date(2026, 9, 25 + index)),
);
const FOCUS_AREAS = [
  { id: 1, name: "Skilled Nursing" },
  { id: 2, name: "Sheltered Care" },
];
// Three shifts per focus area: one requirement row each, six rows in all.
const ASSIGNMENTS: CoverageAssignmentDefinitionLike[] = FOCUS_AREAS.flatMap((area) =>
  [1, 2, 3].map((shift) => ({
    id: area.id * 10 + shift,
    label: `${area.id}-${shift}`,
    sortOrder: shift,
    categoryId: shift,
    shiftId: area.id * 10 + shift,
    jobId: 5,
    focusAreaId: area.id,
  })),
);
const REQUIREMENTS = ASSIGNMENTS.map((assignment) => ({
  focusAreaId: assignment.focusAreaId as number,
  jobId: 5,
  preferredShiftId: assignment.shiftId as number,
  assignmentId: null,
  dayOfWeek: null,
  minStaff: 4,
}));
const PEOPLE = Array.from({ length: 40 }, (_, index) => ({
  id: `p${index}`,
  name: `Person ${String(index).padStart(2, "0")}`,
  active: true,
  focusAreaIds: [index < 20 ? 1 : 2],
}));

function buildGrid(): CoverageSuggestionInput {
  let seed = 47;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const published: Record<string, CoverageSuggestionDay> = {};
  const draft: Record<string, CoverageSuggestionDay> = {};
  const empty: CoverageSuggestionDay = {
    assignmentIds: [],
    mentoredAssignmentIds: [],
    absenceTypeId: null,
    restOfDayAbsenceTypeId: null,
  };
  for (const person of PEOPLE) {
    for (const dateKey of DATE_KEYS) {
      const roll = random();
      const shift = person.focusAreaIds[0] * 10 + 1 + Math.floor(random() * 3);
      const day =
        roll < 0.55
          ? { ...empty, assignmentIds: [shift] }
          : roll < 0.6
            ? { ...empty, absenceTypeId: 7 }
            : empty;
      published[`${person.id}|${dateKey}`] = day;
      // The draft takes some shifts off and moves a few to the next day.
      const edit = random();
      draft[`${person.id}|${dateKey}`] = edit < 0.05 ? empty : day;
    }
  }
  const lookup = (map: typeof draft) => (employeeId: string, dateKey: string) =>
    map[`${employeeId}|${dateKey}`] ?? empty;
  const draftDay = lookup(draft);
  const publishedDay = lookup(published);
  const coverage = {
    focusAreas: FOCUS_AREAS,
    shiftCategories: [1, 2, 3].map((id) => ({ id, name: `Shift ${id}` })),
    assignments: ASSIGNMENTS,
    requirements: REQUIREMENTS,
    employeesByFocusArea: new Map(
      FOCUS_AREAS.map((area) => [
        area.id,
        PEOPLE.filter((person) => person.focusAreaIds.includes(area.id)),
      ]),
    ),
    assignmentIdsByFocusArea: buildAssignmentDefinitionIdsByFocusArea(FOCUS_AREAS, ASSIGNMENTS),
  };
  const snapshots = (day: typeof draftDay) =>
    computeCoverageCategorySnapshots({
      ...coverage,
      dates: DATE_KEYS.map(parseLocalDateKey),
      assignmentIdsForKey: (employeeId, date) =>
        day(employeeId, formatLocalDateKey(date)).assignmentIds,
      includeContributors: true,
    });
  const matrix = buildCoverageMatrix({
    draft: snapshots(draftDay),
    published: snapshots(publishedDay),
    dates: DATE_KEYS.map(parseLocalDateKey),
    publishedDateKeys: new Set(DATE_KEYS),
    isStarted: () => false,
  });
  return {
    matrix,
    coverage,
    mentoredCredit: 0.5,
    draftDay,
    publishedDay,
    dateKeys: DATE_KEYS,
    people: PEOPLE,
    qualifiedFor: () => true,
    availability: (employeeId, dateKey) => {
      const day = draftDay(employeeId, dateKey);
      if (day.absenceTypeId != null) return { kind: "absence", absenceTypeId: day.absenceTypeId };
      if (day.assignmentIds.length > 0) {
        return { kind: "overlap", dateKey, assignmentId: day.assignmentIds[0] };
      }
      return { kind: "free" };
    },
    hasRequest: () => false,
    pendingPickups: [],
  };
}

describe("suggestCoverageFixes on a two-week grid", () => {
  it("answers quickly and the same way twice", () => {
    const input = buildGrid();
    expect(input.matrix.totals.short).toBeGreaterThanOrEqual(25);

    suggestCoverageFixes(input);
    const started = performance.now();
    const result = suggestCoverageFixes(input);
    const elapsed = performance.now() - started;

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.some((suggestion) => suggestion.kind === "restore")).toBe(true);
    expect(elapsed).toBeLessThan(150);
    expect(suggestCoverageFixes(input)).toEqual(result);
  });
});
