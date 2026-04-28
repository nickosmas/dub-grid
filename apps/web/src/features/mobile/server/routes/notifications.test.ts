import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobileNotifications = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchMobileNotifications,
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
          title: "Schedule published",
          message: "The new week is ready.",
          metadata: {},
          readAt: null,
          createdAt: "2026-04-16T10:00:00.000Z",
        },
      ],
    });

    const { GET } = await import("./notifications");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/notifications?limit=20&offset=0",
      ),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileNotifications).toHaveBeenCalledWith({}, {
      limit: 20,
      offset: 0,
    });
    expect(payload.unreadCount).toBe(3);
    expect(payload.notifications).toHaveLength(1);
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
