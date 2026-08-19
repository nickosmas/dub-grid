import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { queryKeys } from "@/lib/query-keys";

// Mock the realtime hook to a no-op so we can isolate the React Query cache
// subscription as the path under test. Without this the postgres_changes
// channel setup runs in jsdom and the test becomes flaky.
vi.mock("@/hooks/useNotificationsRealtime", () => ({
  useNotificationsRealtime: () => {},
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "a@b" },
    signOut: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/hooks", () => ({
  usePermissions: () => ({
    isGridmaster: false,
    isSuperAdmin: false,
  }),
}));

const fetchNotificationFacets = vi.fn();
const searchNotifications = vi.fn();
const markNotificationsRead = vi.fn();
const markNotificationsUnread = vi.fn();
const markAllNotificationsRead = vi.fn();
const archiveNotifications = vi.fn();
const unarchiveNotifications = vi.fn();

vi.mock("@/features/notifications/client", () => ({
  fetchNotificationFacets,
  searchNotifications,
  markNotificationsRead,
  markNotificationsUnread,
  markAllNotificationsRead,
  archiveNotifications,
  unarchiveNotifications,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const EMPTY_FACETS = {
  total: 0,
  totalUnread: 0,
  totalRead: 0,
  totalArchived: 0,
  byCategory: {},
  byPriority: {},
};

describe("AlertsInboxPage facets cache subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchNotificationFacets.mockResolvedValue(EMPTY_FACETS);
    searchNotifications.mockResolvedValue({
      notifications: [],
      nextCursor: null,
      facets: EMPTY_FACETS,
    });
  });

  it("refreshes facets when the bell invalidates the notifications React Query key", async () => {
    const { InboxView } = await import("@/app/alerts/AlertsInboxPage");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // The bell maintains cached unreadCount / recent queries under the
    // notifications/<userId> parent key. Seed one so invalidateQueries has
    // something to invalidate (otherwise it's a no-op and no cache event
    // fires — matching real production behavior, not a test artifact).
    queryClient.setQueryData(queryKeys.notifications.unreadCount("user-1", "org-1"), 0);

    render(
      <QueryClientProvider client={queryClient}>
        <InboxView />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(searchNotifications).toHaveBeenCalled();
    });
    fetchNotificationFacets.mockClear();

    // Simulate the bell's mark-read flow: invalidate the parent key.
    await queryClient.invalidateQueries({
      queryKey: queryKeys.notifications.all("user-1"),
      refetchType: "none",
    });

    // The inbox's cache subscription should refetch facets so the chip counts
    // update without waiting on the realtime postgres_changes round-trip.
    await waitFor(() => {
      expect(fetchNotificationFacets).toHaveBeenCalled();
    });
  });
});
