import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

let CoverageSectionRow: (typeof import("./CoverageSectionRow"))["CoverageSectionRow"];

beforeAll(async () => {
  CoverageSectionRow = (await import("./CoverageSectionRow")).CoverageSectionRow;
});

const section = {
  focusAreaId: 1,
  focusAreaName: "ICU",
  requiredTotal: 6,
  filledTotal: 4,
  pct: 67,
  openSlots: 2,
  daily: [
    { dateKey: "2026-09-21", filledCount: 3, requiredCount: 3, status: "green" as const },
    { dateKey: "2026-09-22", filledCount: 1, requiredCount: 3, status: "amber" as const },
    { dateKey: "2026-09-23", filledCount: 0, requiredCount: 0, status: "none" as const },
  ],
};

describe("CoverageSectionRow", () => {
  it("shows the section totals and a per-day filled/required strip", () => {
    render(<CoverageSectionRow section={section} />);

    expect(screen.getByText("4 / 6 filled")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("3/3")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "2026-09-21 3 of 3 filled, 2026-09-22 1 of 3 filled, 2026-09-23 no requirement",
      ),
    ).toBeInTheDocument();
  });

  it("omits the strip when a payload carries no daily grid", () => {
    render(<CoverageSectionRow section={{ ...section, daily: [] }} />);

    expect(screen.getByText("4 / 6 filled")).toBeInTheDocument();
    expect(screen.queryByText("3/3")).not.toBeInTheDocument();
  });

  it("keeps a single week on one unpaged row", () => {
    render(<CoverageSectionRow section={{ ...section, daily: makeDaily("2026-09-20", 7) }} />);

    expect(screen.getAllByText("12/15")).toHaveLength(7);
    expect(screen.queryByLabelText(/^Week \d+ of \d+$/)).not.toBeInTheDocument();
  });

  it("pages a two-week grid one week at a time", () => {
    render(<CoverageSectionRow section={{ ...section, daily: makeDaily("2026-09-20", 14) }} />);

    // Every day still renders, the reader just swipes to the second week.
    expect(screen.getAllByText("12/15")).toHaveLength(14);
    expect(screen.getByLabelText("Week 1 of 2")).toBeInTheDocument();
    // The strip scrolls, so it lives beside the row's press target, not in it:
    // nested in the Pressable, iOS turned the swipe into a press.
    const rowButton = screen.getByRole("button", { name: "ICU, 67 percent covered" });
    expect(within(rowButton).queryByText("12/15")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(/^2026-09-20 12 of 15 filled, .*2026-10-03 12 of 15 filled$/),
    ).toBeInTheDocument();
  });
});

function makeDaily(startDate: string, count: number) {
  const [y, m, d] = startDate.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(y!, m! - 1, d! + index));
    return {
      dateKey: date.toISOString().slice(0, 10),
      filledCount: 12,
      requiredCount: 15,
      status: "amber" as const,
    };
  });
}
