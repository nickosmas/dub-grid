import type {
  Employee,
  ShiftCode,
  FocusArea,
  ShiftCategory,
  CoverageRequirement,
  CoverageRuleConfig,
  CoverageStatus,
  CoverageGap,
  CoverageShortageDetail,
  ResolvedCoverageRule,
  ShiftMap,
} from "@/types";
import { formatDateKey, iterateDateRange } from "@/lib/utils";

export type PublishedWindowState = "unpublished" | "partial" | "published";

/**
 * Checks whether an employee is qualified for a given shift code based on
 * focus area assignment and certification requirements.
 */
export function isEmployeeQualified(
  emp: { certificationId: number | null; focusAreaIds: number[] },
  shiftCode: ShiftCode,
): boolean {
  const certOk = !shiftCode.requiredCertificationIds?.length ||
    (emp.certificationId != null && shiftCode.requiredCertificationIds.includes(emp.certificationId));
  const areaOk = !shiftCode.focusAreaId || emp.focusAreaIds.includes(shiftCode.focusAreaId);
  return certOk && areaOk;
}

/**
 * Returns human-readable reasons why an employee is not qualified for a shift code.
 */
export function getDisqualificationReasons(
  emp: { certificationId: number | null; focusAreaIds: number[] },
  shiftCode: ShiftCode,
  focusAreaNames?: Map<number, string>,
  certificationNames?: Map<number, string>,
): string[] {
  const reasons: string[] = [];
  if (shiftCode.focusAreaId && !emp.focusAreaIds.includes(shiftCode.focusAreaId)) {
    const name = focusAreaNames?.get(shiftCode.focusAreaId) ?? `focus area #${shiftCode.focusAreaId}`;
    reasons.push(`not assigned to ${name}`);
  }
  if (shiftCode.requiredCertificationIds?.length) {
    if (emp.certificationId == null || !shiftCode.requiredCertificationIds.includes(emp.certificationId)) {
      const names = shiftCode.requiredCertificationIds
        .map(id => certificationNames?.get(id) ?? `cert #${id}`)
        .join(" or ");
      reasons.push(`requires ${names}`);
    }
  }
  return reasons;
}

/**
 * Returns true when the scheduler grid should treat the cell as occupied.
 * Draft-deleted rows are intentionally treated as empty because they no longer
 * represent an active visible assignment in the draft schedule.
 */
export function hasVisibleGridShiftEntry(
  shift?: ShiftMap[string] | null,
): boolean {
  return !!(
    shift &&
    (shift.shiftCodeIds.length > 0 || shift.absenceTypeId != null) &&
    !shift.isDelete
  );
}

// ── Time Overlap Helpers ──────────────────────────────────────────────────────

export interface TimeRange {
  start: string;
  end: string;
}

/** Checks if two time ranges overlap. Handles overnight shifts where start > end. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  if (a.start > a.end) {
    return rangesOverlap({ start: a.start, end: "24:00" }, b)
        || rangesOverlap({ start: "00:00", end: a.end }, b);
  }
  if (b.start > b.end) {
    return rangesOverlap(a, { start: b.start, end: "24:00" })
        || rangesOverlap(a, { start: "00:00", end: b.end });
  }
  return a.start < b.end && b.start < a.end;
}

/** True if any range in `a` overlaps with any range in `b`. */
export function timesOverlap(a: TimeRange[], b: TimeRange[]): boolean {
  return a.some(r1 => b.some(r2 => rangesOverlap(r1, r2)));
}

/**
 * Checks if a shift on a given date would overlap with adjacent-day shifts
 * due to overnight time crossing.
 *
 * An overnight shift on date D occupies [start, 24:00) on D and [00:00, end) on D+1.
 * This function checks:
 * - If the new shift is overnight, does its D+1 tail overlap with the next day's shift?
 * - If the previous day's shift is overnight, does its D tail overlap with the new shift?
 */
/** Treat "00:00" end time as "24:00" (end of day, not start of next day). */
function normalizeEnd(t: TimeRange): TimeRange {
  return t.end === "00:00" ? { start: t.start, end: "24:00" } : t;
}

export function checkCrossDateOverlap(
  rawNewShiftTimes: TimeRange,
  adjacentShifts: { prev?: TimeRange | null; next?: TimeRange | null },
): string[] {
  const warnings: string[] = [];
  const newShiftTimes = normalizeEnd(rawNewShiftTimes);
  const isNewOvernight = newShiftTimes.start > newShiftTimes.end;

  // New shift is overnight → its tail [00:00, end) bleeds into D+1
  if (isNewOvernight && adjacentShifts.next) {
    const tailOnNextDay: TimeRange = { start: "00:00", end: newShiftTimes.end };
    // Only compare against the D+1 portion of the next shift (not its D+2 tail)
    const next = normalizeEnd(adjacentShifts.next);
    const isNextOvernight = next.start > next.end;
    const nextOnSameDay: TimeRange = isNextOvernight
      ? { start: next.start, end: "24:00" }
      : next;
    if (rangesOverlap(tailOnNextDay, nextOnSameDay)) {
      warnings.push("This overnight shift overlaps with the next day\u2019s shift");
    }
  }

  // D-1 shift is overnight → its tail [00:00, prevEnd) bleeds into today
  const prev = adjacentShifts.prev ? normalizeEnd(adjacentShifts.prev) : null;
  if (prev && prev.start > prev.end) {
    const prevTailOnToday: TimeRange = { start: "00:00", end: prev.end };
    // Only compare against the D portion of the current shift (not its D+1 tail)
    const currentOnDay: TimeRange = isNewOvernight
      ? { start: newShiftTimes.start, end: "24:00" }
      : newShiftTimes;
    if (rangesOverlap(prevTailOnToday, currentOnDay)) {
      warnings.push("Overlaps with yesterday\u2019s overnight shift");
    }
  }

  return warnings;
}

/** Checks for time overlaps between multiple shift codes on the same day. */
export function checkSameDayOverlaps(
  ranges: TimeRange[],
  labels: string[],
): string[] {
  const warnings: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (rangesOverlap(normalizeEnd(ranges[i]), normalizeEnd(ranges[j]))) {
        warnings.push(`${labels[i]} and ${labels[j]} times overlap`);
      }
    }
  }
  return warnings;
}

export interface Tally {
  [label: string]: number;
}

/**
 * Per-date tallies keyed by shift category ID.
 * Each entry maps shift label → count of employees on that shift.
 */
export type DailyTallies = Record<number, Tally>;

/**
 * Computes per-category FTE counts for a single date across a set of employees.
 * Uses shift code IDs to determine section membership — only shift codes whose ID
 * is in `sectionCodeIds` are counted. This prevents cross-focus-area miscounting
 * when different sections share the same label (e.g. "D").
 * Only shift codes with a categoryId are counted (off-days and uncategorized codes are excluded).
 */
export function computeDailyTallies(
  employees: Employee[],
  date: Date,
  shiftCodeIdsForKey: (empId: string, date: Date) => number[],
  shiftCodeById: Map<number, ShiftCode>,
  sectionCodeIds: Set<number>,
  labelResolver?: (code: ShiftCode) => string,
): DailyTallies {
  const tallies: DailyTallies = {};

  for (const emp of employees) {
    const codeIds = shiftCodeIdsForKey(emp.id, date);
    if (codeIds.length === 0) continue;

    for (const codeId of codeIds) {
      if (!sectionCodeIds.has(codeId)) continue;
      const code = shiftCodeById.get(codeId);
      if (!code || code.categoryId == null) continue;
      tallies[code.categoryId] ??= {};
      const label = labelResolver ? labelResolver(code) : code.label;
      tallies[code.categoryId][label] =
        (tallies[code.categoryId][label] || 0) + 1;
    }
  }

  return tallies;
}

/**
 * Filters employees by focus area ID and sorts by seniority (ascending).
 * Employees with empty focus area arrays are always excluded.
 * Pass null for activeFocusAreaId to show all focus areas.
 */
export function filterAndSortEmployees(
  employees: Employee[],
  activeFocusAreaId: number | null,
): Employee[] {
  return employees
    .filter(
      (e) =>
        e.focusAreaIds.length > 0 &&
        (activeFocusAreaId === null || e.focusAreaIds.includes(activeFocusAreaId)),
    )
    .sort((a, b) => a.seniority - b.seniority);
}

// ── Coverage Intelligence ─────────────────────────────────────────────────────

/**
 * Resolves the coverage requirement for a given (focusAreaId, shiftCodeId, dayOfWeek).
 * Checks for a day-specific row first, then falls back to the "every day" row (dayOfWeek=null).
 */
export function resolveRequirement(
  requirements: CoverageRequirement[],
  focusAreaId: number,
  shiftCodeId: number,
  dayOfWeek: number,
): { minStaff: number } | null {
  const daySpecific = requirements.find(
    (r) =>
      r.focusAreaId === focusAreaId &&
      r.shiftCodeId === shiftCodeId &&
      r.dayOfWeek === dayOfWeek,
  );
  if (daySpecific) return { minStaff: daySpecific.minStaff };

  const everyDay = requirements.find(
    (r) =>
      r.focusAreaId === focusAreaId &&
      r.shiftCodeId === shiftCodeId &&
      r.dayOfWeek === null,
  );
  if (everyDay) return { minStaff: everyDay.minStaff };

  return null;
}

export function resolveCoverageRules(
  requirements: CoverageRequirement[],
  coverageRuleConfigs: CoverageRuleConfig[],
  shiftCodes: ShiftCode[],
  shiftCodeDisplayMap?: Map<number, string>,
): ResolvedCoverageRule[] {
  const activeShiftCodeById = new Map(
    shiftCodes
      .filter((shiftCode) => !shiftCode.archivedAt)
      .map((shiftCode) => [shiftCode.id, shiftCode]),
  );
  const configByKey = new Map(
    coverageRuleConfigs.map((config) => [
      `${config.focusAreaId}:${config.requirementShiftCodeId}`,
      config,
    ]),
  );
  const requirementKeys = new Set(
    requirements.map((requirement) => `${requirement.focusAreaId}:${requirement.shiftCodeId}`),
  );

  const resolved: ResolvedCoverageRule[] = [];

  for (const key of requirementKeys) {
    const [focusAreaIdRaw, requirementShiftCodeIdRaw] = key.split(":");
    const focusAreaId = Number(focusAreaIdRaw);
    const requirementShiftCodeId = Number(requirementShiftCodeIdRaw);
    const baseShiftCode = activeShiftCodeById.get(requirementShiftCodeId);
    if (!baseShiftCode) continue;

    const config = configByKey.get(key);
    const eligibleShiftCodeIds = new Set<number>([requirementShiftCodeId]);

    for (const eligibleShiftCodeId of config?.eligibleShiftCodeIds ?? []) {
      const eligibleShiftCode = activeShiftCodeById.get(eligibleShiftCodeId);
      if (!eligibleShiftCode) continue;
      if (eligibleShiftCode.focusAreaId !== baseShiftCode.focusAreaId) continue;
      if ((eligibleShiftCode.categoryId ?? null) !== (baseShiftCode.categoryId ?? null)) continue;
      eligibleShiftCodeIds.add(eligibleShiftCodeId);
    }

    const sortedEligibleShiftCodeIds = [...eligibleShiftCodeIds].sort((left, right) => left - right);
    const preferredOpenShiftCodeId = sortedEligibleShiftCodeIds.includes(config?.preferredOpenShiftCodeId ?? -1)
      ? (config?.preferredOpenShiftCodeId ?? requirementShiftCodeId)
      : requirementShiftCodeId;

    resolved.push({
      id: key,
      orgId: baseShiftCode.orgId,
      focusAreaId,
      requirementShiftCodeId,
      eligibleShiftCodeIds: sortedEligibleShiftCodeIds,
      preferredOpenShiftCodeId,
      ruleLabel: shiftCodeDisplayMap?.get(requirementShiftCodeId) || baseShiftCode.label,
      shiftCategoryId: baseShiftCode.categoryId ?? null,
    });
  }

  return resolved;
}

/**
 * Computes coverage status for a single (focusArea, shiftCode, date) cell.
 * Counts actual headcount and qualified headcount against the requirement.
 */
export function computeCoverageStatus(
  employees: Employee[],
  date: Date,
  shiftCodeIdsForKey: (empId: string, date: Date) => number[],
  sectionCodeIds: Set<number>,
  eligibleShiftCodeIds: number[] | Set<number>,
  requirement: { minStaff: number },
): CoverageStatus {
  const eligibleShiftCodeIdSet =
    eligibleShiftCodeIds instanceof Set
      ? eligibleShiftCodeIds
      : new Set(eligibleShiftCodeIds);
  let actual = 0;

  for (const emp of employees) {
    const codeIds = shiftCodeIdsForKey(emp.id, date);
    if (codeIds.some((codeId) => sectionCodeIds.has(codeId) && eligibleShiftCodeIdSet.has(codeId))) {
      actual++;
    }
  }

  const hasRequirement = requirement.minStaff > 0;
  const isMet = actual >= requirement.minStaff;

  return {
    actual,
    required: requirement.minStaff,
    isMet,
    hasRequirement,
  };
}

/**
 * Returns the shift codes each focus area can use for coverage checks.
 * Focus areas can satisfy requirements with their own codes plus general codes.
 */
export function buildShiftCodeIdsByFocusArea(
  focusAreas: FocusArea[],
  shiftCodes: ShiftCode[],
): Map<number, Set<number>> {
  const shiftCodeIdsByFocusArea = new Map<number, Set<number>>();

  for (const fa of focusAreas) {
    shiftCodeIdsByFocusArea.set(
      fa.id,
      new Set(
        shiftCodes
          .filter((sc) => sc.focusAreaId === fa.id || sc.focusAreaId == null)
          .map((sc) => sc.id),
      ),
    );
  }

  return shiftCodeIdsByFocusArea;
}

export interface CoverageCategorySnapshot {
  focusAreaId: number;
  focusAreaName: string;
  shiftCategoryId: number;
  shiftCategoryName: string;
  date: Date;
  status: CoverageStatus;
  eligibleShiftCodeIds: number[];
  preferredOpenShiftCodeId: number;
  shortageDetails: CoverageShortageDetail[];
}

function getShiftCodeDisplayLabel(
  shiftCode: ShiftCode,
  shiftCodeDisplayMap?: Map<number, string>,
): string {
  return shiftCodeDisplayMap?.get(shiftCode.id) || shiftCode.label;
}

function compareShiftCodes(left: ShiftCode, right: ShiftCode): number {
  return left.sortOrder - right.sortOrder || left.id - right.id;
}

/**
 * Computes category-level coverage snapshots for each focus area/date/category.
 * Green/red status is based on total headcount in the category, while exact-code
 * shortages remain informational detail when a category is short.
 */
export function computeCoverageCategorySnapshots(
  focusAreas: FocusArea[],
  shiftCategories: ShiftCategory[],
  shiftCodes: ShiftCode[],
  requirements: CoverageRequirement[],
  dates: Date[],
  employeesByFocusArea: Map<number, Employee[]>,
  shiftCodeIdsForKey: (empId: string, date: Date) => number[],
  shiftCodeIdsByFocusArea: Map<number, Set<number>>,
  shiftCodeDisplayMap?: Map<number, string>,
): CoverageCategorySnapshot[] {
  const snapshots: CoverageCategorySnapshot[] = [];
  const categoryById = new Map(shiftCategories.map((category) => [category.id, category]));
  const activeShiftCodes = shiftCodes.filter((shiftCode) => !shiftCode.archivedAt);
  const activeShiftCodeById = new Map(
    activeShiftCodes.map((shiftCode) => [shiftCode.id, shiftCode]),
  );
  const requirementShiftCodeIdsByGroup = new Map<string, number[]>();

  for (const requirement of requirements) {
    const shiftCode = activeShiftCodeById.get(requirement.shiftCodeId);
    if (!shiftCode) continue;
    const groupKey = `${requirement.focusAreaId}:${shiftCode.categoryId ?? 0}`;
    const group = requirementShiftCodeIdsByGroup.get(groupKey) ?? [];
    if (!group.includes(requirement.shiftCodeId)) {
      group.push(requirement.shiftCodeId);
      requirementShiftCodeIdsByGroup.set(groupKey, group);
    }
  }

  for (const focusArea of focusAreas) {
    const employees = employeesByFocusArea.get(focusArea.id) ?? [];
    const sectionCodeIds = shiftCodeIdsByFocusArea.get(focusArea.id) ?? new Set();

    for (const [groupKey, requirementShiftCodeIds] of requirementShiftCodeIdsByGroup.entries()) {
      const [groupFocusAreaIdRaw, shiftCategoryIdRaw] = groupKey.split(":");
      if (Number(groupFocusAreaIdRaw) !== focusArea.id) continue;

      const shiftCategoryId = Number(shiftCategoryIdRaw);
      const eligibleShiftCodes = activeShiftCodes
        .filter(
          (shiftCode) =>
            sectionCodeIds.has(shiftCode.id) &&
            (shiftCode.categoryId ?? 0) === shiftCategoryId,
        )
        .sort(compareShiftCodes);
      if (eligibleShiftCodes.length === 0) continue;

      const sortedRequirementShiftCodeIds = [...requirementShiftCodeIds].sort((leftId, rightId) => {
        const left = activeShiftCodeById.get(leftId);
        const right = activeShiftCodeById.get(rightId);
        if (!left || !right) return leftId - rightId;
        return compareShiftCodes(left, right);
      });

      for (const date of dates) {
        const dayOfWeek = date.getDay();
        let totalRequired = 0;
        const shortageDetails: CoverageShortageDetail[] = [];

        for (const shiftCodeId of sortedRequirementShiftCodeIds) {
          const shiftCode = activeShiftCodeById.get(shiftCodeId);
          if (!shiftCode) continue;

          const requirement = resolveRequirement(
            requirements,
            focusArea.id,
            shiftCodeId,
            dayOfWeek,
          );
          if (!requirement || requirement.minStaff <= 0) continue;

          totalRequired += requirement.minStaff;

          const exactStatus = computeCoverageStatus(
            employees,
            date,
            shiftCodeIdsForKey,
            sectionCodeIds,
            [shiftCodeId],
            requirement,
          );
          const shortage = Math.max(requirement.minStaff - exactStatus.actual, 0);
          if (shortage > 0) {
            shortageDetails.push({
              shiftCodeId,
              shiftCodeLabel: getShiftCodeDisplayLabel(shiftCode, shiftCodeDisplayMap),
              required: requirement.minStaff,
              actual: exactStatus.actual,
              shortage,
            });
          }
        }

        if (totalRequired <= 0) continue;

        const status = computeCoverageStatus(
          employees,
          date,
          shiftCodeIdsForKey,
          sectionCodeIds,
          eligibleShiftCodes.map((shiftCode) => shiftCode.id),
          { minStaff: totalRequired },
        );
        const preferredOpenShiftCodeId =
          shortageDetails[0]?.shiftCodeId ??
          sortedRequirementShiftCodeIds[0] ??
          eligibleShiftCodes[0].id;

        snapshots.push({
          focusAreaId: focusArea.id,
          focusAreaName: focusArea.name,
          shiftCategoryId,
          shiftCategoryName:
            categoryById.get(shiftCategoryId)?.name ?? "Uncategorized",
          date,
          status,
          eligibleShiftCodeIds: eligibleShiftCodes.map((shiftCode) => shiftCode.id),
          preferredOpenShiftCodeId,
          shortageDetails,
        });
      }
    }
  }

  return snapshots;
}

/**
 * Computes all category-level coverage gaps across all focus areas and dates.
 */
export function computeCoverageGaps(
  focusAreas: FocusArea[],
  shiftCategories: ShiftCategory[],
  shiftCodes: ShiftCode[],
  requirements: CoverageRequirement[],
  coverageRuleConfigs: CoverageRuleConfig[],
  dates: Date[],
  employeesByFocusArea: Map<number, Employee[]>,
  shiftCodeIdsForKey: (empId: string, date: Date) => number[],
  shiftCodeById: Map<number, ShiftCode>,
  shiftCodeIdsByFocusArea: Map<number, Set<number>>,
  shiftCodeDisplayMap?: Map<number, string>,
): CoverageGap[] {
  void coverageRuleConfigs;
  void shiftCodeById;

  return computeCoverageCategorySnapshots(
    focusAreas,
    shiftCategories,
    shiftCodes,
    requirements,
    dates,
    employeesByFocusArea,
    shiftCodeIdsForKey,
    shiftCodeIdsByFocusArea,
    shiftCodeDisplayMap,
  )
    .filter((snapshot) => snapshot.status.hasRequirement && !snapshot.status.isMet)
    .map((snapshot) => ({
      focusAreaId: snapshot.focusAreaId,
      focusAreaName: snapshot.focusAreaName,
      requirementShiftCodeId: snapshot.preferredOpenShiftCodeId,
      shiftCodeId: snapshot.preferredOpenShiftCodeId,
      ruleLabel: snapshot.shiftCategoryName,
      shiftCodeLabel: snapshot.shiftCategoryName,
      eligibleShiftCodeIds: snapshot.eligibleShiftCodeIds,
      preferredOpenShiftCodeId: snapshot.preferredOpenShiftCodeId,
      shiftCategoryId: snapshot.shiftCategoryId,
      shiftCategoryName: snapshot.shiftCategoryName,
      date: snapshot.date,
      status: snapshot.status,
      shortageDetails: snapshot.shortageDetails,
    }));
}

/**
 * Expands publish-history date ranges into a Set of "YYYY-MM-DD" keys.
 * Used to check whether a given date has ever been published (O(1) lookup).
 */
export function buildPublishedDateSet(
  ranges: { startDate: string; endDate: string }[],
): Set<string> {
  const set = new Set<string>();
  for (const { startDate, endDate } of ranges) {
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    for (const { dateKey } of iterateDateRange(start, end)) {
      set.add(dateKey);
    }
  }
  return set;
}

/**
 * Returns only the visible dates that have been published at least once.
 */
export function filterPublishedDates(
  dates: Date[],
  publishedDateSet: Set<string>,
): Date[] {
  return dates.filter((date) => publishedDateSet.has(formatDateKey(date)));
}

/**
 * Summarizes whether the visible window is unpublished, partially published,
 * or fully published. Empty windows default to "published" so non-grid views
 * (for example month view) do not show misleading unpublished messaging.
 */
export function getPublishedWindowState(
  dates: Date[],
  publishedDateSet: Set<string>,
): PublishedWindowState {
  if (dates.length === 0) return "published";
  const publishedDates = filterPublishedDates(dates, publishedDateSet);
  if (publishedDates.length === 0) return "unpublished";
  if (publishedDates.length < dates.length) return "partial";
  return "published";
}
