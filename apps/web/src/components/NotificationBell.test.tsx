import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "./NotificationBell";
import type { Notification } from "@/types";

vi.mock("@/hooks/useNotificationsRealtime", () => ({ useNotificationsRealtime: () => {} }));
vi.mock("@/hooks/useAccountRealtimeInvalidation", () => ({
  useAccountRealtimeInvalidation: () => {},
}));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "a@b" }, signOut: vi.fn(), isLoading: false }),
}));
vi.mock("@/hooks", () => ({
  usePermissions: () => ({ orgId: "org-1", isGridmaster: false, isSuperAdmin: false }),
}));

const fetchNotifications = vi.fn();
const fetchUnreadNotificationCount = vi.fn();
const markAllNotificationsRead = vi.fn();
vi.mock("@/features/notifications/client", () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
  fetchUnreadNotificationCount: (...args: unknown[]) => fetchUnreadNotificationCount(...args),
  markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsRead(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const LONG_MESSAGE =
  "https://example.test/a-very-long-unbroken-token-" + "x".repeat(260) + " that must wrap";

const alerts: Notification[] = [
  {
    id: "n-unread",
    type: "shift_request_new",
    channel: "in_app",
    category: "shift_requests",
    priority: "normal",
    title: "New swap request",
    message: LONG_MESSAGE,
    metadata: {},
    readAt: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "n-read",
    type: "schedule_published",
    channel: "in_app",
    category: "schedule",
    priority: "normal",
    title: "Schedule updated",
    message: "A short one.",
    metadata: {},
    readAt: new Date().toISOString(),
    archivedAt: null,
    createdAt: new Date().toISOString(),
  },
];

function renderBell(props: { onOpenItem?: (id: string) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationBell {...props} />
    </QueryClientProvider>,
  );
}

async function openPopover() {
  fireEvent.click(screen.getByRole("button", { name: /^Alerts/ }));
  await waitFor(() => expect(screen.getByRole("region", { name: "Alerts" })).toBeTruthy());
  await waitFor(() => expect(screen.getByText("New swap request")).toBeTruthy());
}

describe("NotificationBell rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchUnreadNotificationCount.mockResolvedValue(1);
    fetchNotifications.mockResolvedValue(alerts);
  });

  it("links every row to the alerts page with the alert to open", async () => {
    renderBell();
    await openPopover();
    const unread = screen.getByRole("link", { name: /^New swap request/ });
    const read = screen.getByRole("link", { name: /^Schedule updated/ });
    expect(unread.getAttribute("href")).toBe("/alerts?open=n-unread");
    expect(read.getAttribute("href")).toBe("/alerts?open=n-read");
    expect(unread.getAttribute("aria-label")).toMatch(/\(unread\)$/);
    expect(read.getAttribute("aria-label")).not.toMatch(/unread/);
    expect(screen.queryByRole("button", { name: /^New swap request/ })).toBeNull();
  });

  it("closes the popover when a row is followed", async () => {
    renderBell();
    await openPopover();
    fireEvent.click(screen.getByRole("link", { name: /^Schedule updated/ }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Alerts" })).toBeNull());
  });

  it("hands the id to onOpenItem instead of linking when the portal provides it", async () => {
    const onOpenItem = vi.fn();
    renderBell({ onOpenItem });
    await openPopover();
    expect(screen.queryByRole("link", { name: /^New swap request/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^New swap request/ }));
    expect(onOpenItem).toHaveBeenCalledWith("n-unread");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Alerts" })).toBeNull());
  });

  it("lets row text wrap and break long tokens", async () => {
    renderBell();
    await openPopover();
    const message = screen.getByText(LONG_MESSAGE);
    const column = message.parentElement as HTMLElement;
    expect(column.style.whiteSpace).toBe("normal");
    expect(column.style.overflowWrap).toBe("anywhere");
    expect(column.style.minWidth).toBe("0");
  });
});
