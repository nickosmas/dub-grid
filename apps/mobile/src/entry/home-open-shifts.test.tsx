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

let OpenShiftsExpandedScreen: (typeof import("../../app/(tabs)/home/open-shifts"))["default"];

beforeAll(async () => {
  OpenShiftsExpandedScreen = (await import("../../app/(tabs)/home/open-shifts")).default;
});

function makeShift(overrides: Record<string, unknown> = {}) {
  return {
    id: "shift-1",
    date: "2026-05-12",
    focusAreaId: 1,
    focusAreaName: "ICU",
    needed: 1,
    urgency: "high",
    state: { kind: "open", segments: [] },
    presentation: { label: "D", segments: [], startTime: "07:00:00", endTime: "15:00:00" },
    canVolunteer: true,
    volunteerBlockReason: null,
    ...overrides,
  };
}

describe("OpenShiftsExpandedScreen", () => {
  beforeEach(() => {
    useExpandedDashboardQuery.mockReset();
  });

  it("shows a loading state while the dashboard query is loading", async () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: true, isError: false, data: undefined },
      bootstrapQuery: { isLoading: true, data: undefined },
    });

    render(<OpenShiftsExpandedScreen />);

    // Gated now, so nothing paints for the first beat and a warm cache
    // never flashes a skeleton it immediately replaces.
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
    expect(await screen.findByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading open shifts")).not.toBeInTheDocument();
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

    render(<OpenShiftsExpandedScreen />);

    expect(screen.getByText("Could not load open shifts")).toBeInTheDocument();
  });

  it("shows the empty state when there are no open shifts", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: false, isError: false, data: { openShifts: [] } },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<OpenShiftsExpandedScreen />);

    expect(screen.getByText("No open shifts match this filter")).toBeInTheDocument();
  });

  it("filters shifts by urgency via the filter sheet", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: {
        isLoading: false,
        isError: false,
        data: {
          openShifts: [
            makeShift({ id: "shift-1", focusAreaName: "ICU", urgency: "high" }),
            makeShift({ id: "shift-2", focusAreaName: "Med-Surg", urgency: "low" }),
          ],
        },
      },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<OpenShiftsExpandedScreen />);

    expect(screen.getByText("ICU")).toBeInTheDocument();
    expect(screen.getByText("Med-Surg")).toBeInTheDocument();
    expect(screen.getByText("2 shifts")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Filter open shifts"));
    fireEvent.click(screen.getByText("High"));
    fireEvent.click(screen.getByText("Done"));

    expect(screen.queryByText("Med-Surg")).not.toBeInTheDocument();
    expect(screen.getByText("1 shift")).toBeInTheDocument();
  });
});
