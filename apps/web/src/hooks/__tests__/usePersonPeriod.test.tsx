import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePersonPeriod } from "../usePersonPeriod";

describe("usePersonPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 29, 12));
  });
  afterEach(() => vi.useRealTimers());

  it("opens on the current month and steps through months", () => {
    const { result } = renderHook(() => usePersonPeriod());
    expect(result.current.period.range).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });

    act(() => result.current.step(-1));
    act(() => result.current.step(-1));
    expect(result.current.period.range.startDate).toBe("2026-08-01");

    act(() => result.current.goToToday());
    expect(result.current.period.range.startDate).toBe("2026-10-01");
  });

  it("takes picked dates until an arrow steps back to whole months", () => {
    const { result } = renderHook(() => usePersonPeriod());
    act(() => result.current.setCustomRange({ startDate: "2026-08-02", endDate: "2026-10-24" }));
    expect(result.current.period).toEqual({
      kind: "custom",
      range: { startDate: "2026-08-02", endDate: "2026-10-24" },
    });

    act(() => result.current.step(1));
    expect(result.current.period).toEqual({
      kind: "month",
      range: { startDate: "2026-10-01", endDate: "2026-10-31" },
    });
  });

  it("switches span around today while the period holds it, else around its start", () => {
    const { result } = renderHook(() => usePersonPeriod("2026-01-04"));
    act(() => result.current.setSpan("pay-period"));
    expect(result.current.span).toBe("pay-period");
    expect(result.current.period.range).toEqual({
      startDate: "2026-10-25",
      endDate: "2026-11-07",
    });

    act(() => result.current.step(-1));
    expect(result.current.period.range.startDate).toBe("2026-10-11");

    act(() => result.current.setSpan("week"));
    expect(result.current.period.range).toEqual({
      startDate: "2026-10-11",
      endDate: "2026-10-17",
    });

    act(() => result.current.goToToday());
    expect(result.current.period).toEqual({
      kind: "week",
      range: { startDate: "2026-10-25", endDate: "2026-10-31" },
    });
  });

  it("steps out of picked dates by the chosen span", () => {
    const { result } = renderHook(() => usePersonPeriod());
    act(() => result.current.setSpan("year"));
    act(() => result.current.setCustomRange({ startDate: "2025-12-20", endDate: "2026-01-10" }));
    act(() => result.current.step(-1));
    expect(result.current.period).toEqual({
      kind: "year",
      range: { startDate: "2025-01-01", endDate: "2025-12-31" },
    });
  });
});
