import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureException }));

import {
  resetScheduleLoadingWait,
  SCHEDULE_LOADING_REPORT_MS,
  SCHEDULE_LOADING_SLOW_MS,
  ScheduleLoadingScreen,
} from "./ScheduleLoadingScreen";

beforeEach(() => {
  vi.useFakeTimers();
  resetScheduleLoadingWait();
  captureException.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("ScheduleLoadingScreen", () => {
  it("says a long wait is slow and offers a reload", () => {
    render(<ScheduleLoadingScreen />);
    advance(SCHEDULE_LOADING_SLOW_MS - 1_000);
    expect(screen.queryByText("This is taking longer than usual.")).toBeNull();

    advance(1_000);
    expect(screen.getByText("This is taking longer than usual.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("reports a stalled wait once, with what is still outstanding", () => {
    render(<ScheduleLoadingScreen describeWait={() => ({ pending: ["shifts#0"] })} />);
    advance(SCHEDULE_LOADING_REPORT_MS - 1_000);
    expect(captureException).not.toHaveBeenCalled();

    advance(1_000);
    advance(10_000);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1]).toMatchObject({
      tags: { component: "schedule_loading" },
      extra: { source: "page", pending: ["shifts#0"] },
    });
  });

  it("counts the route fallback and the page's screen as one wait", () => {
    const { rerender } = render(<ScheduleLoadingScreen key="route" source="route" />);
    advance(10_000);
    rerender(<ScheduleLoadingScreen key="page" />);
    advance(5_000);
    expect(screen.getByText("This is taking longer than usual.")).toBeInTheDocument();
  });

  it("starts a new wait once no screen is showing", () => {
    const first = render(<ScheduleLoadingScreen />);
    advance(10_000);
    first.unmount();
    advance(0);

    render(<ScheduleLoadingScreen />);
    advance(10_000);
    expect(screen.queryByText("This is taking longer than usual.")).toBeNull();
  });
});
