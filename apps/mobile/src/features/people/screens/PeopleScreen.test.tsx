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
const pushToast = vi.fn();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    isOnline: () => true,
  },
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

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

let PeopleScreen: (typeof import("./PeopleScreen"))["default"];

beforeAll(async () => {
  PeopleScreen = (await import("./PeopleScreen")).default;
});

describe("PeopleScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
        focusAreas: [
          {
            id: 2,
            name: "Skilled Nursing",
          },
        ],
        permissions: {
          canManageEmployees: true,
        },
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

  it("shows the loading state while the directory is being fetched", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("Loading directory")).toBeInTheDocument();
  });

  it("shows a locked state when the user lacks directory access", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: new Error("Unauthorized"),
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("Directory unavailable")).toBeInTheDocument();
  });

  it("shows the empty state when the workspace has no teammates yet", () => {
    useQuery.mockReturnValue({
      data: {
        people: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PeopleScreen />);

    expect(screen.getByText("No teammates yet")).toBeInTheDocument();
  });

  it("shows person details and lets managers bench teammates", () => {
    const mutate = vi.fn();
    useQuery.mockReturnValue({
      data: {
        people: [
          {
            id: "emp-1",
            firstName: "Mina",
            lastName: "Diaz",
            phone: "555-0100",
            email: "mina@dubgrid.com",
            status: "active",
            focusAreaIds: [2],
            roleIds: [3],
            departmentIds: [4],
            contactNotes: "Weekend availability",
            statusChangedAt: "2026-04-24T12:00:00.000Z",
            statusNote: "",
            version: 7,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate,
    });

    render(<PeopleScreen />);

    expect(
      screen.getByText(/Focus areas:\s*Skilled Nursing/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Details"));

    expect(screen.getByText("Weekend availability")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Bench"));

    expect(mutate).toHaveBeenCalledWith({
      personId: "emp-1",
      action: "bench",
      expectedVersion: 7,
    });
  });
});
