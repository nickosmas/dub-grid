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

let StaffHoursExpandedScreen: (typeof import("../../app/(tabs)/home/staff-hours"))["default"];

beforeAll(async () => {
  StaffHoursExpandedScreen = (await import("../../app/(tabs)/home/staff-hours")).default;
});

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: "emp-1",
    employeeName: "Alex Rivera",
    totalHours: 48,
    overtimeHours: 8,
    focusAreaId: 1,
    focusAreaName: "ICU",
    ...overrides,
  };
}

describe("StaffHoursExpandedScreen", () => {
  beforeEach(() => {
    useExpandedDashboardQuery.mockReset();
  });

  it("shows a loading state while the dashboard query is loading", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: true, isError: false, data: undefined },
      bootstrapQuery: { isLoading: true, data: undefined },
    });

    render(<StaffHoursExpandedScreen />);

    expect(screen.getByTestId("list-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading overtime watch")).not.toBeInTheDocument();
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

    render(<StaffHoursExpandedScreen />);

    expect(screen.getByText("Could not load overtime watch")).toBeInTheDocument();
  });

  it("shows the threshold-aware empty state when no one is over the limit", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: {
        isLoading: false,
        isError: false,
        data: { staffHours: [], overtimeThresholdHours: 40 },
      },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<StaffHoursExpandedScreen />);

    expect(screen.getByText("No one is over 40h this period")).toBeInTheDocument();
  });

  it("filters entries by focus area via the filter sheet", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: {
        isLoading: false,
        isError: false,
        data: {
          overtimeThresholdHours: 40,
          staffHours: [
            makeEntry({ employeeId: "emp-1", employeeName: "Alex Rivera", focusAreaName: "ICU" }),
            makeEntry({
              employeeId: "emp-2",
              employeeName: "Jordan Lee",
              focusAreaName: "Med-Surg",
            }),
          ],
        },
      },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<StaffHoursExpandedScreen />);

    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getByText("2 people")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Filter overtime watch"));
    const medSurgOptions = screen.getAllByText("Med-Surg");
    fireEvent.click(medSurgOptions[0]);
    fireEvent.click(screen.getByText("Done"));

    expect(screen.queryByText("Alex Rivera")).not.toBeInTheDocument();
    expect(screen.getByText("1 person")).toBeInTheDocument();
  });

  it("sorts alphabetically via the filter sheet", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: {
        isLoading: false,
        isError: false,
        data: {
          overtimeThresholdHours: 40,
          staffHours: [
            makeEntry({ employeeId: "emp-1", employeeName: "Zoe Adams", overtimeHours: 12 }),
            makeEntry({ employeeId: "emp-2", employeeName: "Alex Rivera", overtimeHours: 4 }),
          ],
        },
      },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<StaffHoursExpandedScreen />);

    // Default sort is "most overtime" -> Zoe (12h) should lead.
    let names = screen.getAllByText(/Zoe Adams|Alex Rivera/).map((node) => node.textContent);
    expect(names[0]).toBe("Zoe Adams");

    fireEvent.click(screen.getByLabelText("Filter overtime watch"));
    fireEvent.click(screen.getByText("Alphabetical"));
    fireEvent.click(screen.getByText("Done"));

    names = screen.getAllByText(/Zoe Adams|Alex Rivera/).map((node) => node.textContent);
    expect(names[0]).toBe("Alex Rivera");
  });
});
