import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();

vi.mock("@/features/mobile/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/mobile/server")>(
    "@/features/mobile/server",
  );

  return {
    ...actual,
    requireMobileAuth,
  };
});

describe("mobile notification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns auth failures unchanged", async () => {
    requireMobileAuth.mockResolvedValue({
      response: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    });

    const { PATCH } = await import("./notification-actions");
    const response = await PATCH({} as never, {
      params: Promise.resolve({
        id: "00000000-0000-4000-8000-000000000001",
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid session" });
  });

  it("marks a single notification read and returns the unread count", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "mark_notification_read") {
        return { data: null, error: null };
      }

      if (fn === "get_unread_notification_count") {
        return { data: 2, error: null };
      }

      throw new Error(`Unexpected rpc ${fn}`);
    });
    requireMobileAuth.mockResolvedValue({
      userClient: {
        rpc,
      },
    });

    const { PATCH } = await import("./notification-actions");
    const response = await PATCH({} as never, {
      params: Promise.resolve({
        id: "00000000-0000-4000-8000-000000000001",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      unreadCount: 2,
    });
  });

  it("marks all notifications read", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "mark_all_notifications_read") {
        return { data: null, error: null };
      }

      if (fn === "get_unread_notification_count") {
        return { data: 0, error: null };
      }

      throw new Error(`Unexpected rpc ${fn}`);
    });
    requireMobileAuth.mockResolvedValue({
      userClient: {
        rpc,
      },
    });

    const { POST } = await import("./notification-actions");
    const response = await POST({} as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      unreadCount: 0,
    });
  });

  it("returns a friendly error when unread-count refresh fails after marking read", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "mark_notification_read") {
        return { data: null, error: null };
      }

      if (fn === "get_unread_notification_count") {
        return {
          data: null,
          error: new Error("count unavailable"),
        };
      }

      throw new Error(`Unexpected rpc ${fn}`);
    });
    requireMobileAuth.mockResolvedValue({
      userClient: {
        rpc,
      },
    });

    const { PATCH } = await import("./notification-actions");
    const response = await PATCH({} as never, {
      params: Promise.resolve({
        id: "00000000-0000-4000-8000-000000000001",
      }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "We updated that notification, but we couldn't refresh your mobile alerts right now.",
    });
  });
});
