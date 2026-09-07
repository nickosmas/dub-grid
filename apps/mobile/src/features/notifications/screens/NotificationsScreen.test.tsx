import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useInfiniteQuery = vi.fn();
const useQuery = vi.fn();
const useAccessToken = vi.fn();
const useSessionState = vi.fn();
const markAllNotificationsRead = vi.fn();
const markNotificationRead = vi.fn();
const bulkUpdateNotifications = vi.fn();
const setQueryData = vi.fn();
const push = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  keepPreviousData: Symbol("keepPreviousData"),
  onlineManager: {
    isOnline: () => true,
  },
  useInfiniteQuery,
  useQuery,
}));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("expo-router", () => ({
  router: {
    push,
  },
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("../../../shared/lib/api", () => ({
  bulkUpdateNotifications,
  getNotifications: vi.fn(),
  getNotificationFacets: vi.fn(),
  markAllNotificationsRead,
  markNotificationRead,
}));

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: {
    setQueryData,
  },
}));

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

vi.mock("../hooks/useMobileNotificationsRealtimeTick", () => ({
  useMobileNotificationsRealtimeTick: vi.fn(),
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

let NotificationsScreen: (typeof import("./NotificationsScreen"))["default"];

beforeAll(async () => {
  NotificationsScreen = (await import("./NotificationsScreen")).default;
});

const SAMPLE_NOTIFICATION = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "shift_request_new",
  channel: "in_app",
  category: "shift_requests",
  title: "Pickup available",
  message: "A shift is waiting for response.",
  metadata: { requestId: "req-1" } as Record<string, unknown>,
  priority: "high",
  groupKey: null,
  groupCount: 1,
  actionUrl: "/requests?id=req-1&tab=approval",
  actionLabel: "Review",
  readAt: null,
  archivedAt: null,
  createdAt: "2026-04-24T12:00:00.000Z",
};

function buildInfiniteQueryResult(
  overrides: Partial<{
    notifications: (typeof SAMPLE_NOTIFICATION)[];
    unreadCount: number;
    isLoading: boolean;
    error: Error | null;
  }> = {},
) {
  const refetch = vi.fn().mockResolvedValue(undefined);
  return {
    data: {
      pages: [
        {
          notifications: overrides.notifications ?? [],
          unreadCount: overrides.unreadCount ?? 0,
          nextCursor: null,
        },
      ],
    },
    isLoading: overrides.isLoading ?? false,
    error: overrides.error ?? null,
    refetch,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  };
}

describe("NotificationsScreen", () => {
  beforeEach(() => {
    useInfiniteQuery.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useSessionState.mockReset();
    markAllNotificationsRead.mockReset();
    markNotificationRead.mockReset();
    bulkUpdateNotifications.mockReset();
    setQueryData.mockReset();
    push.mockReset();
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useSessionState.mockReturnValue({ session: { user: { id: "user-1" } } });
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
  });

  function mockBootstrapPermissions(permissions: { canApproveShiftRequests: boolean }) {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => ({
      data: queryKey[1] === "bootstrap" ? { permissions } : undefined,
      error: null,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    }));
  }

  it("shows the empty state when no alerts exist", () => {
    useInfiniteQuery.mockReturnValue(buildInfiniteQueryResult());

    render(<NotificationsScreen />);

    expect(screen.getByText("No alerts yet")).toBeInTheDocument();
  });

  // Alerts are addressed by role when they are sent, but roles change after
  // the fact: an approval request left behind by a demotion names someone
  // else's request and can no longer be acted on.
  it("hides approval alerts from someone who can no longer approve", () => {
    mockBootstrapPermissions({ canApproveShiftRequests: false });
    useInfiniteQuery.mockReturnValue(
      buildInfiniteQueryResult({
        notifications: [
          {
            ...SAMPLE_NOTIFICATION,
            id: "00000000-0000-4000-8000-000000000002",
            title: "New swap request",
            metadata: { requestId: "req-2", action: "approve_request", tab: "approval" },
          },
          SAMPLE_NOTIFICATION,
        ],
        unreadCount: 2,
      }),
    );

    render(<NotificationsScreen />);

    expect(screen.queryByText("New swap request")).not.toBeInTheDocument();
    expect(screen.getByText("Pickup available")).toBeInTheDocument();
  });

  it("keeps approval alerts for someone who can approve", () => {
    mockBootstrapPermissions({ canApproveShiftRequests: true });
    useInfiniteQuery.mockReturnValue(
      buildInfiniteQueryResult({
        notifications: [
          {
            ...SAMPLE_NOTIFICATION,
            id: "00000000-0000-4000-8000-000000000002",
            title: "New swap request",
            metadata: { requestId: "req-2", action: "approve_request", tab: "approval" },
          },
        ],
        unreadCount: 1,
      }),
    );

    render(<NotificationsScreen />);

    expect(screen.getByText("New swap request")).toBeInTheDocument();
  });

  // The filter row was a third hand-rolled chip strip, so selecting a filter
  // that sat off the right edge left it scrolled out of view. It now rides on
  // ScrollableTabStrip, which is what scrolls the active tab back in.
  it("renders the filters as a scrollable tab strip", () => {
    useInfiniteQuery.mockReturnValue(buildInfiniteQueryResult());

    render(<NotificationsScreen />);

    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    for (const label of ["Unread", "Schedule", "Requests", "System", "Archived"]) {
      expect(screen.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "false");
    }

    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveAttribute("aria-selected", "true");
  });

  // Search and filter are both in the query key, so a keystroke starts a new
  // query. `hasData` used to be derived from the rendered list's length, which
  // meant the skeleton repainted over alerts the user was mid-read.
  it("does not repaint a skeleton over alerts that are already on screen", async () => {
    useInfiniteQuery.mockReturnValue(
      buildInfiniteQueryResult({ notifications: [SAMPLE_NOTIFICATION], unreadCount: 1 }),
    );

    render(<NotificationsScreen />);
    expect(screen.getByText("Pickup available")).toBeInTheDocument();

    // A new key resolving: still fetching, and the derived list is momentarily
    // empty, but the query itself has previous data to show.
    useInfiniteQuery.mockReturnValue({
      ...buildInfiniteQueryResult({ notifications: [], isLoading: true }),
      data: { pages: [{ notifications: [], unreadCount: 0, nextCursor: null }] },
    });

    fireEvent.click(screen.getByText("Unread"));

    await waitFor(() => {
      expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
    });
  });

  it("opens the detail screen when an alert is tapped and marks it read first", async () => {
    const queryResult = buildInfiniteQueryResult({
      notifications: [SAMPLE_NOTIFICATION],
      unreadCount: 1,
    });
    useInfiniteQuery.mockReturnValue(queryResult);
    const facetsRefetch = vi.fn().mockResolvedValue(undefined);
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
      refetch: facetsRefetch,
    });
    markNotificationRead.mockResolvedValue({
      success: true,
      unreadCount: 0,
    });

    render(<NotificationsScreen />);

    fireEvent.click(screen.getByText("Pickup available"));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith("token-123", SAMPLE_NOTIFICATION.id);
    });
    expect(push).toHaveBeenCalledWith({
      pathname: "/alerts/[id]",
      params: { id: SAMPLE_NOTIFICATION.id },
    });
    expect(setQueryData).toHaveBeenCalled();
    // Sidebar/chip badge bug: row-press must refetch both list + facets so
    // filter chip counts stay accurate. handleArchive/handleMarkAllRead already
    // do this — handleRowPress used to skip the facets refetch.
    await waitFor(() => {
      expect(queryResult.refetch).toHaveBeenCalled();
      expect(facetsRefetch).toHaveBeenCalled();
    });
  });

  it("marks all unread alerts as read", async () => {
    const queryResult = buildInfiniteQueryResult({
      notifications: [SAMPLE_NOTIFICATION],
      unreadCount: 1,
    });
    useInfiniteQuery.mockReturnValue(queryResult);
    markAllNotificationsRead.mockResolvedValue({
      success: true,
      unreadCount: 0,
    });

    render(<NotificationsScreen />);

    fireEvent.click(screen.getByText("Mark all read"));

    const confirmDialog = await screen.findByRole("alert");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Mark all read" }));

    await waitFor(() => {
      expect(markAllNotificationsRead).toHaveBeenCalledWith("token-123");
    });
    expect(queryResult.refetch).toHaveBeenCalled();
  });

  it("does not navigate when marking the alert read fails", async () => {
    useInfiniteQuery.mockReturnValue(
      buildInfiniteQueryResult({
        notifications: [SAMPLE_NOTIFICATION],
        unreadCount: 1,
      }),
    );
    markNotificationRead.mockRejectedValue(new Error("Database is unavailable"));

    render(<NotificationsScreen />);

    fireEvent.click(screen.getByText("Pickup available"));

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalled();
    });
    expect(push).not.toHaveBeenCalled();
  });
});
