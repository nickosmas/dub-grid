import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useLocalSearchParams = vi.fn();
const routerBack = vi.fn();
const routerReplace = vi.fn();
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
  router: { back: routerBack, replace: routerReplace },
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
  WEB_ONLY_ALERT_MESSAGE: "Open this on the web to see more.",
  isNotificationActionSupportedOnMobile: (...args: unknown[]) =>
    isNotificationActionSupportedOnMobile(...args),
  resolveNativeRoute: (href: string) =>
    isNotificationActionSupportedOnMobile(href) ? { pathname: "/(tabs)/requests" } : null,
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
  metadata: { actionUrl: "/requests?id=req-1", actionLabel: "Review request" } as Record<
    string,
    unknown
  >,
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
    routerReplace.mockReset();
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
    useLocalSearchParams.mockReturnValue({});
    useQueryClient.mockReturnValue(mockQueryClient());

    render(<NotificationDetailScreen />);

    expect(screen.getByText("Alert not available")).toBeTruthy();
    expect(openNotificationAction).not.toHaveBeenCalled();
  });

  it("says the fetch failed rather than declaring the alert gone", () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient());
    useQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("Network request failed"),
      refetch: vi.fn(),
    });

    render(<NotificationDetailScreen />);

    expect(screen.getByText("Could not load this alert")).toBeTruthy();
    expect(screen.queryByText("Alert not available")).toBeNull();
    expect(openNotificationAction).not.toHaveBeenCalled();
  });

  it("shows an empty state when the notification isn't cached or fetched", () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient());

    render(<NotificationDetailScreen />);

    expect(screen.getByText("Alert not available")).toBeTruthy();
  });

  it("forwards a cached alert to its subject and marks it read once", async () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient([SAMPLE_NOTIFICATION]));
    markNotificationRead.mockResolvedValue({ success: true, unreadCount: 0 });

    const { rerender } = render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith("token-123", NOTIFICATION_ID);
    });
    expect(openNotificationAction).toHaveBeenCalledWith("/requests?id=req-1", "replace");
    expect(screen.queryByText("Pickup available")).toBeNull();

    rerender(<NotificationDetailScreen />);
    expect(markNotificationRead).toHaveBeenCalledTimes(1);
    expect(openNotificationAction).toHaveBeenCalledTimes(1);
  });

  it("forwards a fetched alert without marking a read one read again", async () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    useQueryClient.mockReturnValue(mockQueryClient());
    // The same mocked useQuery serves the bootstrap; only the detail key gets the alert.
    useQuery.mockImplementation((options: { queryKey?: unknown[] }) =>
      JSON.stringify(options.queryKey ?? []).includes("notification-detail")
        ? { data: { ...SAMPLE_NOTIFICATION, readAt: "2026-04-24T13:00:00.000Z" }, isLoading: false }
        : { data: undefined, isLoading: false },
    );

    render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(openNotificationAction).toHaveBeenCalledWith("/requests?id=req-1", "replace");
    });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("falls back to the inbox with a hint when the subject is web-only", async () => {
    useLocalSearchParams.mockReturnValue({ id: NOTIFICATION_ID });
    isNotificationActionSupportedOnMobile.mockReturnValue(false);
    useQueryClient.mockReturnValue(
      mockQueryClient([
        {
          ...SAMPLE_NOTIFICATION,
          type: "billing_payment_failed",
          metadata: {} as Record<string, unknown>,
          readAt: "2026-04-24T13:00:00.000Z",
        },
      ]),
    );

    render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith("/alerts");
    });
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Open this on the web to see more." }),
    );
    expect(openNotificationAction).not.toHaveBeenCalled();
  });
});
