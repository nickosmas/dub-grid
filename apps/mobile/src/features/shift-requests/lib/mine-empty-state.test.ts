import { describe, expect, it } from "vitest";
import { getMineEmptyState } from "./mine-empty-state";

describe("getMineEmptyState", () => {
  it("sends someone who can see the Schedule tab there", () => {
    expect(
      getMineEmptyState({ canViewScheduleTab: true, hasOwnShifts: true, hasHistory: false }),
    ).toEqual({
      title: "No open requests",
      body: "Open one of your shifts in Schedule to drop or swap it.",
      action: { label: "Go to Schedule", href: "/(tabs)/team" },
    });
  });

  it("sends someone without the Schedule tab to Home, where their shifts are", () => {
    expect(
      getMineEmptyState({ canViewScheduleTab: false, hasOwnShifts: true, hasHistory: false }),
    ).toMatchObject({
      body: "Open one of your shifts on Home to drop or swap it.",
      action: { label: "Go to Home", href: "/(tabs)/home" },
    });
  });

  it("mentions History when there are past requests", () => {
    expect(
      getMineEmptyState({ canViewScheduleTab: true, hasOwnShifts: true, hasHistory: true }).body,
    ).toBe(
      "Open one of your shifts in Schedule to drop or swap it. Your past requests are in History.",
    );
  });

  it("offers no shortcut to someone on no schedule", () => {
    const state = getMineEmptyState({
      canViewScheduleTab: true,
      hasOwnShifts: false,
      hasHistory: true,
    });

    expect(state.action).toBeNull();
    expect(state.body).toBe(
      "Requests you make show here until they're decided, canceled or expire, or the shift starts. Your past requests are in History.",
    );
  });
});
