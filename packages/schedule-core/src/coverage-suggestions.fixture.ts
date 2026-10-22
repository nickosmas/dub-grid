import {
  buildAssignmentDefinitionIdsByFocusArea,
  computeCoverageCategorySnapshots,
  type CoverageAssignmentDefinitionLike,
  type CoverageRequirementLike,
} from "./coverage";
import { buildCoverageMatrix } from "./coverage-matrix";
import type {
  CoverageAvailability,
  CoverageMeasureInput,
  CoveragePickupRequest,
  CoverageSuggestionDay,
  CoverageSuggestionInput,
} from "./coverage-suggestions";
import { formatLocalDateKey, parseLocalDateKey } from "./dates";

export const SN = { id: 1, name: "Skilled Nursing" };
export const SC = { id: 2, name: "Sheltered Care" };
/** Day Shift · Med Aide and Day Shift · Charge Nurse in Skilled Nursing, Evening Shift in Sheltered Care. */
export const DAY_MA = 20;
export const DAY_CN = 21;
export const EVE_SC = 30;
export const ASSIGNMENTS: CoverageAssignmentDefinitionLike[] = [
  { id: DAY_MA, label: "D-MA", sortOrder: 1, categoryId: 2, shiftId: 2, jobId: 5, focusAreaId: 1 },
  { id: DAY_CN, label: "D-CN", sortOrder: 2, categoryId: 2, shiftId: 2, jobId: 6, focusAreaId: 1 },
  { id: EVE_SC, label: "E", sortOrder: 3, categoryId: 3, shiftId: 3, jobId: 5, focusAreaId: 2 },
];
export const ROW_MA = "1:5:2";
export const ROW_CN = "1:6:2";
export const ROW_SC = "2:5:3";

export const DATE_KEYS = [
  "2026-10-26",
  "2026-10-27",
  "2026-10-28",
  "2026-10-29",
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
  "2026-11-02",
];

export interface WorldDay {
  work?: number[];
  mentored?: number[];
  absence?: number | null;
  restOfDay?: number | null;
}
export type Week = Record<string, WorldDay>;

export interface WorldOptions {
  draft: Week;
  published?: Week;
  requirements?: CoverageRequirementLike[];
  people?: string[];
  focusAreasByPerson?: Record<string, number[]>;
  publishedDateKeys?: string[];
  startedDateKeys?: string[];
  mentoredCredit?: number;
}

export function toDay(day: WorldDay | undefined): CoverageSuggestionDay {
  return {
    assignmentIds: day?.work ?? [],
    mentoredAssignmentIds: day?.mentored ?? [],
    absenceTypeId: day?.absence ?? null,
    restOfDayAbsenceTypeId: day?.restOfDay ?? null,
  };
}

/** A small organization whose coverage is counted by the real engine. */
export function buildWorld(options: WorldOptions): CoverageMeasureInput {
  const published = options.published ?? options.draft;
  const people = options.people ?? ["ana", "ben", "cat", "dan", "eve"];
  const requirements = options.requirements ?? [
    {
      focusAreaId: 1,
      jobId: 5,
      preferredShiftId: 2,
      assignmentId: null,
      dayOfWeek: null,
      minStaff: 2,
    },
    {
      focusAreaId: 1,
      jobId: 6,
      preferredShiftId: 2,
      assignmentId: null,
      dayOfWeek: null,
      minStaff: 1,
    },
    {
      focusAreaId: 2,
      jobId: 5,
      preferredShiftId: 3,
      assignmentId: null,
      dayOfWeek: null,
      minStaff: 1,
    },
  ];
  const focusAreas = [SN, SC];
  const areasOf = (id: string) => options.focusAreasByPerson?.[id] ?? [1, 2];
  const employeesByFocusArea = new Map(
    focusAreas.map((area) => [
      area.id,
      people.filter((id) => areasOf(id).includes(area.id)).map((id) => ({ id })),
    ]),
  );
  const coverage = {
    focusAreas,
    shiftCategories: [
      { id: 2, name: "Day Shift" },
      { id: 3, name: "Evening Shift" },
    ],
    assignments: ASSIGNMENTS,
    requirements,
    employeesByFocusArea,
    assignmentIdsByFocusArea: buildAssignmentDefinitionIdsByFocusArea(focusAreas, ASSIGNMENTS),
  };
  const mentoredCredit = options.mentoredCredit ?? 0.5;
  const draftDay = (employeeId: string, dateKey: string) =>
    toDay(options.draft[`${employeeId}|${dateKey}`]);
  const publishedDay = (employeeId: string, dateKey: string) =>
    toDay(published[`${employeeId}|${dateKey}`]);
  const snapshots = (lookup: typeof draftDay) =>
    computeCoverageCategorySnapshots({
      ...coverage,
      dates: DATE_KEYS.map(parseLocalDateKey),
      assignmentIdsForKey: (employeeId, date) =>
        lookup(employeeId, formatLocalDateKey(date)).assignmentIds,
      coverageCreditForKey: (employeeId, date, assignmentId) =>
        lookup(employeeId, formatLocalDateKey(date)).mentoredAssignmentIds.includes(assignmentId)
          ? mentoredCredit
          : 1,
      includeContributors: true,
    });
  const started = new Set(options.startedDateKeys ?? []);
  const matrix = buildCoverageMatrix({
    draft: snapshots(draftDay),
    published: snapshots(publishedDay),
    dates: DATE_KEYS.map(parseLocalDateKey),
    publishedDateKeys: new Set(options.publishedDateKeys ?? DATE_KEYS),
    isStarted: (snapshot) => started.has(formatLocalDateKey(snapshot.date)),
  });
  return { matrix, coverage, mentoredCredit, draftDay, publishedDay };
}

export function cellOf(input: CoverageMeasureInput, rowKey: string, dateKey: string) {
  const row = input.matrix.rows.find((candidate) => candidate.rowKey === rowKey);
  return row?.cells[input.matrix.dateKeys.indexOf(dateKey)] ?? null;
}

export const NAMES: Record<string, string> = {
  ana: "Ana Crawford",
  ben: "Ben Shepherd",
  cat: "Cat Morrison",
  dan: "Dan Fowler",
  eve: "Eve Langford",
};

export interface SuggestionWorldOptions extends WorldOptions {
  qualified?: Record<string, number[]>;
  availability?: Record<string, CoverageAvailability>;
  requests?: string[];
  pendingPickups?: CoveragePickupRequest[];
  inactive?: string[];
}

/** The world plus the people, qualification and availability the engine asks about. */
export function buildSuggestionWorld(options: SuggestionWorldOptions): CoverageSuggestionInput {
  const world = buildWorld(options);
  const people = options.people ?? ["ana", "ben", "cat", "dan", "eve"];
  return {
    ...world,
    dateKeys: DATE_KEYS,
    people: people.map((id) => ({
      id,
      name: NAMES[id] ?? id,
      active: !(options.inactive ?? []).includes(id),
      focusAreaIds: options.focusAreasByPerson?.[id] ?? [1, 2],
    })),
    qualifiedFor: (employeeId, assignmentId) =>
      options.qualified?.[employeeId]?.includes(assignmentId) ?? true,
    availability: (employeeId, dateKey) =>
      options.availability?.[`${employeeId}|${dateKey}`] ?? { kind: "free" },
    hasRequest: (employeeId, dateKey) =>
      (options.requests ?? []).includes(`${employeeId}|${dateKey}`),
    pendingPickups: options.pendingPickups ?? [],
  };
}
