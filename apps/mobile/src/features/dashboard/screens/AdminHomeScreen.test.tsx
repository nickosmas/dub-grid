import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const useAdminDashboard = vi.fn();
const useMyHomeSections = vi.fn();
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

vi.mock("../hooks/useMyHomeSections", () => ({
  useMyHomeSections,
}));

const usePrefetchAdjacentDashboardWeeks = vi.fn();

vi.mock("../hooks/usePrefetchAdjacentDashboardWeeks", () => ({
  usePrefetchAdjacentDashboardWeeks,
}));

// The sections have their own tests; here only whether and where they show,
// and for which period.
vi.mock("../components/MyHomeSections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../components/MyHomeSections")>()),
  MyHomeSections: ({ range }: { range: { startDate: string; endDate: string } }) => (
    <div>
      my-home-sections
      <span data-testid="my-home-range">{`${range.startDate}..${range.endDate}`}</span>
    </div>
  ),
}));

// useManualRefresh is exercised by its own unit tests — here we only need
// to capture the callback AdminHomeScreen builds, to prove the refresh
// wiring (dashboard, bootstrap and You group refetch, plus the dashboard
// cache-prefix invalidation) is correct.
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
    title: "Nothing needs attention",
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

const refetchMine = vi.fn();

function makeMine(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "token-1",
    isOn: true,
    isResolved: true,
    isLoading: false,
    isPlaceholderData: false,
    linkedEmployeeId: "emp-me",
    timeZone: "America/Los_Angeles",
    entries: [{ id: "shift-1", employeeId: "emp-me", date: "2026-05-12" }],
    scheduleError: null,
    teamEntries: [],
    requests: [],
    openShifts: [],
    requestsError: null,
    scheduleResponse: undefined,
    refetch: refetchMine,
    pendingAction: null,
    runRequestAction: vi.fn(),
    confirmationModal: null,
    ...overrides,
  };
}

// Off whenever the screen asks for it off, as the real hook is for a
// management-only admin.
function setMine(overrides: Record<string, unknown> = {}) {
  const mine = makeMine(overrides);
  useMyHomeSections.mockImplementation(({ enabled }: { enabled: boolean }) => ({
    ...mine,
    isOn: enabled && mine.isOn,
  }));
}

// The chosen view outlives a render, as it does in the app, so each test
// picks the one it needs.
function showView(label: "My schedule" | "Team") {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("AdminHomeScreen", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    useAdminDashboard.mockReset();
    useMyHomeSections.mockReset();
    refetchMine.mockReset();
    setMine();
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

  // Painted after the page skeleton cleared, the You group would push every
  // card below it down. One gate, one skeleton, one swap.
  it("keeps the one skeleton up until the You group's data resolves too", async () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [1] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });
    setMine({ isLoading: true, isResolved: false });

    render(<AdminHomeScreen />);

    expect(await screen.findByTestId("skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton")).toHaveLength(1);
    expect(screen.queryByText("my-home-sections")).not.toBeInTheDocument();
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

    expect(screen.getByText("Couldn't load dashboard")).toBeInTheDocument();
  });

  it("opens on My schedule and switches to the team's cards", () => {
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
    showView("My schedule");

    expect(screen.getByText("my-home-sections")).toBeInTheDocument();
    expect(screen.queryByText("Casey Lee")).not.toBeInTheDocument();

    showView("Team");

    // The ActionQueueCard's queued requester, not the hero's ambiguous label.
    expect(screen.getByText("Casey Lee")).toBeInTheDocument();
    expect(screen.queryByText("my-home-sections")).not.toBeInTheDocument();
    expect(screen.queryByText("Your team")).not.toBeInTheDocument();
    expect(screen.queryByText("Open shifts")).not.toBeInTheDocument();

    showView("My schedule");

    expect(screen.getByText("my-home-sections")).toBeInTheDocument();
  });

  it("keeps empty team cards with their empty states, as on web", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...EMPTY_DASHBOARD_DATA, actionQueue: [] },
    });

    render(<AdminHomeScreen />);
    showView("Team");

    expect(screen.queryByText("Casey Lee")).not.toBeInTheDocument();
    expect(screen.getByText("No requests are waiting on you")).toBeInTheDocument();
    expect(screen.getByText(/No one is over \d+h this period/)).toBeInTheDocument();
    expect(screen.getByText("No recent activity")).toBeInTheDocument();
  });

  // Drafts can only be published on the web, so Home never mentions them.
  it("shows no Unpublished changes card, even with drafts waiting", () => {
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
    showView("Team");

    expect(screen.queryByText("Unpublished changes")).not.toBeInTheDocument();
    expect(screen.queryByText("1 new change")).not.toBeInTheDocument();
  });

  it("shows the pending-approvals queue to a super_admin too", () => {
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
    showView("Team");

    expect(screen.getByText("Casey Lee")).toBeInTheDocument();
  });

  it("gives a management-only admin the team alone, with no switch", () => {
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

    expect(screen.queryByRole("button", { name: "My schedule" })).not.toBeInTheDocument();
    expect(screen.queryByText("my-home-sections")).not.toBeInTheDocument();
    expect(screen.getByText("Casey Lee")).toBeInTheDocument();
  });

  it("gives the team alone to an admin with no staff profile", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: EMPTY_DASHBOARD_DATA,
    });
    setMine({ isOn: false });

    render(<AdminHomeScreen />);

    expect(screen.queryByRole("button", { name: "Team" })).not.toBeInTheDocument();
    expect(screen.getByText("Casey Lee")).toBeInTheDocument();
  });

  it("keeps My schedule for a management admin who is also scheduled", () => {
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
    showView("My schedule");

    expect(screen.getByText("my-home-sections")).toBeInTheDocument();
  });

  it("keeps the chosen view when the week changes", () => {
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
    showView("Team");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(screen.getByRole("button", { name: "Team" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Casey Lee")).toBeInTheDocument();
  });

  it("warms the weeks either side of the one shown", () => {
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

    const range = useAdminDashboard.mock.calls.at(-1)?.[1];
    expect(usePrefetchAdjacentDashboardWeeks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        range,
        includeSchedule: true,
        ready: true,
        currentUpdatedAt: 1700,
      }),
    );
  });

  it("gives the You group the same week as the rest of the page", () => {
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
    showView("My schedule");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    const dashboardRange = useAdminDashboard.mock.calls.at(-1)?.[1] as {
      startDate: string;
      endDate: string;
    };
    expect(useMyHomeSections).toHaveBeenLastCalledWith(
      expect.objectContaining({ range: dashboardRange }),
    );
    expect(screen.getByTestId("my-home-range")).toHaveTextContent(
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

  it("steps the whole page a week at a time from the header, and Today comes back", () => {
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

    const rangeNow = () =>
      useAdminDashboard.mock.calls.at(-1)?.[1] as { startDate: string; endDate: string };
    const thisWeek = rangeNow();
    const days = (from: string, to: string) =>
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(new Date(`${thisWeek.startDate}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(days(thisWeek.startDate, thisWeek.endDate)).toBe(6);
    expect(screen.getByText(/^Today, /)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(days(thisWeek.startDate, rangeNow().startDate)).toBe(7);

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(days(thisWeek.startDate, rangeNow().startDate)).toBe(-7);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(rangeNow()).toEqual(thisWeek);
  });

  it("opens a card's detail on the week shown", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...EMPTY_DASHBOARD_DATA,
        metrics: { ...EMPTY_DASHBOARD_DATA.metrics, pendingApprovalsCount: 2 },
      },
    });

    render(<AdminHomeScreen />);
    showView("Team");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    const range = useAdminDashboard.mock.calls.at(-1)?.[1] as { startDate: string };
    fireEvent.click(screen.getByRole("button", { name: "2 pending approvals" }));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/home/pending-approvals",
      params: { weekOf: range.startDate },
    });
  });

  it("pull-to-refresh refetches the dashboard, bootstrap and You group and invalidates the shared dashboard cache prefix", async () => {
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
    expect(refetchMine).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["mobile", "dashboard"] });
  });
});
