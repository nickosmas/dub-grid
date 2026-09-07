import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const fetchUserSessionOverviewForUser = vi.fn();
const revokeUserSessionForUser = vi.fn();
const dispatchNotificationEvent = vi.fn();
const sessionRowSnapshot = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: () => null,
}));

vi.mock("@/features/account/server", () => ({
  fetchUserSessionOverviewForUser: (userId: string, options: unknown) =>
    fetchUserSessionOverviewForUser(userId, options),
  revokeUserSessionForUser: (userId: string, refreshTokenHash: string) =>
    revokeUserSessionForUser(userId, refreshTokenHash),
}));

vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => sessionRowSnapshot(),
          }),
        }),
      }),
    }),
  }),
}));

import { DELETE, GET } from "./route";

describe("/api/account/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "user-id" },
    });
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "user-id" },
      claims: { session_id: "current-session-id" },
    });
    fetchUserSessionOverviewForUser.mockResolvedValue({ active: [], stale: [] });
    revokeUserSessionForUser.mockResolvedValue(undefined);
    dispatchNotificationEvent.mockResolvedValue({ success: true });
    sessionRowSnapshot.mockResolvedValue({
      data: { org_id: "org-1", device_label: "Chrome on macOS" },
    });
  });

  it("loads the active + stale session overview for the signed-in user", async () => {
    const response = await GET(new NextRequest("http://localhost/api/account/sessions"));

    expect(response.status).toBe(200);
    expect(fetchUserSessionOverviewForUser).toHaveBeenCalledWith("user-id", {
      currentSupabaseSessionId: "current-session-id",
    });
    await expect(response.json()).resolves.toEqual({ active: [], stale: [] });
  });

  it("rejects unauthenticated session reads", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/account/sessions"));

    expect(response.status).toBe(401);
    expect(fetchUserSessionOverviewForUser).not.toHaveBeenCalled();
  });

  it("revokes only sessions owned by the signed-in user", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "hash" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(revokeUserSessionForUser).toHaveBeenCalledWith("user-id", "hash");
  });

  it("dispatches security_session_revoked with the captured device label", async () => {
    await DELETE(
      new NextRequest("http://localhost/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "hash" }),
      }),
    );

    expect(dispatchNotificationEvent).toHaveBeenCalledWith("user-id", {
      action: "security_session_revoked",
      orgId: "org-1",
      targetUserId: "user-id",
      initiatedBy: "self",
      deviceLabel: "Chrome on macOS",
    });
  });

  it("skips dispatch when the session row is already gone", async () => {
    sessionRowSnapshot.mockResolvedValueOnce({ data: null });
    const response = await DELETE(
      new NextRequest("http://localhost/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "hash" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("returns a recoverable error when a session cannot be revoked", async () => {
    revokeUserSessionForUser.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await DELETE(
      new NextRequest("http://localhost/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "hash" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "We couldn't sign out that device. Try again.",
    });
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });
});
