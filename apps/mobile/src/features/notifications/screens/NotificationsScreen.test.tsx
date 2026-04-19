import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQueryStateCardModule,
  createReactNativeModule,
  createScreenModule,
} from "../../../test/native";

const useQuery = vi.fn();
const useAccessToken = vi.fn();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  useQuery,
}));

vi.mock("../../../shared/components/Screen", async () =>
  createScreenModule(await import("react")),
);

vi.mock("../../../shared/components/QueryStateCard", async () =>
  createQueryStateCardModule(await import("react")),
);

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

let NotificationsScreen: (typeof import("./NotificationsScreen"))["default"];

beforeAll(async () => {
  NotificationsScreen = (await import("./NotificationsScreen")).default;
});

describe("NotificationsScreen", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useAccessToken.mockReset();
    useAccessToken.mockReturnValue("token-123");
  });

  it("shows the loading state before alerts arrive", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<NotificationsScreen />);

    expect(screen.getByText("Loading alerts")).toBeInTheDocument();
  });

  it("shows a retryable error state", () => {
    const refetch = vi.fn();
    useQuery.mockReturnValue({
      data: undefined,
      error: new Error("Forbidden"),
      isFetching: false,
      isLoading: false,
      refetch,
    });

    render(<NotificationsScreen />);

    expect(screen.getByText("Could not load alerts")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try Again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state when no alerts exist", () => {
    useQuery.mockReturnValue({
      data: {
        notifications: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<NotificationsScreen />);

    expect(screen.getByText("No alerts yet")).toBeInTheDocument();
  });
});
