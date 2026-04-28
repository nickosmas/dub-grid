import { describe, expect, it } from "vitest";

import { resolveJobColorsForShift } from "@/lib/job-placement";

describe("job placement colors", () => {
  it("uses the shift category color for scheduled jobs by default", () => {
    const shift = { id: 10, color: "#BFDBFE" };
    const colors = resolveJobColorsForShift(
      {
        assignmentMode: "with_shift",
        color: "#4B9A77",
        shiftColorOverrides: {},
      },
      shift,
    );

    expect(colors.color).toBe("#BFDBFE");
  });

  it("uses shift color ahead of job colors", () => {
    const shift = { id: 10, color: "#FDE68A" };
    const colors = resolveJobColorsForShift(
      {
        assignmentMode: "with_shift",
        color: "#4B9A77",
        shiftColorOverrides: {},
      },
      shift,
    );

    expect(colors.color).toBe("#FDE68A");
  });

  it("preserves explicit per-shift overrides ahead of the shift color", () => {
    const colors = resolveJobColorsForShift(
      {
        assignmentMode: "with_shift",
        color: "#FECACA",
        shiftColorOverrides: { "10": "#D9F99D" },
      },
      { id: 10, color: "#BFDBFE" },
    );

    expect(colors.color).toBe("#D9F99D");
  });

  it("does not fall back to scheduled job colors when a shift lacks a color", () => {
    const colors = resolveJobColorsForShift(
      {
        assignmentMode: "with_shift",
        color: "#B4533C",
        shiftColorOverrides: {},
      },
      { id: 10, color: null },
    );

    expect(colors.color).toBe("#E2E8F0");
  });

  it("does not treat a missing scheduled shift as permission to use stored job colors", () => {
    const colors = resolveJobColorsForShift(
      {
        assignmentMode: "with_shift",
        color: "#B4533C",
        border: "transparent",
        text: "#FFFFFF",
        shiftColorOverrides: {},
      },
      null,
    );

    expect(colors.color).toBe("#E2E8F0");
    expect(colors.text).not.toBe("#FFFFFF");
  });

  it("keeps shiftless custom job colors owned by the job", () => {
    const colors = resolveJobColorsForShift(
      {
        assignmentMode: "shiftless",
        color: "#B4533C",
        border: "transparent",
        text: "#F8FAFC",
        shiftColorOverrides: {},
      },
      null,
    );

    expect(colors.color).toBe("#B4533C");
    expect(colors.border).toBe("transparent");
    expect(colors.text).toBe("#F8FAFC");
  });
});
