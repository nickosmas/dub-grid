import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PeriodNavigator } from "@/components/activity/PeriodNavigator";

function renderNavigator(props: Partial<React.ComponentProps<typeof PeriodNavigator>> = {}) {
  const handlers = {
    onUnitChange: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onJumpToDate: vi.fn(),
  };
  render(
    <PeriodNavigator
      unit="week"
      label="Aug 30 - Sep 5, 2026"
      anchorDate="2026-09-05"
      isCurrent
      nextDisabled
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("PeriodNavigator", () => {
  it("names the period and its stepping controls", () => {
    renderNavigator();

    expect(screen.getByText("Aug 30 - Sep 5, 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to previous period" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next period" })).toBeInTheDocument();
  });

  it("steps backward on demand", async () => {
    const user = userEvent.setup();
    const handlers = renderNavigator();

    await user.click(screen.getByRole("button", { name: "Go to previous period" }));

    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
  });

  it("blocks forward travel past the current period", async () => {
    const user = userEvent.setup();
    const handlers = renderNavigator();

    const next = screen.getByRole("button", { name: "Go to next period" });
    expect(next).toBeDisabled();
    await user.click(next);
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it("labels the return button after the unit it returns to", () => {
    const { unmount } = render(
      <PeriodNavigator
        unit="month"
        label="September 2026"
        anchorDate="2026-09-05"
        isCurrent={false}
        nextDisabled={false}
        onUnitChange={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToday={vi.fn()}
        onJumpToDate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "This month" })).toBeEnabled();
    unmount();

    renderNavigator({ unit: "day" });
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
  });

  it("offers the three period lengths and marks the active one", async () => {
    const user = userEvent.setup();
    const handlers = renderNavigator();

    const group = screen.getByRole("group", { name: "Activity period length" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Month" }));
    expect(handlers.onUnitChange).toHaveBeenCalledWith("month");
  });

  it("says when times are not in an organization's zone", () => {
    renderNavigator({ timeZoneNote: "Times shown in UTC" });

    expect(screen.getByText("Times shown in UTC")).toBeInTheDocument();
  });
});
