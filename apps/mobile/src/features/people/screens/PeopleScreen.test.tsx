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

let PeopleScreen: (typeof import("./PeopleScreen"))["default"];

beforeAll(async () => {
  PeopleScreen = (await import("./PeopleScreen")).default;
});

describe("PeopleScreen", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useAccessToken.mockReset();
    useAccessToken.mockReturnValue("token-123");
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

  it("shows the empty state when the user lacks staff visibility", () => {
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

    expect(screen.getByText("Directory unavailable")).toBeInTheDocument();
  });
});
