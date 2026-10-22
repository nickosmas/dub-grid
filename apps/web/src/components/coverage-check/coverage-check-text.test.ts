import { describe, expect, it } from "vitest";
import {
  comparisonSentence,
  coverageCheckSubtitle,
  formatCoverageNumber,
  requirementSummary,
} from "./coverage-check-text";

const totals = (overrides = {}) => ({
  short: 0,
  over: 0,
  opened: 0,
  closed: 0,
  changed: 0,
  staffShortByDate: {},
  ...overrides,
});

describe("coverage check text", () => {
  it("shows whole numbers bare and mentored credit exactly", () => {
    expect(formatCoverageNumber(2)).toBe("2");
    expect(formatCoverageNumber(2.5)).toBe("2.5");
    expect(formatCoverageNumber(0.33)).toBe("0.33");
    expect(formatCoverageNumber(1.9999999999999998)).toBe("2");
  });

  it("says when the draft matches what staff see", () => {
    expect(comparisonSentence(totals(), false)).toBe("This draft matches the published schedule.");
    expect(comparisonSentence(totals(), true)).toBe(
      "This draft matches the published schedule on published dates.",
    );
  });

  it("counts opened, closed and other changes", () => {
    expect(comparisonSentence(totals({ opened: 2 }), false)).toBe(
      "Compared with the published schedule, this draft opens 2 gaps and closes none.",
    );
    expect(comparisonSentence(totals({ closed: 1, changed: 3 }), true)).toBe(
      "Compared with the published schedule, this draft opens no gaps and closes 1, and changes the count in 3 other cells on published dates.",
    );
  });

  it("counts changed cells on their own when nothing opens or closes", () => {
    expect(comparisonSentence(totals({ changed: 1 }), false)).toBe(
      "Compared with the published schedule, this draft opens and closes no gaps, and changes the count in 1 cell.",
    );
  });

  it("names the scope of the header counts", () => {
    expect(coverageCheckSubtitle({ totals: totals(), publishedOnly: false, areaName: null })).toBe(
      "All requirements met",
    );
    expect(
      coverageCheckSubtitle({
        totals: totals({ short: 1, over: 2 }),
        publishedOnly: true,
        areaName: "North Wing",
      }),
    ).toBe("1 shift short · 2 over in North Wing on published dates");
  });

  it("states the requirement, or its range across the week", () => {
    const cell = (required: number) =>
      ({ draft: { actual: 0, required, isMet: false, hasRequirement: true } }) as never;
    expect(requirementSummary([cell(3), null, cell(3)])).toBe("needs 3");
    expect(requirementSummary([cell(3), cell(2)])).toBe("needs 2 to 3");
    expect(requirementSummary([null])).toBe("");
  });
});
