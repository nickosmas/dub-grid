import { describe, expect, it } from "vitest";
import type { FocusArea, JobDefinition, ShiftCategory } from "@/types";
import {
  preferenceLines,
  preferenceWarnings,
  shiftGroupTag,
  workLimitWarnings,
  type PreferenceLookups,
} from "./shift-preference-notes";

const lookups: PreferenceLookups = {
  shiftCategories: [
    { id: 1, name: "Day Shift" },
    { id: 2, name: "Evening Shift" },
  ] as unknown as ShiftCategory[],
  focusAreas: [] as FocusArea[],
  jobs: [
    { id: 10, name: "CNA" },
    { id: 11, name: "Med Aide" },
    { id: 12, name: "Shift only", systemKey: "default_shift_job" },
  ] as unknown as JobDefinition[],
};

const onlyEvening = { mode: "only" as const, shiftIds: [2] };
const onlyCna = { mode: "only" as const, jobIds: [10] };

describe("preferenceLines", () => {
  it("names each preference the person has, shift first", () => {
    expect(
      preferenceLines(
        { shift: { mode: "prefers", shiftIds: [1] }, job: onlyCna, firstName: "Aisha" },
        lookups,
      ),
    ).toEqual([
      { label: "Shift preference", value: "Prefers Day Shift" },
      { label: "Job preference", value: "Only CNA" },
    ]);
  });

  it("leaves out shifts the organization no longer has, and empty preferences", () => {
    expect(
      preferenceLines(
        {
          shift: { mode: "only", shiftIds: [2, 99] },
          job: { mode: "only", jobIds: [99] },
          firstName: "A",
        },
        lookups,
      ),
    ).toEqual([{ label: "Shift preference", value: "Only Evening Shift" }]);
    expect(preferenceLines(undefined, lookups)).toEqual([]);
  });
});

describe("shiftGroupTag", () => {
  it("tags the groups a shift preference names", () => {
    const prefers = { shift: { mode: "prefers" as const, shiftIds: [1] }, firstName: "A" };
    expect(shiftGroupTag(prefers, 1)).toBe("Preferred");
    expect(shiftGroupTag({ shift: onlyEvening, firstName: "A" }, 2)).toBe("Only");
    expect(shiftGroupTag(prefers, 2)).toBeNull();
    expect(shiftGroupTag(prefers, null)).toBeNull();
  });
});

describe("preferenceWarnings", () => {
  const prefs = { shift: onlyEvening, job: onlyCna, firstName: "Aisha" };

  it("names the shift and the job outside an Only preference", () => {
    expect(preferenceWarnings(prefs, { shiftId: 1, jobId: 11 }, lookups)).toEqual([
      {
        lead: "Day Shift is outside Aisha's preference.",
        label: "Shift preference",
        value: "Only Evening Shift",
      },
      {
        lead: "Med Aide job is outside Aisha's preference.",
        label: "Job preference",
        value: "Only CNA",
      },
    ]);
  });

  it("says nothing inside the preference, for Prefers, or for work with no shift", () => {
    expect(preferenceWarnings(prefs, { shiftId: 2, jobId: 10 }, lookups)).toEqual([]);
    expect(
      preferenceWarnings(
        { shift: { mode: "prefers", shiftIds: [2] }, firstName: "Aisha" },
        { shiftId: 1, jobId: 10 },
        lookups,
      ),
    ).toEqual([]);
    expect(preferenceWarnings(prefs, { shiftId: null, jobId: 11 }, lookups)).toEqual([]);
  });

  it("doesn't name the shift-only system job", () => {
    expect(
      preferenceWarnings({ job: onlyCna, firstName: "Aisha" }, { shiftId: 2, jobId: 12 }, lookups),
    ).toEqual([
      { lead: "Outside Aisha's preference.", label: "Job preference", value: "Only CNA" },
    ]);
  });
});

describe("workLimitWarnings", () => {
  it("names the run with its dates, across a month end", () => {
    expect(
      workLimitWarnings([{ limit: "row", days: 6, start: "2026-11-25", end: "2026-11-30" }], "Ana"),
    ).toEqual([
      {
        lead: "This makes 6 days in a row for Ana.",
        label: "Days in a row",
        value: "Wed, Nov 25 to Mon, Nov 30",
      },
    ]);
  });

  it("names the week's days and hours, with a half hour", () => {
    const week = { start: "2026-11-29", end: "2026-12-05" };
    expect(
      workLimitWarnings(
        [
          { limit: "week", days: 6, ...week },
          { limit: "hours", hours: 42.5, ...week },
        ],
        "Ana",
      ),
    ).toEqual([
      {
        lead: "This makes 6 days in Ana's week.",
        label: "Week",
        value: "Sun, Nov 29 to Sat, Dec 5",
      },
      {
        lead: "This makes 42.5 hours in Ana's week.",
        label: "Week",
        value: "Sun, Nov 29 to Sat, Dec 5",
      },
    ]);
  });

  it("names nothing when no limit is crossed", () => {
    expect(workLimitWarnings([], "Ana")).toEqual([]);
  });
});
