import { render, screen } from "@testing-library/react";
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
});
