import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prefetchQuery, getDashboard, getMySchedule } = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  getDashboard: vi.fn(),
  getMySchedule: vi.fn(),
}));

vi.mock("../../../shared/lib/query-client", () => ({ queryClient: { prefetchQuery } }));
vi.mock("../../../shared/lib/api", () => ({ getDashboard, getMySchedule }));

import {
  ADJACENT_WEEKS_PREFETCH_DELAY_MS,
  usePrefetchAdjacentDashboardWeeks,
} from "./usePrefetchAdjacentDashboardWeeks";

function tokenFor(issuedAt: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: "user-1", org_id: "org-1", iat: issuedAt }),
    "signature",
  ].join(".");
}

const token = tokenFor("now");

function keysOf(calls: unknown[][]): unknown[][] {
  return calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
}

const WEEK = { startDate: "2026-10-25", endDate: "2026-10-31" };

function rangeOf(key: unknown[]) {
  const [startDate, endDate] = key.slice(-2) as [string, string];
  return { startDate, endDate };
}

describe("usePrefetchAdjacentDashboardWeeks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prefetchQuery.mockReset();
    prefetchQuery.mockResolvedValue(undefined);
    getDashboard.mockReset();
    getMySchedule.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const settle = () => vi.advanceTimersByTime(ADJACENT_WEEKS_PREFETCH_DELAY_MS);

  it("does nothing until bootstrap has landed", () => {
    renderHook(() =>
      usePrefetchAdjacentDashboardWeeks({
        accessToken: token,
        range: WEEK,
        includeSchedule: true,
        ready: false,
        currentLoaded: true,
      }),
    );
    settle();

    expect(prefetchQuery).not.toHaveBeenCalled();
  });

  it("waits for the shown week before warming its neighbours", () => {
    const { rerender } = renderHook(
      ({ loaded }: { loaded: boolean }) =>
        usePrefetchAdjacentDashboardWeeks({
          accessToken: token,
          range: WEEK,
          includeSchedule: false,
          ready: true,
          currentLoaded: loaded,
        }),
      { initialProps: { loaded: false } },
    );
    settle();
    expect(prefetchQuery).not.toHaveBeenCalled();

    rerender({ loaded: true });
    vi.advanceTimersByTime(ADJACENT_WEEKS_PREFETCH_DELAY_MS - 1);
    expect(prefetchQuery).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(prefetchQuery).toHaveBeenCalledTimes(2);
  });

  it("warms the dashboard and schedule for the week before and after", () => {
    renderHook(() =>
      usePrefetchAdjacentDashboardWeeks({
        accessToken: token,
        range: WEEK,
        includeSchedule: true,
        ready: true,
        currentLoaded: true,
      }),
    );
    settle();

    const keys = keysOf(prefetchQuery.mock.calls);
    expect(keys).toHaveLength(4);
    expect(keys.map(rangeOf)).toEqual([
      { startDate: "2026-10-18", endDate: "2026-10-24" },
      { startDate: "2026-10-18", endDate: "2026-10-24" },
      { startDate: "2026-11-01", endDate: "2026-11-07" },
      { startDate: "2026-11-01", endDate: "2026-11-07" },
    ]);
    expect(keys[0]).toEqual(expect.arrayContaining(["mobile", "dashboard"]));
    expect(keys[1]).toEqual(expect.arrayContaining(["my-schedule"]));

    // Each prefetch requests exactly its own range.
    const signal = new AbortController().signal;
    (prefetchQuery.mock.calls[2]![0] as { queryFn: (c: unknown) => void }).queryFn({ signal });
    expect(getDashboard).toHaveBeenCalledWith(
      token,
      { startDate: "2026-11-01", endDate: "2026-11-07" },
      signal,
    );
  });

  it("skips the schedule for management-only users", () => {
    renderHook(() =>
      usePrefetchAdjacentDashboardWeeks({
        accessToken: token,
        range: WEEK,
        includeSchedule: false,
        ready: true,
        currentLoaded: true,
      }),
    );
    settle();

    expect(keysOf(prefetchQuery.mock.calls)).toHaveLength(2);
  });

  it("warms once per week shown, not on every refresh", () => {
    const { rerender } = renderHook(
      ({ range }: { range: typeof WEEK }) =>
        usePrefetchAdjacentDashboardWeeks({
          accessToken: token,
          range,
          includeSchedule: false,
          ready: true,
          currentLoaded: true,
        }),
      { initialProps: { range: WEEK } },
    );
    settle();
    expect(prefetchQuery).toHaveBeenCalledTimes(2);

    rerender({ range: { ...WEEK } });
    settle();
    expect(prefetchQuery).toHaveBeenCalledTimes(2);

    rerender({ range: { startDate: "2026-11-01", endDate: "2026-11-07" } });
    settle();
    expect(prefetchQuery).toHaveBeenCalledTimes(4);
  });
});
