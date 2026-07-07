import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobileNotifications = vi.fn();
const loggerWarn = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchMobileNotifications,
}));

vi.mock("@/lib/logger", () => ({
  default: { warn: loggerWarn },
}));

describe("mobile notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the auth failure response unchanged", async () => {
    requireMobileAuth.mockResolvedValue({
      response: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    });

    const { GET } = await import("./notifications");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/notifications"),
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid session" });
  });

  it("returns the notifications feed for the authenticated mobile user", async () => {
    requireMobileAuth.mockResolvedValue({
      userClient: {},
    });
    fetchMobileNotifications.mockResolvedValue({
      unreadCount: 3,
      notifications: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          type: "schedule_published",
          channel: "in_app",
          category: null,
          priority: "normal",
          title: "Schedule published",
          message: "The new week is ready.",
          metadata: {},
          readAt: null,
          archivedAt: null,
          createdAt: "2026-04-16T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });

    const { GET } = await import("./notifications");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/notifications?limit=20&category=schedule&read=unread",
      ),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileNotifications).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        limit: 20,
        category: "schedule",
        read: "unread",
        cursor: null,
      }),
    );
    expect(payload.unreadCount).toBe(3);
    expect(payload.notifications).toHaveLength(1);
    expect(payload.nextCursor).toBeNull();
  });

  it("forwards cursor pagination to the loader", async () => {
    requireMobileAuth.mockResolvedValue({
      userClient: {},
    });
    fetchMobileNotifications.mockResolvedValue({
      unreadCount: 0,
      notifications: [],
      nextCursor: null,
    });

    const { GET } = await import("./notifications");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/notifications" +
          "?cursorCreatedAt=2026-04-16T10:00:00.000Z" +
          "&cursorId=00000000-0000-0000-0000-000000000001" +
          "&archived=archived",
      ),
    } as never);

    expect(response.status).toBe(200);
    expect(fetchMobileNotifications).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        cursor: {
          createdAt: "2026-04-16T10:00:00.000Z",
          id: "00000000-0000-0000-0000-000000000001",
        },
        archived: "archived",
      }),
    );
  });

  it("drops notification rows with an unrecognized type instead of failing the whole request", async () => {
    requireMobileAuth.mockResolvedValue({
      userClient: {},
    });
    fetchMobileNotifications.mockResolvedValue({
      unreadCount: 1,
      notifications: [
        {
          id: "00000000-0000-0000-0000-000000000002",
          type: "schedule_published",
          channel: "in_app",
          category: null,
          priority: "normal",
          title: "Schedule published",
          message: "The new week is ready.",
          metadata: {},
          readAt: null,
          archivedAt: null,
          createdAt: "2026-04-16T10:00:00.000Z",
        },
        {
          id: "00000000-0000-0000-0000-000000000003",
          type: "some_future_notification_type",
          channel: "in_app",
          category: null,
          priority: "normal",
          title: "Not yet known to mobile",
          message: "This type isn't in the mobile schema yet.",
          metadata: {},
          readAt: null,
          archivedAt: null,
          createdAt: "2026-04-16T10:05:00.000Z",
        },
      ],
      nextCursor: null,
    });

    const { GET } = await import("./notifications");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/notifications"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.notifications).toHaveLength(1);
    expect(payload.notifications[0].id).toBe(
      "00000000-0000-0000-0000-000000000002",
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "00000000-0000-0000-0000-000000000003",
      }),
      "Dropping mobile notification with unrecognized schema",
    );
  });

  it("returns a client-friendly error when loading notifications fails", async () => {
    requireMobileAuth.mockResolvedValue({
      userClient: {},
    });
    fetchMobileNotifications.mockRejectedValue(new Error("rpc failure"));

    const { GET } = await import("./notifications");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/notifications"),
    } as never);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "We couldn't load your mobile notifications right now.",
    });
  });
});
