import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useLocalSearchParams = vi.fn();
const routerBack = vi.fn();
const useQuery = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const pushToast = vi.fn();
const getNotifications = vi.fn();
const markNotificationRead = vi.fn();
const bulkUpdateNotifications = vi.fn();
const isNotificationActionSupportedOnMobile = vi.fn();
const openNotificationAction = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("expo-router", () => ({
  router: { back: routerBack },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery,
  useQueryClient,
}));

vi.mock("../../../shared/lib/api", () => ({
  getNotifications: (...args: unknown[]) => getNotifications(...args),
  markNotificationRead: (...args: unknown[]) => markNotificationRead(...args),
  bulkUpdateNotifications: (...args: unknown[]) => bulkUpdateNotifications(...args),
}));

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast }),
}));

vi.mock("../lib/openNotificationAction", () => ({
  isNotificationActionSupportedOnMobile: (...args: unknown[]) =>
    isNotificationActionSupportedOnMobile(...args),
  openNotificationAction: (...args: unknown[]) => openNotificationAction(...args),
}));

let NotificationDetailScreen: (typeof import("./NotificationDetailScreen"))["default"];

beforeAll(async () => {
  NotificationDetailScreen = (await import("./NotificationDetailScreen")).default;
});

const NOTIFICATION_ID = "00000000-0000-4000-8000-000000000001";

const SAMPLE_NOTIFICATION = {
  id: NOTIFICATION_ID,
  type: "shift_request_new",
  title: "Pickup available",
  message: "A shift is waiting for response.",
  metadata: { actionUrl: "/requests?id=req-1", actionLabel: "Review request" },
  priority: "high",
  readAt: null as string | null,
  archivedAt: null as string | null,
  createdAt: "2026-04-24T12:00:00.000Z",
};

function mockQueryClient(cachedNotifications: (typeof SAMPLE_NOTIFICATION)[] = []) {
  return {
    getQueriesData: vi
      .fn()
      .mockReturnValue([
        [["mobile", "notifications-infinite"], { pages: [{ notifications: cachedNotifications }] }],
      ]),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  };
}

describe("NotificationDetailScreen", () => {
  beforeEach(() => {
    useLocalSearchParams.mockReset();
    routerBack.mockReset();
    useQuery.mockReset();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    pushToast.mockReset();
    getNotifications.mockReset();
    markNotificationRead.mockReset();
    bulkUpdateNotifications.mockReset();
    isNotificationActionSupportedOnMobile.mockReset();
    openNotificationAction.mockReset();

    useAccessToken.mockReturnValue("token-123");
    markNotificationRead.mockResolvedValue(undefined);
    bulkUpdateNotifications.mockResolvedValue(undefined);
    isNotificationActionSupportedOnMobile.mockReturnValue(true);
    useQuery.mockReturnValue({ data: null, isLoading: false });
  });

  it("shows an alert-not-found banner when the id param is missing", () => {
    useLocalSearchParams.mockReturnValue({ id: undefined });
    useQueryClient.mockReturnValue(mockQueryClient());

    render(<NotificationDetailScreen />);

    expect(screen.getByText("Alert not found")).toBeInTheDocument();
  });

  it("says the fetch failed rather than declaring the alert gone", () => {
    // "That alert is no longer accessible" is a definitive answer, and a
    // transient 500 does not earn one. It also offered no way to try again.
    const refetch = vi.fn();
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient());
    useQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("boom"),
      refetch,
    });

    render(<NotificationDetailScreen />);

    expect(screen.queryByText("Alert not available")).not.toBeInTheDocument();
    expect(screen.getByText("Could not load this alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when the notification isn't cached or fetched", () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient());
    useQuery.mockReturnValue({ data: null, isLoading: false });

    render(<NotificationDetailScreen />);

    expect(screen.getByText("Alert not available")).toBeInTheDocument();
  });

  it("renders a cached notification and auto-marks it read once", async () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient([SAMPLE_NOTIFICATION]));

    render(<NotificationDetailScreen />);

    expect(screen.getByText("Pickup available")).toBeInTheDocument();
    expect(screen.getByText("A shift is waiting for response.")).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith("token-123", NOTIFICATION_ID);
    });
  });

  it("does not mark an already-read notification as read again", async () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(
      mockQueryClient([{ ...SAMPLE_NOTIFICATION, readAt: "2026-04-24T13:00:00.000Z" }]),
    );

    render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText("Pickup available")).toBeInTheDocument();
    });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("shows the action button and opens it when the action is mobile-supported", () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient([SAMPLE_NOTIFICATION]));
    isNotificationActionSupportedOnMobile.mockReturnValue(true);

    render(<NotificationDetailScreen />);

    fireEvent.click(screen.getByText("Review request"));

    expect(openNotificationAction).toHaveBeenCalledWith("/requests?id=req-1");
  });

  it("shows a web-only hint instead of a button when the action isn't mobile-supported", () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient([SAMPLE_NOTIFICATION]));
    isNotificationActionSupportedOnMobile.mockReturnValue(false);

    render(<NotificationDetailScreen />);

    expect(
      screen.getByText(
        "This action isn't available in the mobile app. Sign in on the web to complete it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Review request")).not.toBeInTheDocument();
  });

  it("archives the notification and navigates back", async () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    const queryClient = mockQueryClient([SAMPLE_NOTIFICATION]);
    useQueryClient.mockReturnValue(queryClient);

    render(<NotificationDetailScreen />);

    fireEvent.click(screen.getByLabelText("Archive"));

    await waitFor(() => {
      expect(bulkUpdateNotifications).toHaveBeenCalledWith("token-123", {
        ids: [NOTIFICATION_ID],
        action: "archive",
      });
    });
    await waitFor(() => {
      expect(routerBack).toHaveBeenCalled();
    });
  });

  it("marks the notification unread without navigating away", async () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    const queryClient = mockQueryClient([
      { ...SAMPLE_NOTIFICATION, readAt: "2026-04-24T13:00:00.000Z" },
    ]);
    useQueryClient.mockReturnValue(queryClient);

    render(<NotificationDetailScreen />);

    fireEvent.click(screen.getByLabelText("Mark unread"));

    await waitFor(() => {
      expect(bulkUpdateNotifications).toHaveBeenCalledWith("token-123", {
        ids: [NOTIFICATION_ID],
        action: "unread",
      });
    });
    expect(routerBack).not.toHaveBeenCalled();
  });
});
