import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../test/native";

const useExpandedDashboardQuery = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("../features/dashboard/hooks/useExpandedDashboardQuery", () => ({
  useExpandedDashboardQuery,
}));

let CoverageExpandedScreen: (typeof import("../../app/(tabs)/home/coverage"))["default"];

beforeAll(async () => {
  CoverageExpandedScreen = (await import("../../app/(tabs)/home/coverage")).default;
});

function makeSection(overrides: Record<string, unknown> = {}) {
  return {
    focusAreaId: 1,
    focusAreaName: "ICU",
    requiredTotal: 10,
    filledTotal: 8,
    pct: 80,
    openSlots: 2,
    ...overrides,
  };
}

describe("CoverageExpandedScreen", () => {
  beforeEach(() => {
    useExpandedDashboardQuery.mockReset();
  });

  it("shows a loading state while the dashboard query is loading", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: true, isError: false, data: undefined },
      bootstrapQuery: { isLoading: true, data: undefined },
    });

    render(<CoverageExpandedScreen />);

    expect(screen.getByText("Loading coverage")).toBeInTheDocument();
  });

  it("shows a retry state when the dashboard query fails", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: {
        isLoading: false,
        isError: true,
        error: new Error("network down"),
        data: undefined,
        refetch: vi.fn(),
      },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<CoverageExpandedScreen />);

    expect(screen.getByText("Could not load coverage")).toBeInTheDocument();
  });

  it("shows the empty state when there are no coverage sections", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: false, isError: false, data: { coverageBySection: [] } },
      bootstrapQuery: { isLoading: false, data: { currentOrg: { labels: {} } } },
    });

    render(<CoverageExpandedScreen />);

    expect(screen.getByText("No coverage to track yet")).toBeInTheDocument();
  });

  it("filters sections by focus area via the filter sheet", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: {
        isLoading: false,
        isError: false,
        data: {
          coverageBySection: [
            makeSection({ focusAreaId: 1, focusAreaName: "ICU" }),
            makeSection({ focusAreaId: 2, focusAreaName: "Med-Surg" }),
          ],
        },
      },
      bootstrapQuery: {
        isLoading: false,
        data: { currentOrg: { labels: { focusArea: "Wings" } } },
      },
    });

    render(<CoverageExpandedScreen />);

    expect(screen.getByText("ICU")).toBeInTheDocument();
    expect(screen.getByText("Med-Surg")).toBeInTheDocument();
    expect(screen.getByText("2 sections")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Filter coverage"));
    const medSurgOptions = screen.getAllByText("Med-Surg");
    fireEvent.click(medSurgOptions[0]);
    fireEvent.click(screen.getByText("Done"));

    expect(screen.queryByText("ICU")).not.toBeInTheDocument();
    expect(screen.getByText("1 section")).toBeInTheDocument();
  });
});
