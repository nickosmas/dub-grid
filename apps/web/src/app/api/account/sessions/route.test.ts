import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSensitiveActionAuth = vi.fn();
const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const fetchUserSessionOverviewForUser = vi.fn();
const revokeUserSessionForUser = vi.fn();
const dispatchNotificationEvent = vi.fn();
const sessionRowSnapshot = vi.fn();
const writeSecurityAuditEvent = vi.fn();

vi.mock("@/lib/auth/security-audit", () => ({
  writeSecurityAuditEvent: (...args: unknown[]) => writeSecurityAuditEvent(...args),
}));

vi.mock("@/lib/api-auth", () => ({
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: () => validateCsrfOrigin(),
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
    validateCsrfOrigin.mockReturnValue(null);
    requireSensitiveActionAuth.mockResolvedValue({
      user: { id: "user-id" },
      claims: { org_id: "caller-org" },
    });
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "user-id" },
      claims: { session_id: "current-session-id" },
    });
    fetchUserSessionOverviewForUser.mockResolvedValue({ active: [], stale: [] });
    revokeUserSessionForUser.mockResolvedValue(true);
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
    expect(requireSensitiveActionAuth).toHaveBeenCalledOnce();
    expect(writeSecurityAuditEvent).toHaveBeenCalledWith({
      event: "security.auth.session",
      outcome: "succeeded",
      reason: "session_revoked",
      actorId: "user-id",
      // The caller's organization, as mobile and the bulk sign-out record it.
      orgId: "caller-org",
      metadata: { surface: "web", scope: "device" },
    });
  });

  it("records no revoke when the hash matched no session", async () => {
    revokeUserSessionForUser.mockResolvedValueOnce(false);

    const response = await DELETE(
      new NextRequest("http://localhost/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "unknown" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it.each(["password", "totp"])(
    "requires fresh %s proof before reading or revoking a session",
    async (method) => {
      const body = {
        code: "STEP_UP_REQUIRED",
        method,
        error: "Confirm your identity, then try again.",
      };
      requireSensitiveActionAuth.mockResolvedValueOnce({
        response: NextResponse.json(body, { status: 403 }),
      });
      const response = await DELETE(
        new NextRequest("http://localhost/api/account/sessions", {
          method: "DELETE",
          body: JSON.stringify({ refreshTokenHash: "hash" }),
        }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual(body);
      expect(sessionRowSnapshot).not.toHaveBeenCalled();
      expect(revokeUserSessionForUser).not.toHaveBeenCalled();
      expect(dispatchNotificationEvent).not.toHaveBeenCalled();
    },
  );

  it("keeps CSRF protection ahead of the assurance lookup", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await DELETE(
      new NextRequest("http://localhost/api/account/sessions", { method: "DELETE" }),
    );
    expect(response.status).toBe(403);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
    expect(revokeUserSessionForUser).not.toHaveBeenCalled();
  });

  it("does not require step-up to list devices", async () => {
    await GET(new NextRequest("http://localhost/api/account/sessions"));
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
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
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });
});
