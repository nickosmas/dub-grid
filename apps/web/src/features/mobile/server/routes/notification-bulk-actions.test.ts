import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();

vi.mock("@/features/mobile/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/mobile/server")>(
    "@/features/mobile/server",
  );
  return { ...actual, requireMobileAuth };
});

describe("mobile notification bulk actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one RPC for the mutation and its resulting unread count", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { unreadCount: 3, updatedCount: 2 },
      error: null,
    });
    requireMobileAuth.mockResolvedValue({ userClient: { rpc } });

    const { POST } = await import("./notification-bulk-actions");
    const response = await POST(
      new NextRequest("http://localhost/api/mobile/v1/notifications/bulk", {
        method: "POST",
        body: JSON.stringify({
          action: "read",
          ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, unreadCount: 3, updatedCount: 2 });
    expect(rpc).toHaveBeenCalledWith("mutate_notifications_with_unread_count", {
      p_action: "read",
      p_notification_ids: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
    });
  });
});
