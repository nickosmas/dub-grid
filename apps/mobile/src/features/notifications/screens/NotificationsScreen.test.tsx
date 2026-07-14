import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useInfiniteQuery = vi.fn();
const useQuery = vi.fn();
const useAccessToken = vi.fn();
const markAllNotificationsRead = vi.fn();
const markNotificationRead = vi.fn();
const bulkUpdateNotifications = vi.fn();
const setQueryData = vi.fn();
const push = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
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
  metadata: { requestId: "req-1" },
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
    markAllNotificationsRead.mockReset();
    markNotificationRead.mockReset();
    bulkUpdateNotifications.mockReset();
    setQueryData.mockReset();
    push.mockReset();
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("shows the empty state when no alerts exist", () => {
    useInfiniteQuery.mockReturnValue(buildInfiniteQueryResult());

    render(<NotificationsScreen />);

    expect(screen.getByText("No alerts yet")).toBeInTheDocument();
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
