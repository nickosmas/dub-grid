import { describe, expect, it } from "vitest";
import {
  formatImportPreviousSkipDescription,
  getSkipReasonLabel,
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
    expect(
      breakdown.imported + breakdown.totalSkipped,
    ).toBe(breakdown.totalSource);
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
    expect(
      formatImportPreviousSkipDescription(outcomes, breakdown, new Map()),
    ).toBe("");
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

    const description = formatImportPreviousSkipDescription(
      outcomes,
      breakdown,
      names,
    );
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
    const description = formatImportPreviousSkipDescription(
      outcomes,
      breakdown,
      new Map(),
    );
    expect(description).toContain("an employee on 7/4");
  });
});

describe("getSkipReasonLabel", () => {
  it("labels each documented reason code", () => {
    expect(getSkipReasonLabel("target_has_data")).toBe("Target already had data");
    expect(getSkipReasonLabel("employee_inactive")).toBe("Employee no longer active");
    expect(getSkipReasonLabel("source_has_no_content")).toBe(
      "Source cell had no usable content",
    );
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
