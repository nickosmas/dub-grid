import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification } from "@/types";

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

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

const fetchNotificationFacets = vi.fn();
const searchNotifications = vi.fn();
const fetchNotificationById = vi.fn();
const markNotificationsRead = vi.fn();

vi.mock("@/features/notifications/client", () => ({
  fetchNotificationFacets: (...args: unknown[]) => fetchNotificationFacets(...args),
  searchNotifications: (...args: unknown[]) => searchNotifications(...args),
  fetchNotificationById: (...args: unknown[]) => fetchNotificationById(...args),
  markNotificationsRead: (...args: unknown[]) => markNotificationsRead(...args),
  markNotificationsUnread: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  archiveNotifications: vi.fn(),
  unarchiveNotifications: vi.fn(),
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

function alert(id: string, title: string, readAt: string | null = null): Notification {
  return {
    id,
    type: "schedule_published",
    channel: "in_app",
    category: "schedule",
    priority: "normal",
    title,
    message: `Message for ${title}`,
    metadata: {},
    readAt,
    archivedAt: null,
    createdAt: "2026-09-18T10:00:00.000Z",
  };
}

const ON_PAGE = alert("on-page", "Schedule updated for week 38");
const ARCHIVED = alert("archived-one", "An older alert you archived", "2026-09-01T00:00:00.000Z");

async function renderInbox(props: {
  openNotificationId?: string | null;
  onOpenHandled?: () => void;
}) {
  const { InboxView } = await import("@/app/(app)/alerts/AlertsInboxPage");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <InboxView {...props} />
    </QueryClientProvider>,
  );
  const rerender = (next: typeof props) =>
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <InboxView {...next} />
      </QueryClientProvider>,
    );
  await waitFor(() => expect(searchNotifications).toHaveBeenCalled());
  return { rerender };
}

describe("InboxView openNotificationId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchNotificationFacets.mockResolvedValue(EMPTY_FACETS);
    searchNotifications.mockResolvedValue({
      notifications: [ON_PAGE],
      nextCursor: null,
      facets: EMPTY_FACETS,
    });
    markNotificationsRead.mockResolvedValue(undefined);
  });

  it("opens an alert from the loaded page, marks it read, and reports back", async () => {
    const onOpenHandled = vi.fn();
    await renderInbox({ openNotificationId: "on-page", onOpenHandled });

    await waitFor(() => expect(screen.getByRole("dialog", { name: ON_PAGE.title })).toBeTruthy());
    expect(markNotificationsRead).toHaveBeenCalledWith(["on-page"]);
    expect(fetchNotificationById).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(1));
  });

  it("looks the alert up by id when the loaded page does not hold it", async () => {
    fetchNotificationById.mockResolvedValue(ARCHIVED);
    const onOpenHandled = vi.fn();
    await renderInbox({ openNotificationId: "archived-one", onOpenHandled });

    await waitFor(() => expect(screen.getByRole("dialog", { name: ARCHIVED.title })).toBeTruthy());
    expect(fetchNotificationById).toHaveBeenCalledWith("archived-one");
    expect(markNotificationsRead).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(1));
  });

  it("reports a missing alert and still hands the param back", async () => {
    fetchNotificationById.mockResolvedValue(null);
    const onOpenHandled = vi.fn();
    await renderInbox({ openNotificationId: "gone", onOpenHandled });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("That alert is no longer available"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(1));
  });

  it("opens the same alert again after the param was cleared", async () => {
    const onOpenHandled = vi.fn();
    const { rerender } = await renderInbox({ openNotificationId: "on-page", onOpenHandled });
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(1));

    rerender({ openNotificationId: null, onOpenHandled });
    rerender({ openNotificationId: "on-page", onOpenHandled });
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(2));
  });
});
