import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GridmasterPersonRecord } from "@/features/gridmaster/person-record";
import { fetchGridmasterPersonNotifications } from "@/features/gridmaster/client";
import { PersonNotificationsCard } from "./PersonNotificationsCard";

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterPersonNotifications: vi.fn(),
}));

const record = {
  account: { userId: "user-1", email: "ada@example.com" },
  organizations: [{ org: { id: "org-1", name: "Calm Haven", slug: "calmhaven" } }],
} as unknown as GridmasterPersonRecord;

function renderCard(person: GridmasterPersonRecord = record) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PersonNotificationsCard record={person} />
    </QueryClientProvider>,
  );
}

describe("PersonNotificationsCard", () => {
  beforeEach(() => {
    vi.mocked(fetchGridmasterPersonNotifications).mockReset();
  });

  it("shows the stored preferences and each notification's state", async () => {
    vi.mocked(fetchGridmasterPersonNotifications).mockResolvedValue({
      notifications: {
        preferences: { shift_requests: { push: false, email: true }, weeklyDigest: true },
        notifications: [
          {
            id: "n-1",
            orgId: "org-1",
            type: "shift_request_approved",
            channel: "in_app",
            category: "requests",
            priority: "high",
            title: "Swap approved",
            message: "Your swap was approved.",
            metadata: null,
            readAt: "2026-09-26T11:00:00.000Z",
            archivedAt: null,
            createdAt: "2026-09-26T10:00:00.000Z",
          },
          {
            id: "n-2",
            orgId: null,
            type: "security_new_sign_in",
            channel: null,
            category: null,
            priority: null,
            title: "",
            message: "",
            metadata: null,
            readAt: null,
            archivedAt: null,
            createdAt: "2026-09-25T10:00:00.000Z",
          },
        ],
      },
    });
    renderCard();

    expect(await screen.findByText("Shift requests")).toBeInTheDocument();
    expect(screen.getByText("Push off, email on")).toBeInTheDocument();
    expect(screen.getByText("Weekly digest")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();

    expect(screen.getByText("Swap approved")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(
      screen.getByText(/Calm Haven, Shift request approved, high priority/),
    ).toBeInTheDocument();
    // A notification with no title reads by its type, and unread is marked.
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(screen.getAllByText(/Security new sign in/).length).toBeGreaterThan(0);
  });

  it("says when preferences were never changed and the inbox is empty", async () => {
    vi.mocked(fetchGridmasterPersonNotifications).mockResolvedValue({
      notifications: { preferences: null, notifications: [] },
    });
    renderCard();

    expect(await screen.findByText("Never changed. They get the defaults.")).toBeInTheDocument();
    expect(screen.getByText("No notifications.")).toBeInTheDocument();
  });

  it("renders nothing and fetches nothing without an account", () => {
    const { container } = renderCard({ ...record, account: null });
    expect(container).toBeEmptyDOMElement();
    expect(fetchGridmasterPersonNotifications).not.toHaveBeenCalled();
  });
});
