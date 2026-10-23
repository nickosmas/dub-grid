import type { CoverageRuledOut, CoverageSuggestion } from "./coverage-suggestions";
import type { CoverageStatus } from "./coverage";
import { parseLocalDateKey } from "./dates";

export interface CoverageSuggestionTextLookups {
  personName: (employeeId: string) => string | null;
  assignmentName: (assignmentId: number) => string;
  assignmentFocusAreaId: (assignmentId: number) => number | null;
  focusAreaName: (focusAreaId: number) => string | null;
  absenceName: (absenceTypeId: number) => string;
  /** A requirement row as the matrix names it, "Skilled Nursing · Day Shift · Med Aide". */
  rowLabel: (rowKey: string) => string | null;
  /** The shared short date, "Sat, Oct 24". */
  formatDate: (dateKey: string) => string;
}

export interface CoverageSuggestionText {
  /** The whole action: who, which shift, and when. */
  title: string;
  /** Why it is suggested. */
  detail: string;
  /** What applying it does; null for a pattern, which is advice. */
  outcome: string | null;
  /** What it fixes in one line; null for a pattern. */
  effect: string | null;
  /** One line per cell it changes: when, which requirement, now and after. */
  changes: string[];
}

const DRAFT_OUTCOME = "Changes the draft only. Staff see it after you publish.";
const APPROVAL_OUTCOME =
  "Publishes right away: staff see it without a publish, and it replaces any draft of that day.";

function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

function personOf(lookups: CoverageSuggestionTextLookups, employeeId: string | null): string {
  return (employeeId == null ? null : lookups.personName(employeeId)) ?? "Someone";
}

/** Work names joined with "and", each with its focus area when that is not `focusAreaId`. */
function describeWork(
  lookups: CoverageSuggestionTextLookups,
  assignmentIds: number[],
  focusAreaId: number,
): string {
  return assignmentIds
    .map((assignmentId) => {
      const name = lookups.assignmentName(assignmentId);
      const areaId = lookups.assignmentFocusAreaId(assignmentId);
      const area = areaId != null && areaId !== focusAreaId ? lookups.focusAreaName(areaId) : null;
      return area ? `${name} in ${area}` : name;
    })
    .join(" and ");
}

function statusWord(status: CoverageStatus): string {
  const gap = status.required - status.actual;
  if (gap > 0) return `still short ${formatNumber(gap)}`;
  if (gap < 0) return `${formatNumber(-gap)} over`;
  return "staffed";
}

function countText(status: CoverageStatus): string {
  return `${formatNumber(status.actual)}/${formatNumber(status.required)}`;
}

/** Every cell whose draft count the suggestion moves, in date order. */
function changeLines(
  suggestion: CoverageSuggestion,
  lookups: CoverageSuggestionTextLookups,
): string[] {
  return suggestion.effects
    .filter((effect) => effect.draftBefore.actual !== effect.draftAfter.actual)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.rowKey.localeCompare(b.rowKey))
    .map((effect) => {
      const row = lookups.rowLabel(effect.rowKey) ?? "This requirement";
      return `${lookups.formatDate(effect.dateKey)} · ${row}: ${countText(
        effect.draftBefore,
      )} staffed now, ${countText(effect.draftAfter)} after (${statusWord(effect.draftAfter)})`;
    });
}

/** The summary: the gaps it closes, or how much it fills when it closes none. */
function effectLine(suggestion: CoverageSuggestion): string {
  let line: string;
  if (suggestion.closes > 0) {
    line = `Closes ${suggestion.closes} ${suggestion.closes === 1 ? "gap" : "gaps"}`;
  } else {
    line = `Fills ${formatNumber(suggestion.filled)} ${suggestion.filled === 1 ? "spot" : "spots"}`;
  }
  if (suggestion.clearsOver > 0) line += `, and clears ${suggestion.clearsOver} over`;
  return line;
}

/** The lines Coverage Check shows for one suggestion. */
export function describeCoverageSuggestion(
  suggestion: CoverageSuggestion,
  lookups: CoverageSuggestionTextLookups,
): CoverageSuggestionText {
  const { subject } = suggestion;
  const name = personOf(lookups, suggestion.employeeId);
  // The shift's own focus area: two areas can each have a "Day Shift", and
  // without it their suggestions read the same.
  const shiftAreaId = lookups.assignmentFocusAreaId(subject.assignmentId) ?? subject.focusAreaId;
  const area = lookups.focusAreaName(shiftAreaId) ?? lookups.focusAreaName(subject.focusAreaId);
  const shiftName = lookups.assignmentName(subject.assignmentId);
  const shift = area ? `${shiftName} in ${area}` : shiftName;
  const date = lookups.formatDate(subject.dateKey);
  const measured = {
    outcome: suggestion.final ? APPROVAL_OUTCOME : DRAFT_OUTCOME,
    effect: effectLine(suggestion),
    changes: changeLines(suggestion, lookups),
  };

  switch (suggestion.kind) {
    case "moveBack":
      if (subject.otherDateKey) {
        return {
          title: `Move ${name}'s ${shift} from ${lookups.formatDate(
            subject.otherDateKey,
          )} back to ${date}`,
          detail: `It was published on ${date}, and this draft moved it.`,
          ...measured,
        };
      }
      return {
        title: `Change ${name} back to ${shift} on ${date}`,
        detail: `It was published as ${shiftName}, and this draft changed it to ${describeWork(
          lookups,
          subject.otherAssignmentIds,
          subject.focusAreaId,
        )}.`,
        ...measured,
      };
    case "restore":
      return {
        title: `Restore ${name}'s ${shift} on ${date}`,
        detail: "It was published, and this draft removed it with no absence or request recorded.",
        ...measured,
      };
    case "assign": {
      const also =
        subject.otherAssignmentIds.length > 0
          ? ` Also works ${describeWork(lookups, subject.otherAssignmentIds, subject.focusAreaId)} that day.`
          : "";
      return {
        title: `Schedule ${name} for ${shift} on ${date}`,
        detail: `Qualified for this shift and free at that time.${also}`,
        ...measured,
      };
    }
    case "approvePickup":
      return {
        title: `Approve ${name}'s pickup request for ${shift} on ${date}`,
        detail: `${name} asked to pick up this shift, and the request is waiting for approval.`,
        ...measured,
      };
    case "pattern": {
      const weekday = parseLocalDateKey(subject.dateKey).toLocaleDateString("en-US", {
        weekday: "long",
      });
      return {
        title: `${lookups.rowLabel(subject.rowKey) ?? shift} is short every ${weekday} in this period`,
        detail:
          "Nobody qualified is free on those days. A repeating shift would stop it recurring.",
        outcome: null,
        effect: null,
        changes: [],
      };
    }
  }
}

function reasonText(entry: CoverageRuledOut, lookups: CoverageSuggestionTextLookups): string {
  const { reason } = entry;
  switch (reason.kind) {
    case "absence":
      return `${lookups.absenceName(reason.absenceTypeId)} that day`;
    case "restOfDayAbsence":
      return `${lookups.absenceName(reason.absenceTypeId)} for the rest of the day`;
    case "overlap": {
      const shift = lookups.assignmentName(reason.assignmentId);
      if (reason.dateKey === entry.dateKey) return `works ${shift} that day, which overlaps`;
      const date = lookups.formatDate(reason.dateKey);
      return reason.dateKey < entry.dateKey
        ? `works ${shift} on ${date}, which runs into this shift`
        : `works ${shift} on ${date}, which starts before this one ends`;
    }
    case "unverified":
      return `${lookups.formatDate(reason.dateKey)} isn't loaded, so it couldn't be checked`;
    case "request":
      return "has a request waiting that day";
    case "workRun":
      return `would work ${reason.days} days in a row`;
    case "workWeek":
      return `would work ${reason.days} days that week`;
    case "doubleShift":
      return "already works that day";
    case "onlyShifts":
      return "works only their chosen shifts";
  }
}

/** Just the reason, for lists that already name the person and the date. */
export function describeCoverageRuledOutReason(
  entry: CoverageRuledOut,
  lookups: CoverageSuggestionTextLookups,
): string {
  return reasonText(entry, lookups);
}

/** One "Not suggested" line: who, and why. */
export function describeCoverageRuledOut(
  entry: CoverageRuledOut,
  lookups: CoverageSuggestionTextLookups,
): string {
  const name = personOf(lookups, entry.employeeId);
  const who = entry.requestId ? `${name}'s pickup request` : name;
  return `${who}: ${reasonText(entry, lookups)}`;
}
