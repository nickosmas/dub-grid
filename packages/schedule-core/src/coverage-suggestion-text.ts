import type { CoverageRuledOut, CoverageSuggestion } from "./coverage-suggestions";
import { parseLocalDateKey } from "./dates";

export interface CoverageSuggestionTextLookups {
  personName: (employeeId: string) => string | null;
  assignmentName: (assignmentId: number) => string;
  assignmentFocusAreaId: (assignmentId: number) => number | null;
  focusAreaName: (focusAreaId: number) => string | null;
  absenceName: (absenceTypeId: number) => string;
  /** The shared short date, "Sat, Oct 24". */
  formatDate: (dateKey: string) => string;
}

export interface CoverageSuggestionText {
  title: string;
  detail: string;
  /** What it fixes, from the measured effects; null for a pattern. */
  effect: string | null;
}

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

function effectLine(
  suggestion: CoverageSuggestion,
  lookups: CoverageSuggestionTextLookups,
): string {
  const { subject } = suggestion;
  let line: string;
  if (suggestion.closes > 0) {
    line = `Closes ${suggestion.closes} ${suggestion.closes === 1 ? "gap" : "gaps"}`;
  } else {
    const effect = suggestion.effects.find(
      (candidate) => candidate.rowKey === subject.rowKey && candidate.dateKey === subject.dateKey,
    );
    const left = effect
      ? Math.max(0, effect.draftAfter.required - effect.draftAfter.actual)
      : suggestion.filled;
    line = `Still short ${formatNumber(left)} on ${lookups.formatDate(subject.dateKey)} after this`;
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
  const shift = lookups.assignmentName(subject.assignmentId);
  const area = lookups.focusAreaName(subject.focusAreaId) ?? "";
  const date = lookups.formatDate(subject.dateKey);

  switch (suggestion.kind) {
    case "moveBack":
      if (subject.otherDateKey) {
        return {
          title: `Move ${name}'s ${shift} back to ${date}`,
          detail: `${area}. This draft moved it to ${lookups.formatDate(subject.otherDateKey)}.`,
          effect: effectLine(suggestion, lookups),
        };
      }
      return {
        title: `Move ${name} back to ${shift}`,
        detail: `${area}, ${date}. This draft changed it to ${describeWork(
          lookups,
          subject.otherAssignmentIds,
          subject.focusAreaId,
        )}.`,
        effect: effectLine(suggestion, lookups),
      };
    case "restore":
      return {
        title: `Restore ${name}'s ${shift}`,
        detail: `${area}, ${date}. Removed in this draft with no absence or request recorded.`,
        effect: effectLine(suggestion, lookups),
      };
    case "assign": {
      const also =
        subject.otherAssignmentIds.length > 0
          ? ` Also works ${describeWork(lookups, subject.otherAssignmentIds, subject.focusAreaId)} that day.`
          : "";
      return {
        title: `Schedule ${name} for ${shift} on ${date}`,
        detail: `${area}. Qualified and free that day.${also}`,
        effect: effectLine(suggestion, lookups),
      };
    }
    case "approvePickup":
      return {
        title: `Approve ${name}'s pickup request`,
        detail: `${area} ${shift}, ${date}. Takes effect for staff right away, without a publish.`,
        effect: effectLine(suggestion, lookups),
      };
    case "pattern": {
      const weekday = parseLocalDateKey(subject.dateKey).toLocaleDateString("en-US", {
        weekday: "long",
      });
      return {
        title: `${area} ${shift} is short every ${weekday} in this period`,
        detail:
          "Nobody qualified is free on those days. A repeating shift would stop it recurring.",
        effect: null,
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
  }
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
