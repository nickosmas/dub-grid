import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityPeriod, useUrlActivityPeriod } from "@/components/activity/useActivityPeriod";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/settings",
  useSearchParams: () => searchParams,
}));

const NEW_YORK = "America/New_York";

describe("useActivityPeriod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    // 11:00 PM on Sep 5 in New York, already Sep 6 in UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T03:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on the current week in the organization's zone, not the browser's", () => {
    const { result } = renderHook(() => useActivityPeriod({ timeZone: NEW_YORK }));

    expect(result.current.todayDate).toBe("2026-09-05");
    expect(result.current.period).toEqual({
      unit: "week",
      startDate: "2026-08-30",
      endDate: "2026-09-05",
    });
    expect(result.current.startAt).toBe("2026-08-30T04:00:00.000Z");
    expect(result.current.endAt).toBe("2026-09-06T03:59:59.999Z");
    expect(result.current.label).toBe("Aug 30 - Sep 5, 2026");
    expect(result.current.phrase).toBe("this week");
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.nextDisabled).toBe(true);
  });

  it("steps back a week and allows stepping forward again", () => {
    const { result } = renderHook(() => useActivityPeriod({ timeZone: NEW_YORK }));

    act(() => result.current.goPrev());

    expect(result.current.period.startDate).toBe("2026-08-23");
    expect(result.current.isCurrent).toBe(false);
    expect(result.current.nextDisabled).toBe(false);
    expect(result.current.phrase).toBe("the week of Aug 23");

    act(() => result.current.goNext());
    expect(result.current.period.startDate).toBe("2026-08-30");
  });

  it("keeps the anchor date when the unit changes", () => {
    const { result } = renderHook(() => useActivityPeriod({ timeZone: NEW_YORK }));

    act(() => result.current.jumpTo("2026-07-15"));
    act(() => result.current.setUnit("month"));

    expect(result.current.period).toEqual({
      unit: "month",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    act(() => result.current.setUnit("day"));
    expect(result.current.period).toEqual({
      unit: "day",
      startDate: "2026-07-15",
      endDate: "2026-07-15",
    });
  });

  it("returns to the current period", () => {
    const { result } = renderHook(() => useActivityPeriod({ timeZone: NEW_YORK }));

    act(() => result.current.jumpTo("2026-01-15"));
    expect(result.current.isCurrent).toBe(false);

    act(() => result.current.goToday());
    expect(result.current.period.startDate).toBe("2026-08-30");
    expect(result.current.isCurrent).toBe(true);
  });

  it("honors a period given in the URL and writes changes back to it", () => {
    searchParams = new URLSearchParams("section=org-activity&period=day&date=2026-08-24");
    const { result } = renderHook(() => useUrlActivityPeriod({ timeZone: NEW_YORK }));

    expect(result.current.period).toEqual({
      unit: "day",
      startDate: "2026-08-24",
      endDate: "2026-08-24",
    });

    act(() => result.current.goPrev());

    expect(replace).toHaveBeenCalledWith(
      "/settings?section=org-activity&period=day&date=2026-08-23",
      { scroll: false },
    );
  });

  it("falls back to the current week when the URL is malformed", () => {
    searchParams = new URLSearchParams("period=decade&date=2026-13-40");
    const { result } = renderHook(() => useUrlActivityPeriod({ timeZone: NEW_YORK }));

    expect(result.current.period.startDate).toBe("2026-08-30");
    expect(result.current.unit).toBe("week");
  });

  it("uses UTC days when the organization has no timezone", () => {
    const { result } = renderHook(() => useActivityPeriod({ timeZone: null }));

    expect(result.current.todayDate).toBe("2026-09-06");
    expect(result.current.startAt).toBe("2026-09-06T00:00:00.000Z");
    expect(result.current.endAt).toBe("2026-09-12T23:59:59.999Z");
  });

  it("does not need the app router when the period stays in component state", () => {
    // The Gridmaster billing tab renders the audit log outside a router in
    // tests; a shared hook must not make that a hard requirement.
    const { result } = renderHook(() => useActivityPeriod({ timeZone: NEW_YORK }));

    expect(result.current.period.startDate).toBe("2026-08-30");
    expect(replace).not.toHaveBeenCalled();

    act(() => result.current.goPrev());
    expect(result.current.period.startDate).toBe("2026-08-23");
    expect(replace).not.toHaveBeenCalled();
  });
});
