import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const permissions = { isGridmaster: false, isSuperAdmin: false };
vi.mock("@/hooks", () => ({
  usePermissions: () => permissions,
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

function alert(
  id: string,
  title: string,
  readAt: string | null = null,
  overrides: Partial<Notification> = {},
): Notification {
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
    ...overrides,
  };
}

const ON_PAGE = alert("on-page", "Schedule updated for week 38");
const ARCHIVED = alert("archived-one", "An older alert you archived", "2026-09-01T00:00:00.000Z");

async function renderInbox(props: {
  openNotificationId?: string | null;
  onOpenHandled?: () => void;
  navigate?: (href: string) => void;
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
    permissions.isGridmaster = false;
    fetchNotificationFacets.mockResolvedValue(EMPTY_FACETS);
    searchNotifications.mockResolvedValue({
      notifications: [ON_PAGE],
      nextCursor: null,
      facets: EMPTY_FACETS,
    });
    markNotificationsRead.mockResolvedValue(undefined);
  });

  it("goes to the alert's subject from the loaded page, marks it read, and reports back", async () => {
    const onOpenHandled = vi.fn();
    const navigate = vi.fn();
    await renderInbox({ openNotificationId: "on-page", onOpenHandled, navigate });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/schedule"));
    expect(markNotificationsRead).toHaveBeenCalledWith(["on-page"]);
    expect(fetchNotificationById).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(1));
  });

  it("looks the alert up by id when the loaded page does not hold it", async () => {
    fetchNotificationById.mockResolvedValue(ARCHIVED);
    const onOpenHandled = vi.fn();
    const navigate = vi.fn();
    await renderInbox({ openNotificationId: "archived-one", onOpenHandled, navigate });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/schedule"));
    expect(fetchNotificationById).toHaveBeenCalledWith("archived-one");
    expect(markNotificationsRead).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(1));
  });

  it("reports a missing alert and still hands the param back", async () => {
    fetchNotificationById.mockResolvedValue(null);
    const onOpenHandled = vi.fn();
    const navigate = vi.fn();
    await renderInbox({ openNotificationId: "gone", onOpenHandled, navigate });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("That alert is no longer available"),
    );
    expect(navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(1));
  });

  it("opens the same alert again after the param was cleared", async () => {
    const onOpenHandled = vi.fn();
    const navigate = vi.fn();
    const { rerender } = await renderInbox({
      openNotificationId: "on-page",
      onOpenHandled,
      navigate,
    });
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(1));

    rerender({ openNotificationId: null, onOpenHandled, navigate });
    rerender({ openNotificationId: "on-page", onOpenHandled, navigate });
    await waitFor(() => expect(onOpenHandled).toHaveBeenCalledTimes(2));
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});

describe("InboxView rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.isGridmaster = false;
    fetchNotificationFacets.mockResolvedValue(EMPTY_FACETS);
    markNotificationsRead.mockResolvedValue(undefined);
  });

  it("goes to the subject and marks read when an organization user clicks a row", async () => {
    searchNotifications.mockResolvedValue({
      notifications: [
        alert("req", "New swap request", null, {
          type: "shift_request_new",
          metadata: { tab: "approval", requestId: "r-1" },
        }),
      ],
      nextCursor: null,
      facets: EMPTY_FACETS,
    });
    const navigate = vi.fn();
    await renderInbox({ navigate });
    const row = await screen.findByRole("button", { name: /^New swap request/ });
    expect(row.getAttribute("aria-label")).toMatch(/Open requests$/);
    fireEvent.click(row);

    expect(navigate).toHaveBeenCalledWith("/schedule?requests=approval");
    await waitFor(() => expect(markNotificationsRead).toHaveBeenCalledWith(["req"]));
    expect(screen.queryByRole("link", { name: "Review request" })).toBeNull();
  });

  it("shows an organization user's note inline and never the platform keys", async () => {
    searchNotifications.mockResolvedValue({
      notifications: [
        alert("pc", "Phone number request", null, {
          type: "system",
          metadata: {
            requestedBy: "Jordan Reyes",
            note: "New number from today",
            actionUrl: "/people?section=requests",
            actionLabel: "Review request",
          },
        }),
      ],
      nextCursor: null,
      facets: EMPTY_FACETS,
    });
    await renderInbox({ navigate: vi.fn() });
    await screen.findByRole("button", { name: /^Phone number request/ });
    expect(screen.getByText("New number from today")).toBeTruthy();
    expect(screen.queryByText("Jordan Reyes")).toBeNull();
    expect(screen.queryByText(/Details/)).toBeNull();
  });

  it("unfolds a platform row's details in place for a gridmaster", async () => {
    permissions.isGridmaster = true;
    searchNotifications.mockResolvedValue({
      notifications: [
        alert("org", "Subscription canceled", null, {
          type: "org_subscription_canceled",
          category: "platform",
          metadata: {
            orgId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
            orgName: "Calm Haven",
            slug: "calmhaven",
          },
        }),
      ],
      nextCursor: null,
      facets: EMPTY_FACETS,
    });
    const navigate = vi.fn();
    await renderInbox({ navigate });
    const row = await screen.findByRole("button", { name: /^Subscription canceled/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Calm Haven")).toBeNull();
    fireEvent.click(row);

    expect(navigate).not.toHaveBeenCalled();
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Calm Haven")).toBeTruthy();
    expect(screen.getByText("calmhaven")).toBeTruthy();
    expect(screen.queryByText(/3f2504e0/)).toBeNull();
    await waitFor(() => expect(markNotificationsRead).toHaveBeenCalledWith(["org"]));
  });
});
