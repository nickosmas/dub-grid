import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQueryStateCardModule,
  createReactNativeModule,
  createScreenModule,
} from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@tanstack/react-query", () => ({
  useMutation,
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

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

let RequestsScreen: (typeof import("./RequestsScreen"))["default"];

beforeAll(async () => {
  RequestsScreen = (await import("./RequestsScreen")).default;
});

describe("RequestsScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
        linkedEmployee: {
          id: "emp-1",
          focusAreaIds: [2],
        },
        currentOrg: {
          timezone: null,
        },
        effectiveRole: "admin",
        permissions: {
          canApproveShiftRequests: true,
        },
        absenceTypes: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });
  });

  it("shows the loading state before requests are available", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Loading shift requests")).toBeInTheDocument();
  });

  it("shows a retryable query error state", () => {
    const refetch = vi.fn();
    useQuery.mockReturnValue({
      data: undefined,
      error: new Error("Request failed"),
      isFetching: false,
      isLoading: false,
      refetch,
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Could not load requests")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try Again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state when no requests exist", () => {
    useQuery.mockReturnValue({
      data: {
        requests: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("No request activity yet")).toBeInTheDocument();
  });

  it("surfaces mutation errors above existing request content", () => {
    useQuery.mockReturnValue({
      data: {
        requests: [
          {
            id: "req-1",
            requesterName: "Mina Diaz",
            requesterShiftDate: "2026-04-17",
            status: "open",
            type: "pickup",
            requesterShiftLabel: "Day",
            requesterEmpId: "emp-2",
            targetEmpId: null,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useMutation.mockReturnValue({
      error: new Error("Already resolved"),
      isPending: false,
      mutate: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Could not update request")).toBeInTheDocument();
    expect(screen.getByText("Already resolved")).toBeInTheDocument();
  });
});
