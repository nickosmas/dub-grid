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

const usePrefetchOtherDashboardPeriod = vi.fn();

vi.mock("../hooks/usePrefetchOtherDashboardPeriod", () => ({
  usePrefetchOtherDashboardPeriod,
}));

vi.mock("../components/MyScheduleCard", () => ({
  MyScheduleCard: ({
    onExpand,
    onOpenDay,
    range,
  }: {
    onExpand?: () => void;
    onOpenDay?: (day: { date: string; entry: { employeeId: string } | null }) => void;
    range?: { startDate: string; endDate: string };
  }) => (
    <div>
      my-schedule-card
      {range ? (
        <span data-testid="my-schedule-range">{`${range.startDate}..${range.endDate}`}</span>
      ) : null}
      {onExpand ? (
        <button onClick={onExpand} type="button">
          expand
        </button>
      ) : null}
      {onOpenDay ? (
        <>
          <button
            onClick={() => onOpenDay({ date: "2026-09-23", entry: { employeeId: "emp-9" } })}
            type="button"
          >
            open shift day
          </button>
          <button onClick={() => onOpenDay({ date: "2026-09-24", entry: null })} type="button">
            open empty day
          </button>
        </>
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

const setQueryData = vi.fn();

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: { invalidateQueries, setQueryData },
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
    setQueryData.mockReset();
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

  it("shows unpublished draft changes only when the authorized summary is non-zero", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...EMPTY_DASHBOARD_DATA,
        metrics: {
          ...EMPTY_DASHBOARD_DATA.metrics,
          draftSummary: { newCount: 1, modifiedCount: 0, deletedCount: 1, total: 2 },
        },
      },
    });

    render(<AdminHomeScreen />);

    expect(screen.getByText("Unpublished changes")).toBeInTheDocument();
    expect(screen.getByText("1 new change")).toBeInTheDocument();
    expect(screen.getByText("1 deleted change")).toBeInTheDocument();
  });

  it("hides authorized zero and permission-redacted draft summaries", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...EMPTY_DASHBOARD_DATA,
        metrics: {
          ...EMPTY_DASHBOARD_DATA.metrics,
          draftSummary: { newCount: 0, modifiedCount: 0, deletedCount: 0, total: 0 },
        },
      },
    });

    const { rerender } = render(<AdminHomeScreen />);
    expect(screen.queryByText("Unpublished changes")).not.toBeInTheDocument();

    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });
    rerender(<AdminHomeScreen />);

    expect(screen.queryByText("Unpublished changes")).not.toBeInTheDocument();
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

  it("opens a tapped shift's detail page straight from Your schedule", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });
    // One entry, or the card is not shown at all.
    const scheduleData = {
      range: { startDate: "2026-09-20", endDate: "2026-09-26" },
      entries: [{ employeeId: "emp-9", date: "2026-09-23" }],
    };
    useMyScheduleQuery.mockReturnValue({ isLoading: false, data: scheduleData });

    render(<AdminHomeScreen />);

    const range = useAdminDashboard.mock.calls.at(-1)?.[1] as {
      startDate: string;
      endDate: string;
    };
    fireEvent.click(screen.getByText("open shift day"));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/shift/[employeeId]/[date]",
      params: {
        employeeId: "emp-9",
        date: "2026-09-23",
        rangeStart: range.startDate,
        rangeEnd: range.endDate,
        source: "mine",
      },
    });
    // The detail screen finds the card's schedule already under its own key.
    expect(setQueryData).toHaveBeenCalledWith(
      expect.arrayContaining(["mobile", "schedule", "mine", range.startDate, range.endDate]),
      scheduleData,
    );
  });

  it("opens the schedule on a tapped empty day, which has no item to detail", () => {
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

    fireEvent.click(screen.getByText("open empty day"));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/home/my-schedule",
      params: { date: "2026-09-24" },
    });
  });

  it("warms the other period alongside the current one", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isPlaceholderData: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
      dataUpdatedAt: 1700,
    });

    render(<AdminHomeScreen />);

    expect(usePrefetchOtherDashboardPeriod).toHaveBeenLastCalledWith(
      expect.objectContaining({
        periodMode: "week",
        includeSchedule: true,
        ready: true,
        currentUpdatedAt: 1700,
      }),
    );
  });

  it("gives Your schedule the same period as the rest of the page", () => {
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
    fireEvent.click(screen.getByText("2 Weeks"));

    const dashboardRange = useAdminDashboard.mock.calls.at(-1)?.[1] as {
      startDate: string;
      endDate: string;
    };
    expect(useMyScheduleQuery).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ range: dashboardRange }),
    );
    expect(screen.getByTestId("my-schedule-range")).toHaveTextContent(
      `${dashboardRange.startDate}..${dashboardRange.endDate}`,
    );
  });

  it("covers the page with a centered spinner while the next period is still fetching", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isPlaceholderData: true,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    expect(screen.getByTestId("period-loading")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading period")).toBeInTheDocument();
  });

  it("lifts the loading overlay once the period has landed", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isPlaceholderData: false,
      // A background refetch of the period already on screen is not a period
      // change, so it gets no scrim.
      isFetching: true,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });

    render(<AdminHomeScreen />);

    expect(screen.queryByTestId("period-loading")).not.toBeInTheDocument();
  });

  it("renders the greeting header without the org name", () => {
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
    // The org name left the header (it is on Profile); the header is a
    // two-word greeting and the period, nothing more.
    expect(screen.queryByText(/Acme Care/)).not.toBeInTheDocument();
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
