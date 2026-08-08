import { render, screen } from "@testing-library/react";
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

let PendingApprovalsExpandedScreen: (typeof import("../../app/(tabs)/home/pending-approvals"))["default"];

beforeAll(async () => {
  PendingApprovalsExpandedScreen = (await import("../../app/(tabs)/home/pending-approvals"))
    .default;
});

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    orgId: "org-1",
    type: "pickup",
    status: "pending_approval",
    requesterEmpId: "emp-1",
    requesterName: "Casey Lee",
    requesterShiftDate: "2026-05-12",
    requesterState: { kind: "worked", segments: [] },
    requesterPresentation: { label: "D", segments: [] },
    targetEmpId: null,
    targetName: null,
    targetShiftDate: null,
    absenceTypeId: null,
    parentRequestId: null,
    adminUserId: null,
    adminNote: null,
    expiresAt: "2026-05-12T00:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("PendingApprovalsExpandedScreen", () => {
  beforeEach(() => {
    useExpandedDashboardQuery.mockReset();
  });

  it("shows a loading state while the dashboard query is loading", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: true, isError: false, data: undefined },
      bootstrapQuery: { isLoading: true, data: undefined },
    });

    render(<PendingApprovalsExpandedScreen />);

    expect(screen.getByTestId("list-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading pending approvals")).not.toBeInTheDocument();
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

    render(<PendingApprovalsExpandedScreen />);

    expect(screen.getByText("Could not load pending approvals")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is waiting", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: { isLoading: false, isError: false, data: { actionQueue: [] } },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<PendingApprovalsExpandedScreen />);

    expect(screen.getByText("No requests are waiting on you")).toBeInTheDocument();
  });

  it("renders the full list of pending requests with no filter control", () => {
    useExpandedDashboardQuery.mockReturnValue({
      dashboardQuery: {
        isLoading: false,
        isError: false,
        data: {
          actionQueue: [
            makeRequest({ id: "req-1", requesterName: "Casey Lee" }),
            makeRequest({ id: "req-2", requesterName: "Jordan Lee", type: "swap" }),
          ],
        },
      },
      bootstrapQuery: { isLoading: false, data: {} },
    });

    render(<PendingApprovalsExpandedScreen />);

    expect(screen.getByText("Casey Lee")).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Filter/)).not.toBeInTheDocument();
  });
});
