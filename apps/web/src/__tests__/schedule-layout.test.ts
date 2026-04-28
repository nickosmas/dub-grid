import { describe, expect, it } from "vitest";

import { getScheduleGridLayout } from "@/lib/schedule-grid-layout";
import {
  getContainingPayPeriodStart,
  getScheduleStartForSpan,
  resolveScheduleSpan,
} from "@/lib/schedule-view";
import { AUTO_ONE_WEEK } from "@/hooks";
import { formatDateKey } from "@/lib/utils";

describe("schedule view fallback", () => {
  it("widens the auto one-week breakpoint", () => {
    expect(AUTO_ONE_WEEK).toBe("(min-width: 768px) and (max-width: 1200px)");
  });

  it("auto-resolves preferred 2-week view to 1-week inside the cramped range", () => {
    expect(resolveScheduleSpan(2, true)).toBe(1);
    expect(resolveScheduleSpan(1, true)).toBe(1);
    expect(resolveScheduleSpan("month", true)).toBe("month");
    expect(resolveScheduleSpan(2, false)).toBe(2);
  });

  it("finds the containing pay period from a configured biweekly anchor date", () => {
    const start = getContainingPayPeriodStart(
      new Date(2026, 4, 1),
      "2026-04-20",
    );

    expect(start).not.toBeNull();
    expect(formatDateKey(start!)).toBe("2026-04-20");
  });

  it("falls back to calendar weeks when no pay-period anchor is configured", () => {
    const start = getScheduleStartForSpan({
      date: new Date(2026, 4, 1),
      span: 2,
      payPeriodStartDate: null,
    });

    expect(formatDateKey(start)).toBe("2026-04-26");
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
