import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

// No layout width at all: the strip has not been measured yet.
vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

let CoverageSectionRow: (typeof import("./CoverageSectionRow"))["CoverageSectionRow"];

beforeAll(async () => {
  CoverageSectionRow = (await import("./CoverageSectionRow")).CoverageSectionRow;
});

describe("CoverageSectionRow before the strip is measured", () => {
  it("shows the first week flat with the pager dots instead of an unsized pager", () => {
    const daily = Array.from({ length: 14 }, (_, index) => ({
      dateKey: `2026-09-${String(20 + index).padStart(2, "0")}`,
      filledCount: index,
      requiredCount: 15,
      status: "amber" as const,
    }));

    render(
      <CoverageSectionRow
        section={{
          focusAreaId: 1,
          focusAreaName: "ICU",
          requiredTotal: 210,
          filledTotal: 91,
          pct: 43,
          openSlots: 119,
          daily,
        }}
      />,
    );

    // The first frame is week one at full width; the second week waits for
    // the width the scroller needs, so nothing is squeezed into 14 columns.
    expect(screen.getByText("0/15")).toBeInTheDocument();
    expect(screen.getByText("6/15")).toBeInTheDocument();
    expect(screen.queryByText("7/15")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Week 1 of 2")).toBeInTheDocument();
  });
});
