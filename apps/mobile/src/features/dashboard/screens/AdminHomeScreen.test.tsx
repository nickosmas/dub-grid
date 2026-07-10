import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const useAdminDashboard = vi.fn();

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

vi.mock("../components/MyScheduleCard", () => ({
  MyScheduleCard: () => <div>my-schedule-card</div>,
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
  metrics: { coveragePct: 96, openGapCount: 0, pendingApprovalsCount: 0 },
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
    useSessionState.mockReturnValue({ accessToken: "token-1" });
  });

  it("shows a loading state while either query is loading", () => {
    useBootstrap.mockReturnValue({ isLoading: true, data: undefined });
    useAdminDashboard.mockReturnValue({ isLoading: true, isError: false, data: undefined });

    render(<AdminHomeScreen />);

    expect(screen.getByText("Loading your dashboard")).toBeInTheDocument();
  });

  it("shows a retry state when the dashboard query fails", () => {
    useBootstrap.mockReturnValue({ isLoading: false, data: { effectiveRole: "admin" } });
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: vi.fn() });

    render(<AdminHomeScreen />);

    expect(screen.getByText("Couldn't load your dashboard")).toBeInTheDocument();
  });

  it("shows the pending-approvals queue and personal schedule for an admin", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DASHBOARD_DATA });

    render(<AdminHomeScreen />);

    // "Pending approvals" appears twice for an admin: the hero metric tile
    // label, and the ActionQueueCard title — assert the card actually
    // rendered its data (the queued requester), not just the ambiguous title.
    expect(screen.getByText("Casey Lee")).toBeInTheDocument();
    expect(screen.getByText("my-schedule-card")).toBeInTheDocument();
  });

  it("omits the pending-approvals queue for a super_admin", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "super_admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DASHBOARD_DATA });

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
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DASHBOARD_DATA });

    render(<AdminHomeScreen />);

    expect(screen.queryByText("my-schedule-card")).not.toBeInTheDocument();
  });

  it("still shows the personal schedule card for a management admin who is also scheduled", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [9] }),
    });
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DASHBOARD_DATA });

    render(<AdminHomeScreen />);

    expect(screen.getByText("my-schedule-card")).toBeInTheDocument();
  });

  it("renders the greeting header with the org name", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DASHBOARD_DATA });

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
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DASHBOARD_DATA });

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
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DASHBOARD_DATA });

    render(<AdminHomeScreen />);

    expect(screen.getByText(/casey/)).toBeInTheDocument();
  });

  it("refetches with a 14-day range when the shared period toggle switches to 2 weeks", () => {
    useBootstrap.mockReturnValue({
      isLoading: false,
      data: makeBootstrapData({ effectiveRole: "admin", focusAreaIds: [1], departmentIds: [] }),
    });
    useAdminDashboard.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DASHBOARD_DATA });

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

    // Coverage gaps, Open shifts, and Overtime watch all render the same
    // shared toggle — pressing any of them should switch the whole page.
    fireEvent.click(screen.getAllByText("2 Weeks")[0]);

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
});
