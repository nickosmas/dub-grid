import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BannerPeriodButtons,
  MAX_BANNER_BUTTONS,
  orderBannerPeriods,
  otherPeriodsTitle,
  splitBannerPeriods,
  type BannerPeriod,
} from "@/components/ui/BannerPeriodButtons";

const period = (key: string, label: string, count: number, onSelect = vi.fn()): BannerPeriod => ({
  key,
  label,
  count,
  onSelect,
});

describe("splitBannerPeriods", () => {
  it("gives every period a button while they fit", () => {
    expect(splitBannerPeriods([1])).toEqual({ shown: [1], more: [] });
    expect(splitBannerPeriods([1, 2])).toEqual({ shown: [1, 2], more: [] });
  });

  it("keeps the first and moves the rest into one menu, never more than two buttons", () => {
    const { shown, more } = splitBannerPeriods([1, 2, 3, 4]);
    expect(shown).toEqual([1]);
    expect(more).toEqual([2, 3, 4]);
    expect(shown.length + (more.length > 0 ? 1 : 0)).toBe(MAX_BANNER_BUTTONS);
  });
});

describe("orderBannerPeriods", () => {
  const at = (day: number) => ({ start: new Date(2026, 10, day), day });
  const anchor = new Date(2026, 10, 15);

  it("reads in date order when every period has a button", () => {
    expect(orderBannerPeriods([at(8), at(1)], anchor).map((p) => p.day)).toEqual([1, 8]);
  });

  it("puts the nearest first when some go into the menu, earlier first at a tie", () => {
    const sorted = orderBannerPeriods([at(1), at(29), at(8), at(22)], anchor);
    expect(sorted.map((p) => p.day)).toEqual([8, 22, 1, 29]);
  });
});

describe("otherPeriodsTitle", () => {
  it("says another for one and counts the rest", () => {
    expect(otherPeriodsTitle("Drafts in", 1, "week")).toBe("Drafts in another week");
    expect(otherPeriodsTitle("Drafts in", 3, "pay period")).toBe("Drafts in 3 other pay periods");
  });
});

describe("BannerPeriodButtons", () => {
  it("labels a period with its dates and count only", () => {
    render(
      <BannerPeriodButtons
        countNoun="draft"
        buttonHint="Jump"
        periods={[period("a", "10/25 - 10/31", 16), period("b", "11/1 - 11/7", 6)]}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["10/25 - 10/31 (16)", "11/1 - 11/7 (6)"]);
  });

  it("puts the rest in an N more menu that goes to the chosen period", () => {
    const third = vi.fn();
    render(
      <BannerPeriodButtons
        countNoun="draft"
        buttonHint="Jump"
        periods={[
          period("a", "10/25 - 10/31", 16),
          period("b", "11/1 - 11/7", 6),
          period("c", "11/8 - 11/14", 1, third),
        ]}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    const more = screen.getByRole("button", { name: "2 more" });
    fireEvent.click(more);
    expect(screen.getByRole("menuitem", { name: /11\/1 - 11\/7\s*6 drafts/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /11\/8 - 11\/14\s*1 draft$/ }));
    expect(third).toHaveBeenCalledOnce();
  });
});
