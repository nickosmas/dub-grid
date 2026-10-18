import { describe, expect, it } from "vitest";
import {
  buildEmployeeNameById,
  daysBetweenDateKeys,
  fetchWindowContains,
  formatImportPreviousSkipDescription,
  getFirstPaintRange,
  getFullFetchWindow,
  getInitialFetchWindow,
  getSkipReasonLabel,
  mergeLoadedWindows,
  summarizeImportPreviousOutcomes,
  widenFetchWindow,
} from "./operations";
import type { ImportPreviousScheduleOutcome } from "@/features/schedule/client";

function row(
  overrides: Partial<ImportPreviousScheduleOutcome> = {},
): ImportPreviousScheduleOutcome {
  return {
    employeeId: "emp-1",
    sourceDate: "2026-06-14",
    targetDate: "2026-06-28",
    outcome: "imported",
    reason: null,
    ...overrides,
  };
}

describe("summarizeImportPreviousOutcomes", () => {
  it("counts every documented reason and keeps totals consistent", () => {
    const outcomes: ImportPreviousScheduleOutcome[] = [
      row({ outcome: "imported", reason: null }),
      row({ outcome: "imported", reason: null }),
      row({ outcome: "skipped", reason: "target_has_data" }),
      row({ outcome: "skipped", reason: "target_has_data" }),
      row({ outcome: "skipped", reason: "employee_inactive" }),
      row({ outcome: "skipped", reason: "disqualified:focus_area" }),
      row({ outcome: "skipped", reason: "disqualified:role" }),
      row({ outcome: "skipped", reason: "disqualified:cert" }),
      row({ outcome: "skipped", reason: "source_has_no_content" }),
    ];
    const breakdown = summarizeImportPreviousOutcomes(outcomes);

    expect(breakdown.totalSource).toBe(9);
    expect(breakdown.imported).toBe(2);
    expect(breakdown.totalSkipped).toBe(7);
    expect(breakdown.skippedTargetHasData).toBe(2);
    expect(breakdown.skippedEmployeeInactive).toBe(1);
    expect(breakdown.disqualifiedFocusArea).toBe(1);
    expect(breakdown.disqualifiedRole).toBe(1);
    expect(breakdown.disqualifiedCert).toBe(1);
    expect(breakdown.skippedSourceEmpty).toBe(1);
    expect(breakdown.skippedOther).toBe(0);
    expect(breakdown.imported + breakdown.totalSkipped).toBe(breakdown.totalSource);
  });

  it("buckets unknown skip reasons into skippedOther so totals stay tight", () => {
    const outcomes: ImportPreviousScheduleOutcome[] = [
      row({ outcome: "skipped", reason: "future_reason_we_havent_modeled" }),
      row({ outcome: "skipped", reason: null }),
    ];
    const breakdown = summarizeImportPreviousOutcomes(outcomes);
    expect(breakdown.skippedOther).toBe(2);
    expect(breakdown.imported + breakdown.totalSkipped).toBe(2);
  });

  it("returns a zeroed breakdown for an empty result set", () => {
    const breakdown = summarizeImportPreviousOutcomes([]);
    expect(breakdown).toEqual({
      imported: 0,
      skippedTargetHasData: 0,
      skippedEmployeeInactive: 0,
      skippedSourceEmpty: 0,
      disqualifiedFocusArea: 0,
      disqualifiedRole: 0,
      disqualifiedCert: 0,
      skippedOther: 0,
      totalSource: 0,
      totalSkipped: 0,
    });
  });
});

describe("formatImportPreviousSkipDescription", () => {
  it("returns an empty string when nothing was skipped", () => {
    const outcomes = [row({ outcome: "imported" })];
    const breakdown = summarizeImportPreviousOutcomes(outcomes);
    expect(formatImportPreviousSkipDescription(outcomes, breakdown, new Map())).toBe("");
  });

  it("groups qualification reasons under one count and names example employees", () => {
    const outcomes: ImportPreviousScheduleOutcome[] = [
      row({
        employeeId: "sarah",
        targetDate: "2026-07-03",
        outcome: "skipped",
        reason: "disqualified:focus_area",
      }),
      row({
        employeeId: "thomas",
        targetDate: "2026-07-05",
        outcome: "skipped",
        reason: "disqualified:role",
      }),
      row({
        employeeId: "doug",
        targetDate: "2026-07-06",
        outcome: "skipped",
        reason: "employee_inactive",
      }),
    ];
    const breakdown = summarizeImportPreviousOutcomes(outcomes);
    const names = new Map([
      ["sarah", "Sarah Kim"],
      ["thomas", "Thomas Crawford"],
      ["doug", "Doug Beale"],
    ]);

    const description = formatImportPreviousSkipDescription(outcomes, breakdown, names);
    expect(description).toContain("1 employee no longer active");
    expect(description).toContain("2 qualification changes");
    expect(description).toContain("Sarah Kim on 7/3");
    expect(description).toContain("Thomas Crawford on 7/5");
    expect(description).toContain("Doug Beale on 7/6");
  });

  it("uses a generic label for unknown employees", () => {
    const outcomes: ImportPreviousScheduleOutcome[] = [
      row({
        employeeId: "ghost",
        targetDate: "2026-07-04",
        outcome: "skipped",
        reason: "employee_inactive",
      }),
    ];
    const breakdown = summarizeImportPreviousOutcomes(outcomes);
    const description = formatImportPreviousSkipDescription(outcomes, breakdown, new Map());
    expect(description).toContain("an employee on 7/4");
  });

  it("names inactive and removed employees when the historical directory includes them", () => {
    const outcomes: ImportPreviousScheduleOutcome[] = [
      row({
        employeeId: "inactive",
        targetDate: "2026-07-04",
        outcome: "skipped",
        reason: "employee_inactive",
      }),
      row({
        employeeId: "removed",
        targetDate: "2026-07-05",
        outcome: "skipped",
        reason: "employee_inactive",
      }),
    ];
    const names = buildEmployeeNameById([
      { id: "active", firstName: "Active", lastName: "Staff" },
      { id: "inactive", firstName: "Ina", lastName: "Active" },
      { id: "removed", firstName: "Riley", lastName: "Stone" },
    ]);

    const description = formatImportPreviousSkipDescription(
      outcomes,
      summarizeImportPreviousOutcomes(outcomes),
      names,
    );

    expect(description).toContain("Ina Active on 7/4");
    expect(description).toContain("Riley Stone on 7/5");
    expect(description).not.toContain("an employee");
  });
});

describe("getSkipReasonLabel", () => {
  it("labels each documented reason code", () => {
    expect(getSkipReasonLabel("target_has_data")).toBe("Target already had data");
    expect(getSkipReasonLabel("employee_inactive")).toBe("Employee no longer active");
    expect(getSkipReasonLabel("source_has_no_content")).toBe("Source cell had no usable content");
    expect(getSkipReasonLabel("disqualified:focus_area")).toBe("Qualification change");
    expect(getSkipReasonLabel("disqualified:role")).toBe("Qualification change");
    expect(getSkipReasonLabel("disqualified:cert")).toBe("Qualification change");
  });

  it("falls back to a generic label for an undocumented reason", () => {
    expect(getSkipReasonLabel("something_new")).toBe("Skipped for other reasons");
    expect(getSkipReasonLabel(null)).toBe("Skipped for other reasons");
  });
});

describe("widenFetchWindow", () => {
  it("returns the default window when no ensure bounds are provided", () => {
    expect(widenFetchWindow("2026-04-01", "2026-08-01")).toEqual({
      start: "2026-04-01",
      end: "2026-08-01",
    });
  });

  it("returns the default window when ensure bounds are already inside it", () => {
    expect(
      widenFetchWindow("2026-04-01", "2026-08-01", {
        ensureStart: "2026-05-01",
        ensureEnd: "2026-07-01",
      }),
    ).toEqual({ start: "2026-04-01", end: "2026-08-01" });
  });

  it("widens the start when ensureStart precedes the default start", () => {
    expect(
      widenFetchWindow("2026-04-01", "2026-08-01", {
        ensureStart: "2025-12-15",
      }),
    ).toEqual({ start: "2025-12-15", end: "2026-08-01" });
  });

  it("widens the end when ensureEnd follows the default end", () => {
    expect(
      widenFetchWindow("2026-04-01", "2026-08-01", {
        ensureEnd: "2027-01-14",
      }),
    ).toEqual({ start: "2026-04-01", end: "2027-01-14" });
  });

  it("widens both sides when ensure bounds straddle the default window", () => {
    expect(
      widenFetchWindow("2026-04-01", "2026-08-01", {
        ensureStart: "2025-12-15",
        ensureEnd: "2027-01-14",
      }),
    ).toEqual({ start: "2025-12-15", end: "2027-01-14" });
  });

  it("ignores ensure bounds equal to the default (no off-by-one widening)", () => {
    expect(
      widenFetchWindow("2026-04-01", "2026-08-01", {
        ensureStart: "2026-04-01",
        ensureEnd: "2026-08-01",
      }),
    ).toEqual({ start: "2026-04-01", end: "2026-08-01" });
  });
});

describe("daysBetweenDateKeys", () => {
  it("returns 0 for the same date", () => {
    expect(daysBetweenDateKeys("2026-04-01", "2026-04-01")).toBe(0);
  });

  it("returns the typical whole-day span", () => {
    expect(daysBetweenDateKeys("2026-04-01", "2026-04-15")).toBe(14);
  });

  it("returns a negative value when end precedes start", () => {
    expect(daysBetweenDateKeys("2026-04-15", "2026-04-01")).toBe(-14);
  });

  it("handles a span crossing a leap-year Feb 29", () => {
    expect(daysBetweenDateKeys("2028-02-01", "2028-03-01")).toBe(29);
  });

  it("handles a span crossing a non-leap-year February", () => {
    expect(daysBetweenDateKeys("2026-02-01", "2026-03-01")).toBe(28);
  });
});

describe("getInitialFetchWindow", () => {
  it("covers a two-week view and a week either side", () => {
    expect(getInitialFetchWindow({ startDateKey: "2026-10-12", endDateKey: "2026-10-25" })).toEqual(
      { start: "2026-10-05", end: "2026-11-01" },
    );
  });

  it("covers a one-week view and a week either side", () => {
    expect(getInitialFetchWindow({ startDateKey: "2026-10-12", endDateKey: "2026-10-18" })).toEqual(
      { start: "2026-10-05", end: "2026-10-25" },
    );
  });

  it("covers a month view across a year boundary", () => {
    expect(getInitialFetchWindow({ startDateKey: "2026-12-01", endDateKey: "2026-12-31" })).toEqual(
      { start: "2026-11-24", end: "2027-01-07" },
    );
  });
});

describe("getFirstPaintRange", () => {
  it("reaches back to where pay-period alignment will move the start", () => {
    // A Wednesday pay period puts the period holding Sunday 2026-10-11 at 2026-09-30.
    const range = getFirstPaintRange(
      { startDateKey: "2026-10-11", endDateKey: "2026-10-24" },
      "2026-09-30",
    );
    expect(range).toEqual({ startDateKey: "2026-09-30", endDateKey: "2026-10-24" });
    const loaded = getInitialFetchWindow(range);
    expect(loaded).toEqual({ start: "2026-09-23", end: "2026-10-31" });
    expect(fetchWindowContains(loaded, { start: "2026-09-30", end: "2026-10-13" })).toBe(true);
  });

  it("keeps the visible start when alignment does not move it", () => {
    expect(
      getFirstPaintRange({ startDateKey: "2026-10-12", endDateKey: "2026-10-25" }, "2026-10-12"),
    ).toEqual({ startDateKey: "2026-10-12", endDateKey: "2026-10-25" });
  });
});

describe("getFullFetchWindow", () => {
  const defaultWindow = { start: "2026-07-19", end: "2027-01-15" };

  it("widens a first window near today to the default band", () => {
    expect(
      getFullFetchWindow({ start: "2026-10-05", end: "2026-11-01" }, defaultWindow, {
        startDateKey: "2026-10-12",
        endDateKey: "2026-10-25",
      }),
    ).toEqual(defaultWindow);
  });

  it("keeps a deep-linked window that sits just past the band", () => {
    expect(
      getFullFetchWindow({ start: "2027-01-25", end: "2027-02-21" }, defaultWindow, {
        startDateKey: "2027-02-01",
        endDateKey: "2027-02-14",
      }),
    ).toEqual({ start: "2026-07-19", end: "2027-02-21" });
  });

  it("recenters on the view when a deep link is too far from today", () => {
    const full = getFullFetchWindow({ start: "2027-09-06", end: "2027-10-03" }, defaultWindow, {
      startDateKey: "2027-09-13",
      endDateKey: "2027-09-26",
    });
    expect(full).toEqual({ start: "2027-06-15", end: "2027-12-25" });
    expect(daysBetweenDateKeys(full.start, full.end)).toBeLessThanOrEqual(300);
  });
});

describe("fetchWindowContains", () => {
  const outer = { start: "2026-10-01", end: "2026-10-31" };

  it("holds for an equal or inner window", () => {
    expect(fetchWindowContains(outer, outer)).toBe(true);
    expect(fetchWindowContains(outer, { start: "2026-10-05", end: "2026-10-20" })).toBe(true);
  });

  it("fails when either edge is outside", () => {
    expect(fetchWindowContains(outer, { start: "2026-09-30", end: "2026-10-20" })).toBe(false);
    expect(fetchWindowContains(outer, { start: "2026-10-05", end: "2026-11-01" })).toBe(false);
  });
});

describe("mergeLoadedWindows", () => {
  const full = { start: "2026-07-19", end: "2027-01-15" };
  const narrow = { start: "2026-10-05", end: "2026-11-01" };

  it("takes the fetched window when it holds the latest one", () => {
    expect(mergeLoadedWindows(narrow, full)).toEqual(full);
  });

  it("keeps a window that grew while a narrower fetch was in flight", () => {
    expect(mergeLoadedWindows(full, narrow)).toEqual(full);
  });

  it("joins overlapping windows", () => {
    expect(
      mergeLoadedWindows(
        { start: "2026-10-01", end: "2026-12-31" },
        { start: "2026-12-01", end: "2027-02-28" },
      ),
    ).toEqual({ start: "2026-10-01", end: "2027-02-28" });
  });

  it("joins windows that meet on adjacent days", () => {
    expect(
      mergeLoadedWindows(
        { start: "2026-10-01", end: "2026-10-31" },
        { start: "2026-11-01", end: "2026-11-30" },
      ),
    ).toEqual({ start: "2026-10-01", end: "2026-11-30" });
  });

  it("keeps the latest window when the fetch is for somewhere it has left", () => {
    const recentered = { start: "2027-06-01", end: "2027-12-31" };
    expect(mergeLoadedWindows(recentered, narrow)).toEqual(recentered);
  });

  it("keeps the latest window when joining would pass the recenter threshold", () => {
    const latest = { start: "2026-01-01", end: "2026-09-30" };
    const fetched = { start: "2026-09-01", end: "2027-01-31" };
    expect(mergeLoadedWindows(latest, fetched)).toEqual(latest);
  });
});
