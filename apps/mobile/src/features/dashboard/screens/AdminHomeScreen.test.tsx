import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const useAdminDashboard = vi.fn();
const useMyScheduleQuery = vi.fn();
const invalidateQueries = vi.fn();
let capturedOnRefresh: (() => Promise<unknown>) | undefined;

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

const routerPush = vi.fn();

vi.mock("expo-router", () => ({
  router: { push: routerPush },
}));

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../hooks/useAdminDashboard", () => ({
  useAdminDashboard,
}));

vi.mock("../hooks/useMyScheduleQuery", () => ({
  useMyScheduleQuery,
}));

vi.mock("../components/MyScheduleCard", () => ({
  MyScheduleCard: ({ onExpand }: { onExpand?: () => void }) => (
    <div>
      my-schedule-card
      {onExpand ? (
        <button onClick={onExpand} type="button">
          expand
        </button>
      ) : null}
    </div>
  ),
}));

// useManualRefresh is exercised by its own unit tests — here we only need
// to capture the callback AdminHomeScreen builds, to prove the refresh
// wiring (dashboard + bootstrap refetch, plus the dashboard cache-prefix
// invalidation that also reaches MyScheduleCard's own query) is correct.
vi.mock("../../../shared/hooks/useManualRefresh", () => ({
  useManualRefresh: (onRefresh: () => Promise<unknown>) => {
    capturedOnRefresh = onRefresh;
    return { isRefreshing: false, refresh: onRefresh };
  },
}));

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: { invalidateQueries },
}));

let AdminHomeScreen: (typeof import("./AdminHomeScreen"))["AdminHomeScreen"];

beforeAll(async () => {
  AdminHomeScreen = (await import("./AdminHomeScreen")).AdminHomeScreen;
});

const EMPTY_DASHBOARD_DATA = {
  range: { startDate: "2026-05-11", endDate: "2026-05-17" },
  overtimeThresholdHours: 40,
  heroSummary: {
    statusLabel: "Healthy",
    title: "Schedule health looks good",
    description: "No open gaps or pending requests right now.",
  },
  metrics: { coveragePct: 96, openGapCount: 0, pendingApprovalsCount: 0, draftSummary: null },
  coverageBySection: [],
  openShifts: [],
  activity: [],
  staffHours: [],
  actionQueue: [
    {
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
    },
  ],
};

function makeBootstrapData(overrides: {
  effectiveRole: string;
  focusAreaIds: number[];
  departmentIds: number[];
}) {
  return {
    effectiveRole: overrides.effectiveRole,
    user: { firstName: "Jordan" },
    currentOrg: { name: "Acme Care", timezone: "America/Los_Angeles" },
    linkedEmployee: {
      focusAreaIds: overrides.focusAreaIds,
      departmentIds: overrides.departmentIds,
    },
  };
}

describe("AdminHomeScreen", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    useAdminDashboard.mockReset();
    useMyScheduleQuery.mockReset();
    useMyScheduleQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-17" },
        entries: [{ id: "shift-1" }],
      },
    });
    invalidateQueries.mockReset();
    routerPush.mockReset();
    capturedOnRefresh = undefined;
    useSessionState.mockReturnValue({ accessToken: "token-1" });
  });

  it("shows skeleton placeholders while either query is loading", async () => {
    useBootstrap.mockReturnValue({ isLoading: true, data: undefined });
    useAdminDashboard.mockReturnValue({ isLoading: true, isError: false, data: undefined });

    render(<AdminHomeScreen />);

    // Nothing is painted for the first beat, so a fast response never flashes a
    // skeleton it then immediately replaces.
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();

    expect(await screen.findByTestId("skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton")).toHaveLength(1);
  });

  // The card used to own this query and render null while it loaded, so it
  // appeared *after* the page skeleton cleared and pushed the cards below it
  // down. One gate, one skeleton, one swap.
  it("keeps the one skeleton up until the schedule card's query resolves too", async () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [1] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });
    useMyScheduleQuery.mockReturnValue({ isLoading: true, data: undefined });

    render(<AdminHomeScreen />);

    expect(await screen.findByTestId("skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton")).toHaveLength(1);
    expect(screen.queryByText("my-schedule-card")).not.toBeInTheDocument();
  });

  it("shows a retry state when the dashboard query fails", () => {
    useBootstrap.mockReturnValue({ isLoading: false, data: { effectiveRole: "admin" } });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("network down"),
      data: undefined,
      refetch: vi.fn(),
    });

    render(<AdminHomeScreen />);

    expect(screen.getByText("Could not load dashboard")).toBeInTheDocument();
  });

  it("shows the pending-approvals queue and personal schedule for an admin", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });
    useMyScheduleQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-17" },
        entries: [{ id: "shift-1" }],
      },
    });

    render(<AdminHomeScreen />);

    // "Pending approvals" appears twice for an admin: the hero metric tile
    // label, and the ActionQueueCard title — assert the card actually
    // rendered its data (the queued requester), not just the ambiguous title.
    expect(screen.getByText("Casey Lee")).toBeInTheDocument();
    expect(screen.getByText("my-schedule-card")).toBeInTheDocument();
  });

  it("omits empty summary cards on mobile", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...EMPTY_DASHBOARD_DATA, actionQueue: [] },
    });
    useMyScheduleQuery.mockReturnValue({
      isLoading: false,
      data: { range: { startDate: "2026-05-11", endDate: "2026-05-17" }, entries: [] },
    });

    render(<AdminHomeScreen />);

    expect(screen.queryByText("Casey Lee")).not.toBeInTheDocument();
    expect(screen.queryByText("my-schedule-card")).not.toBeInTheDocument();
    expect(screen.queryByText("No coverage to track yet")).not.toBeInTheDocument();
    expect(screen.queryByText("No open shifts right now")).not.toBeInTheDocument();
    expect(screen.queryByText("No recent activity")).not.toBeInTheDocument();
  });

  it("omits the pending-approvals queue for a super_admin", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({
        effectiveRole: "super_admin",
        focusAreaIds: [1],
        departmentIds: [],
      }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    // The hero metric tile still says "Pending approvals" for super_admin —
    // only the ActionQueueCard's own request list is admin-only.
    expect(screen.queryByText("Casey Lee")).not.toBeInTheDocument();
  });

  it("hides the personal schedule card for a management-only admin", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [], departmentIds: [9] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    expect(screen.queryByText("my-schedule-card")).not.toBeInTheDocument();
  });

  it("still shows the personal schedule card for a management admin who is also scheduled", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [9] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    expect(screen.getByText("my-schedule-card")).toBeInTheDocument();
  });

  it("navigates to the full personal schedule page when Your schedule is expanded", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    fireEvent.click(screen.getByText("expand"));

    expect(routerPush).toHaveBeenCalledWith("/(tabs)/home/my-schedule");
  });

  it("renders the greeting header with the org name", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    expect(screen.getByText(/Jordan/)).toBeInTheDocument();
    expect(screen.getByText(/Acme Care/)).toBeInTheDocument();
  });

  it("prefers the linked employee's name over auth user_metadata, which is often empty", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: {
        effectiveRole: "admin",
        // auth user_metadata firstName is unset, as commonly happens for
        // invited accounts — the employees-table name must win instead.
        user: { firstName: null, email: "alex@example.com" },
        currentOrg: { name: "Acme Care", timezone: "America/Los_Angeles" },
        linkedEmployee: { firstName: "Alex", focusAreaIds: [1], departmentIds: [] },
      },
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    expect(screen.getByText(/Alex/)).toBeInTheDocument();
  });

  it("falls back to the email prefix when neither the employee nor auth metadata has a name", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: {
        effectiveRole: "super_admin",
        user: { firstName: null, email: "casey@example.com" },
        currentOrg: { name: "Acme Care", timezone: "America/Los_Angeles" },
        linkedEmployee: null,
      },
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    expect(screen.getByText(/casey/)).toBeInTheDocument();
  });

  it("refetches with a 14-day range when the global period toggle switches to 2 weeks", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    const initialRange = useAdminDashboard.mock.calls.at(-1)?.[1] as {
      startDate: string;
      endDate: string;
    };
    const initialSpanDays =
      (new Date(`${initialRange.endDate}T00:00:00`).getTime() -
        new Date(`${initialRange.startDate}T00:00:00`).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(initialSpanDays).toBe(6);

    // One global toggle, at the top of the screen, drives every card on the page.
    fireEvent.click(screen.getByText("2 Weeks"));

    const latestRange = useAdminDashboard.mock.calls.at(-1)?.[1] as {
      startDate: string;
      endDate: string;
    };
    const latestSpanDays =
      (new Date(`${latestRange.endDate}T00:00:00`).getTime() -
        new Date(`${latestRange.startDate}T00:00:00`).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(latestSpanDays).toBe(13);
  });

  it("refetches with a single-day range when the global period toggle switches to Day", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    fireEvent.click(screen.getByText("Day"));

    const latestRange = useAdminDashboard.mock.calls.at(-1)?.[1] as {
      startDate: string;
      endDate: string;
    };
    expect(latestRange.startDate).toBe(latestRange.endDate);
  });

  it("pull-to-refresh refetches the dashboard and bootstrap queries and invalidates the shared dashboard cache prefix", async () => {
    const dashboardRefetch = vi.fn().mockResolvedValue(undefined);
    const bootstrapRefetch = vi.fn().mockResolvedValue(undefined);
    invalidateQueries.mockResolvedValue(undefined);

    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
      refetch: bootstrapRefetch,
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      data: EMPTY_DASHBOARD_DATA,
      refetch: dashboardRefetch,
    });

    render(<AdminHomeScreen />);

    expect(capturedOnRefresh).toBeDefined();
    await capturedOnRefresh?.();

    expect(dashboardRefetch).toHaveBeenCalledTimes(1);
    expect(bootstrapRefetch).toHaveBeenCalledTimes(1);
    // The dashboard-prefix invalidation is what also reaches
    // MyScheduleCard's independently-owned query.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["mobile", "dashboard"] });
  });
});
