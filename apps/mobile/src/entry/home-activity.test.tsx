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

let ActivityExpandedScreen: (typeof import("../../app/(tabs)/home/activity"))["default"];

beforeAll(async () => {
  ActivityExpandedScreen = (await import("../../app/(tabs)/home/activity")).default;
});

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    type: "publish",
    description: "Jordan Lee published the schedule",
    timestamp: "2026-05-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("ActivityExpandedScreen", () => {
  beforeEach(() => {
    useExpandedDashboardQuery.mockReset();
  });

  it("shows a loading state while the dashboard query is loading", async () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: true, isError: false, data: undefined },
      bootstrapQuery: { isLoading: true, data: undefined },
    });

    render(<ActivityExpandedScreen />);

    // Gated now, so nothing paints for the first beat and a warm cache
    // never flashes a skeleton it immediately replaces.
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
    expect(await screen.findByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading activity")).not.toBeInTheDocument();
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

    render(<ActivityExpandedScreen />);

    expect(screen.getByText("Could not load activity")).toBeInTheDocument();
  });

  it("shows the empty state when there is no activity", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: false, isError: false, data: { activity: [] } },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<ActivityExpandedScreen />);

    expect(screen.getByText("No activity matches this filter")).toBeInTheDocument();
  });

  it("filters activity across all four event types via the filter sheet", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: {
        isLoading: false,
        isError: false,
        data: {
          activity: [
            makeItem({ id: "pub-1", type: "publish", description: "Schedule published" }),
            makeItem({
              id: "signup-1",
              type: "user_signup",
              description: "User sign-up completed",
            }),
          ],
        },
      },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<ActivityExpandedScreen />);

    expect(screen.getByText("Schedule published")).toBeInTheDocument();
    expect(screen.getByText("User sign-up completed")).toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Filter activity"));
    const signUpOptions = screen.getAllByText("Sign-up");
    fireEvent.click(signUpOptions[0]);
    fireEvent.click(screen.getByText("Done"));

    expect(screen.queryByText("Schedule published")).not.toBeInTheDocument();
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });
});
