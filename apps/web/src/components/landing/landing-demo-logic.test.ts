import { describe, expect, it } from "vitest";
import { describeWeeklyHours, nextLoopStep, parseSchedulePattern } from "./landing-demo-logic";

describe("nextLoopStep", () => {
  it("advances and wraps to the first step", () => {
    expect(nextLoopStep(0, 3)).toBe(1);
    expect(nextLoopStep(2, 3)).toBe(0);
  });

  it("stays on step 0 when there are no steps", () => {
    expect(nextLoopStep(4, 0)).toBe(0);
  });
});

describe("describeWeeklyHours", () => {
  it("labels hours under the threshold against 40", () => {
    const bar = describeWeeklyHours(32);
    expect(bar).toMatchObject({ isOvertime: false, hoursLabel: "32h", detailLabel: "of 40h" });
    expect(bar.withinPercent).toBeCloseTo((32 / 48) * 100);
    expect(bar.overPercent).toBe(0);
  });

  it("treats exactly 40 hours as no overtime", () => {
    expect(describeWeeklyHours(40)).toMatchObject({ isOvertime: false, detailLabel: "of 40h" });
  });

  it("splits overtime into its own part of the bar", () => {
    const bar = describeWeeklyHours(44);
    expect(bar).toMatchObject({ isOvertime: true, hoursLabel: "44h", detailLabel: "+4h OT" });
    expect(bar.withinPercent).toBeCloseTo((40 / 48) * 100);
    expect(bar.overPercent).toBeCloseTo((4 / 48) * 100);
  });

  it("never draws past the end of the bar", () => {
    const bar = describeWeeklyHours(60);
    expect(bar.withinPercent + bar.overPercent).toBeCloseTo(100);
    expect(bar.detailLabel).toBe("+20h OT");
  });
});

describe("parseSchedulePattern", () => {
  it("reads single days and off runs that span several", () => {
    expect(parseSchedulePattern("D O2 _ E", 4)).toEqual([
      { code: "D", span: 1 },
      { code: "off", span: 2 },
      { code: "E", span: 1 },
    ]);
  });

  it("refuses a row that doesn't cover every day", () => {
    expect(() => parseSchedulePattern("D E", 3)).toThrow(/covers 2 days, expected 3/);
  });

  it("refuses an off run without its placeholders", () => {
    expect(() => parseSchedulePattern("O2 D", 2)).toThrow(/needs 1 "_"/);
  });
});
