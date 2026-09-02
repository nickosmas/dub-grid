import { describe, expect, it } from "vitest";

import { getScheduleGridLayout } from "@/lib/schedule-grid-layout";
import {
  getContainingPayPeriodStart,
  getScheduleStartForSpan,
  realignTwoWeekScheduleStart,
  resolveScheduleSpan,
} from "@/lib/schedule-view";
import { AUTO_ONE_WEEK } from "@/hooks";
import { formatDateKey } from "@/lib/utils";

describe("schedule view fallback", () => {
  it("applies the auto one-week breakpoint to phones as well as cramped desktops", () => {
    // No lower bound: the mobile grid only ever draws 7 columns, so leaving
    // phones in 2-week span made the publish window cover an unseen week and
    // made "next period" a no-op against the pay-period snap.
    expect(AUTO_ONE_WEEK).toBe("(max-width: 1200px)");
  });

  it("auto-resolves preferred 2-week view to 1-week inside the cramped range", () => {
    expect(resolveScheduleSpan(2, true)).toBe(1);
    expect(resolveScheduleSpan(1, true)).toBe(1);
    expect(resolveScheduleSpan("month", true)).toBe("month");
    expect(resolveScheduleSpan(2, false)).toBe(2);
  });

  it("finds the containing pay period from a configured biweekly anchor date", () => {
    const start = getContainingPayPeriodStart(new Date(2026, 4, 1), "2026-04-20");

    expect(start).not.toBeNull();
    expect(formatDateKey(start!)).toBe("2026-04-20");
  });

  it("anchors 2-week schedule starts to the configured pay period", () => {
    const start = getScheduleStartForSpan({
      date: new Date(2026, 4, 1),
      span: 2,
      payPeriodStartDate: "2026-04-20",
    });

    expect(formatDateKey(start)).toBe("2026-04-20");
  });

  it("keeps 1-week schedule starts aligned to calendar weeks", () => {
    const start = getScheduleStartForSpan({
      date: new Date(2026, 4, 1),
      span: 1,
      payPeriodStartDate: "2026-04-20",
    });

    expect(formatDateKey(start)).toBe("2026-04-26");
  });

  it("falls back to calendar weeks when no pay-period anchor is configured", () => {
    const start = getScheduleStartForSpan({
      date: new Date(2026, 4, 1),
      span: 2,
      payPeriodStartDate: null,
    });

    expect(formatDateKey(start)).toBe("2026-04-26");
  });

  it("realigns an open two-week grid when its anchor initially loads or changes", () => {
    const unanchoredStart = new Date(2026, 4, 3);
    const initiallyAnchored = realignTwoWeekScheduleStart(unanchoredStart, 2, "2026-04-20");
    const changedAnchor = realignTwoWeekScheduleStart(initiallyAnchored, 2, "2026-04-27");

    expect(formatDateKey(initiallyAnchored)).toBe("2026-04-20");
    expect(formatDateKey(changedAnchor)).toBe("2026-04-13");
  });

  it("keeps previous and next navigation on anchored two-week boundaries", () => {
    const currentStart = new Date(2026, 3, 20);
    const previousStart = getScheduleStartForSpan({
      date: new Date(2026, 3, 6),
      span: 2,
      payPeriodStartDate: "2026-04-20",
    });
    const nextStart = getScheduleStartForSpan({
      date: new Date(2026, 4, 4),
      span: 2,
      payPeriodStartDate: "2026-04-20",
    });

    expect(formatDateKey(currentStart)).toBe("2026-04-20");
    expect(formatDateKey(previousStart)).toBe("2026-04-06");
    expect(formatDateKey(nextStart)).toBe("2026-05-04");
  });

  it("does not apply the biweekly anchor to one-week or month grids", () => {
    const currentStart = new Date(2026, 4, 3);

    expect(realignTwoWeekScheduleStart(currentStart, 1, "2026-04-20")).toBe(currentStart);
    expect(realignTwoWeekScheduleStart(currentStart, "month", "2026-04-20")).toBe(currentStart);
  });
});

describe("schedule grid layout", () => {
  it("keeps the 2-week code-mode staff column width stable in compact weeks", () => {
    const layout = getScheduleGridLayout({
      spanWeeks: 2,
      shiftDisplayMode: "code",
      containerWidth: 1600,
      hasOpenShifts: false,
      hasStackedCellContent: false,
    });

    expect(layout.fitToContainer).toBe(true);
    expect(layout.nameColWidth).toBe(220);
    expect(layout.colWidth).toBeGreaterThanOrEqual(80);
  });

  it("keeps readable minimum widths with horizontal scroll when 2-week content is dense", () => {
    const layout = getScheduleGridLayout({
      spanWeeks: 2,
      shiftDisplayMode: "code",
      containerWidth: 1200,
      hasOpenShifts: true,
      hasStackedCellContent: true,
    });

    expect(layout.fitToContainer).toBe(false);
    expect(layout.nameColWidth).toBe(220);
    expect(layout.colWidth).toBe(88);
    expect(layout.minGridWidth).toBe(1452);
  });

  it("preserves wider readable columns for 2-week name mode", () => {
    const layout = getScheduleGridLayout({
      spanWeeks: 2,
      shiftDisplayMode: "name",
      containerWidth: 1700,
      hasOpenShifts: false,
      hasStackedCellContent: true,
    });

    expect(layout.fitToContainer).toBe(false);
    expect(layout.nameColWidth).toBe(220);
    expect(layout.colWidth).toBe(160);
  });
});
