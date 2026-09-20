import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  usePermissions: () => ({ isGridmaster: false, isSuperAdmin: true }),
}));

const fetchNotificationFacets = vi.fn();
const searchNotifications = vi.fn();

vi.mock("@/features/notifications/client", () => ({
  fetchNotificationFacets: (...args: unknown[]) => fetchNotificationFacets(...args),
  searchNotifications: (...args: unknown[]) => searchNotifications(...args),
  fetchNotificationById: vi.fn(),
  markNotificationsRead: vi.fn(),
  markNotificationsUnread: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  archiveNotifications: vi.fn(),
  unarchiveNotifications: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const FACETS = {
  total: 12,
  totalUnread: 3,
  totalRead: 9,
  totalArchived: 4,
  byCategory: {},
  byPriority: {},
};

async function renderInbox() {
  const { InboxView } = await import("@/app/(app)/alerts/AlertsInboxPage");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <InboxView navigate={vi.fn()} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(searchNotifications).toHaveBeenCalled());
}

describe("InboxView toolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchNotificationFacets.mockResolvedValue(FACETS);
    searchNotifications.mockResolvedValue({ notifications: [], nextCursor: null, facets: FACETS });
  });

  it("holds every control in one toolbar and no sidebar", async () => {
    await renderInbox();
    const toolbar = screen.getByRole("toolbar", { name: "Alerts" });
    const t = within(toolbar);
    for (const name of ["Inbox", "Archived", "All", "Unread", "Read"]) {
      expect(t.getByRole("button", { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    expect(t.getByRole("textbox", { name: "Search alerts" })).toBeTruthy();
    expect(t.getByRole("button", { name: "Filter by category" })).toBeTruthy();
    expect(t.getByRole("button", { name: "Filter by priority" })).toBeTruthy();
    expect(t.getByRole("button", { name: /^Sort/ })).toBeTruthy();
    expect(t.getByLabelText(/Select/)).toBeTruthy();
    expect(t.getByRole("button", { name: "Mark all alerts as read" })).toBeTruthy();

    expect(screen.getAllByRole("toolbar")).toHaveLength(1);
    expect(document.querySelector("aside")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Alerts");
  });

  it("pressing Archived queries the archive and drops the read filter", async () => {
    await renderInbox();
    const toolbar = within(screen.getByRole("toolbar", { name: "Alerts" }));
    fireEvent.click(toolbar.getByRole("button", { name: /^Unread/ }));
    await waitFor(() =>
      expect(searchNotifications).toHaveBeenLastCalledWith(
        expect.objectContaining({ read: "unread", includeArchived: false }),
      ),
    );

    fireEvent.click(toolbar.getByRole("button", { name: /^Archived/ }));
    await waitFor(() =>
      expect(searchNotifications).toHaveBeenLastCalledWith(
        expect.objectContaining({ read: null, includeArchived: true }),
      ),
    );
    expect(toolbar.getByRole("button", { name: /^Archived/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("drops the read filter and Mark all read while showing the archive", async () => {
    await renderInbox();
    const toolbar = within(screen.getByRole("toolbar", { name: "Alerts" }));
    fireEvent.click(toolbar.getByRole("button", { name: /^Archived/ }));

    await waitFor(() =>
      expect(toolbar.queryByRole("button", { name: /^Unread/ })).not.toBeInTheDocument(),
    );
    expect(toolbar.queryByRole("button", { name: /^All/ })).not.toBeInTheDocument();
    expect(toolbar.queryByRole("button", { name: /^Read/ })).not.toBeInTheDocument();
    expect(
      toolbar.queryByRole("button", { name: "Mark all alerts as read" }),
    ).not.toBeInTheDocument();
    // Everything that still applies to archived alerts stays.
    expect(toolbar.getByRole("textbox", { name: "Search alerts" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Filter by category" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Filter by priority" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: /^Sort/ })).toBeTruthy();
    expect(toolbar.getByLabelText(/Select/)).toBeTruthy();

    fireEvent.click(toolbar.getByRole("button", { name: /^Inbox/ }));
    await waitFor(() =>
      expect(toolbar.getByRole("button", { name: /^Unread/ })).toBeInTheDocument(),
    );
    expect(toolbar.getByRole("button", { name: "Mark all alerts as read" })).toBeTruthy();
  });

  it("shows the archived and unread counts on their segments", async () => {
    await renderInbox();
    const toolbar = within(screen.getByRole("toolbar", { name: "Alerts" }));
    await waitFor(() =>
      expect(toolbar.getByRole("button", { name: /^Archived/ }).textContent).toContain("4"),
    );
    expect(toolbar.getByRole("button", { name: /^Unread/ }).textContent).toContain("3");
  });
});
