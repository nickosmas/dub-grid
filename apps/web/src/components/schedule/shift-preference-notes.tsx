"use client";

import { shiftDisplayName } from "@dubgrid/domain";
import {
  onlyPreferenceBreaks,
  parseLocalDateKey,
  type CoverageJobPreference,
  type CoverageShiftPreference,
  type WorkLimitBreak,
} from "@dubgrid/schedule-core";
import {
  formatCoverageNumber,
  formatShortDate,
} from "@/components/coverage-check/coverage-check-text";
import { Banner } from "@/components/ui/Banner";
import { describePreference } from "@/components/staff/PreferencesModal";
import { isDefaultShiftSystemJob } from "@/lib/system-jobs";
import type { FocusArea, JobDefinition, ShiftCategory } from "@/types";

/** The person's preferences, as the shift editor shows them (item 58). */
export interface ShiftEditorPreferences {
  shift?: CoverageShiftPreference;
  job?: CoverageJobPreference;
  /** Names the person in a warning. */
  firstName: string;
}

export interface PreferenceLookups {
  shiftCategories: ShiftCategory[];
  focusAreas: FocusArea[];
  jobs: JobDefinition[];
}

function namers({ shiftCategories, focusAreas, jobs }: PreferenceLookups) {
  const focusAreaName = (id: number) => focusAreas.find((area) => area.id === id)?.name;
  return {
    shiftName: (id: number) => {
      const shift = shiftCategories.find((item) => item.id === id);
      return shift ? shiftDisplayName(shift, shiftCategories, focusAreaName) : undefined;
    },
    jobName: (id: number) => jobs.find((job) => job.id === id)?.name,
  };
}

/** "Only Evening Shift", leaving out what the organization no longer has; null when nothing is left. */
function describeKnown(
  mode: "prefers" | "only",
  ids: number[],
  name: (id: number) => string | undefined,
): string | null {
  const known = ids.filter((id) => name(id));
  return known.length > 0 ? describePreference({ mode, ids: known }, name) : null;
}

export function preferenceLines(
  preferences: ShiftEditorPreferences | undefined,
  lookups: PreferenceLookups,
) {
  const { shiftName, jobName } = namers(lookups);
  const shift =
    preferences?.shift &&
    describeKnown(preferences.shift.mode, preferences.shift.shiftIds, shiftName);
  const job =
    preferences?.job && describeKnown(preferences.job.mode, preferences.job.jobIds, jobName);
  return [
    shift ? { label: "Shift preference", value: shift } : null,
    job ? { label: "Job preference", value: job } : null,
  ].filter((line) => line != null);
}

/** "Preferred" or "Only" for a shift group the person's shift preference names. */
export function shiftGroupTag(
  preferences: ShiftEditorPreferences | undefined,
  shiftId: number | null,
): string | null {
  const shift = preferences?.shift;
  if (!shift || shiftId == null || !shift.shiftIds.includes(shiftId)) return null;
  return shift.mode === "only" ? "Only" : "Preferred";
}

/** "Day Shift is outside Aisha's preference." then "Shift preference: Only Evening Shift". */
export interface PreferenceWarning {
  lead: string;
  label: string;
  value: string | null;
}

/**
 * One warning per Only preference the work breaks. Absences never come here,
 * and work with no shift (Orientation, Training) never warns.
 */
export function preferenceWarnings(
  preferences: ShiftEditorPreferences | undefined,
  work: { shiftId: number | null; jobId: number | null },
  lookups: PreferenceLookups,
): PreferenceWarning[] {
  if (!preferences || work.shiftId == null) return [];
  const breaks = onlyPreferenceBreaks(work.shiftId, work.jobId, preferences.shift, preferences.job);
  const { shiftName, jobName } = namers(lookups);
  const warning = (
    named: string | null | undefined,
    label: string,
    value: string | null,
  ): PreferenceWarning => ({
    lead: `${named ? `${named} is outside` : "Outside"} ${preferences.firstName}'s preference.`,
    label,
    value,
  });
  const warnings: PreferenceWarning[] = [];
  if (breaks.shift && preferences.shift) {
    // The panel shows the shift's area already, so its own name is enough here.
    const named = lookups.shiftCategories.find((shift) => shift.id === work.shiftId)?.name;
    const value = describeKnown("only", preferences.shift.shiftIds, shiftName);
    warnings.push(warning(named, "Shift preference", value));
  }
  if (breaks.job && preferences.job) {
    const job = lookups.jobs.find((item) => item.id === work.jobId);
    // "Supervisor job", so a job name never reads as a shift.
    const named = job && !isDefaultShiftSystemJob(job) ? `${job.name} job` : null;
    const value = describeKnown("only", preferences.job.jobIds, jobName);
    warnings.push(warning(named, "Job preference", value));
  }
  return warnings;
}

function dateSpan(start: string, end: string): string {
  return `${formatShortDate(parseLocalDateKey(start))} to ${formatShortDate(parseLocalDateKey(end))}`;
}

/** "This makes 6 days in a row for Ana." then "Days in a row: Wed, Nov 25 to Mon, Nov 30" (60a). */
export function workLimitWarnings(
  breaks: ReadonlyArray<WorkLimitBreak>,
  firstName: string,
): PreferenceWarning[] {
  return breaks.map((limit) => {
    const value = dateSpan(limit.start, limit.end);
    if (limit.limit === "row") {
      return {
        lead: `This makes ${limit.days} days in a row for ${firstName}.`,
        label: "Days in a row",
        value,
      };
    }
    const amount =
      limit.limit === "week" ? `${limit.days} days` : `${formatCoverageNumber(limit.hours)} hours`;
    return { lead: `This makes ${amount} in ${firstName}'s week.`, label: "Week", value };
  });
}

export function PreferenceBanner({
  preferences,
  lookups,
}: {
  preferences: ShiftEditorPreferences | undefined;
  lookups: PreferenceLookups;
}) {
  const lines = preferenceLines(preferences, lookups);
  if (lines.length === 0) return null;
  return (
    <Banner tone="info" aria-label="Preferences">
      {lines.map((line) => (
        <span key={line.label}>
          {line.label}: <strong className="font-semibold">{line.value}</strong>
        </span>
      ))}
    </Banner>
  );
}

export function PreferenceTag({ label }: { label: string }) {
  return (
    <span className="shrink-0 self-center whitespace-nowrap rounded-full bg-[var(--dg-color-bg-secondary)] px-2 text-[length:var(--dg-fs-badge)] font-semibold leading-[18px] text-[var(--dg-color-text-secondary)]">
      {label}
    </span>
  );
}

export function PreferenceWarnings({ warnings }: { warnings: PreferenceWarning[] }) {
  const unique = [...new Map(warnings.map((w) => [`${w.lead}|${w.label}`, w])).values()];
  if (unique.length === 0) return null;
  return (
    <Banner tone="warning" role="status" className="mb-4">
      {unique.map((warning) => (
        <span key={`${warning.lead}|${warning.label}`} className="flex flex-col">
          <span>{warning.lead}</span>
          {warning.value ? (
            <span>
              {warning.label}: <strong className="font-semibold">{warning.value}</strong>
            </span>
          ) : null}
        </span>
      ))}
    </Banner>
  );
}
