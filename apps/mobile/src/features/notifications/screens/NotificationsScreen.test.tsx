import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQueryStateCardModule,
  createReactNativeModule,
  createScreenModule,
} from "../../../test/native";

const useQuery = vi.fn();
const useAccessToken = vi.fn();
const markAllNotificationsRead = vi.fn();
const markNotificationRead = vi.fn();
const setQueryData = vi.fn();
const push = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  onlineManager: {
    isOnline: () => true,
  },
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

vi.mock("../../../shared/components/Screen", async () =>
  createScreenModule(await import("react")),
);

vi.mock("../../../shared/components/QueryStateCard", async () =>
  createQueryStateCardModule(await import("react")),
);

vi.mock("../../../shared/lib/api", () => ({
  getNotifications: vi.fn(),
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

describe("NotificationsScreen", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useAccessToken.mockReset();
    markAllNotificationsRead.mockReset();
    markNotificationRead.mockReset();
    setQueryData.mockReset();
    push.mockReset();
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
  });

  it("shows the loading state before alerts arrive", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<NotificationsScreen />);

    expect(screen.getByText("Loading alerts")).toBeInTheDocument();
  });

  it("shows a retryable error state", () => {
    const refetch = vi.fn();
    useQuery.mockReturnValue({
      data: undefined,
      error: new Error("Forbidden"),
      isFetching: false,
      isLoading: false,
      refetch,
    });

    render(<NotificationsScreen />);

    expect(screen.getByText("Could not load alerts")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try Again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state when no alerts exist", () => {
    useQuery.mockReturnValue({
      data: {
        notifications: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<NotificationsScreen />);

    expect(screen.getByText("No alerts yet")).toBeInTheDocument();
  });

  it("marks unread shift-request alerts as read and routes into requests", async () => {
    const refetch = vi.fn().mockRejectedValue(new Error("Refresh failed"));
    useQuery.mockReturnValue({
      data: {
        notifications: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            type: "shift_request_new",
            channel: "in_app",
            category: "shift_requests",
            title: "Pickup available",
            message: "A shift is waiting for response.",
            metadata: {
              requestId: "req-1",
            },
            readAt: null,
            createdAt: "2026-04-24T12:00:00.000Z",
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch,
    });
    markNotificationRead.mockResolvedValue({
      success: true,
      unreadCount: 0,
    });

    render(<NotificationsScreen />);

    fireEvent.click(screen.getByText("Pickup available"));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith(
        "token-123",
        "00000000-0000-4000-8000-000000000001",
      );
    });
    expect(setQueryData).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({
      pathname: "/(tabs)/requests",
      params: {
        requestId: "req-1",
        tab: "approval",
      },
    });
    expect(pushToast).not.toHaveBeenCalled();
  });

  it("does not navigate away when marking an unread alert as read fails", async () => {
    useQuery.mockReturnValue({
      data: {
        notifications: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            type: "shift_request_new",
            channel: "in_app",
            category: "shift_requests",
            title: "Pickup available",
            message: "A shift is waiting for response.",
            metadata: {
              requestId: "req-1",
            },
            readAt: null,
            createdAt: "2026-04-24T12:00:00.000Z",
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    markNotificationRead.mockRejectedValue(new Error("Database is unavailable"));

    render(<NotificationsScreen />);

    fireEvent.click(screen.getByText("Pickup available"));

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith({
        tone: "error",
        title: "Could not update alerts",
        message: "We couldn't update that alert.",
      });
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("marks all unread alerts as read", async () => {
    const refetch = vi.fn().mockRejectedValue(new Error("Refresh failed"));
    useQuery.mockReturnValue({
      data: {
        notifications: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            type: "schedule_published",
            channel: "in_app",
            category: "schedule",
            title: "Schedule published",
            message: "This week's schedule is live.",
            metadata: {},
            readAt: null,
            createdAt: "2026-04-24T12:00:00.000Z",
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch,
    });
    markAllNotificationsRead.mockResolvedValue({
      success: true,
      unreadCount: 0,
    });

    render(<NotificationsScreen />);

    fireEvent.click(screen.getByText("Mark all read"));

    await waitFor(() => {
      expect(markAllNotificationsRead).toHaveBeenCalledWith("token-123");
    });
    expect(setQueryData).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
  });
});
