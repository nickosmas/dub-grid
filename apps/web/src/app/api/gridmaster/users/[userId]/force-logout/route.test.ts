import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const validateCsrfOrigin = vi.fn();
const requestRpc = vi.fn();
const serviceRpc = vi.fn();
const serviceFrom = vi.fn();
const auditInsert = vi.fn();
const profileSnapshot = vi.fn();
const dispatchNotificationEvent = vi.fn();
const revokeAllUserSessions = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({
    rpc: requestRpc,
  }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: serviceRpc,
    from: serviceFrom,
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

vi.mock("@/lib/auth/revocation", () => ({
  revokeAllUserSessions: (userId: string) => revokeAllUserSessions(userId),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new NextRequest(`http://localhost/api/gridmaster/users/${USER_ID}/force-logout`, {
    method: "POST",
  });
}

describe("POST /api/gridmaster/users/[userId]/force-logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    requireSensitiveActionAuth.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "fresh-token" },
      claims: { platform_role: "gridmaster" },
    });
    requestRpc.mockResolvedValue({ error: null });
    auditInsert.mockResolvedValue({ error: null });
    dispatchNotificationEvent.mockResolvedValue({ success: true });
    revokeAllUserSessions.mockResolvedValue(undefined);
    profileSnapshot.mockResolvedValue({
      data: { org_id: "target-org-id" },
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => profileSnapshot(),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects CSRF failures before gridmaster auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(403);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("returns STEP_UP_REQUIRED before resolving a target or revoking sessions", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json(
        { error: "Confirm your identity.", code: "STEP_UP_REQUIRED", method: "totp" },
        { status: 403 },
      ),
    });

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "STEP_UP_REQUIRED" });
    expect(requestRpc).not.toHaveBeenCalled();
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("rejects non-gridmaster sessions before parameter validation", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ userId: "not-a-uuid" }),
    });

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("validates the user id before mutating", async () => {
    const response = await POST(makeRequest(), {
      params: Promise.resolve({ userId: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("forces logout and writes a platform audit event", async () => {
    const response = await POST(makeRequest(), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(requestRpc).toHaveBeenCalledWith("force_logout_user", {
      p_target_user_id: USER_ID,
    });
    expect(revokeAllUserSessions).toHaveBeenCalledWith(USER_ID);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: null,
        actor_id: "gridmaster-user",
        actor_email: "gm@example.com",
        action: "user.force_logout",
        resource_type: "user",
        resource_id: USER_ID,
        details: expect.objectContaining({
          initiated_by: "gridmaster",
          targetUserId: USER_ID,
        }),
      }),
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledWith("gridmaster-user", {
      action: "security_session_revoked",
      orgId: "target-org-id",
      targetUserId: USER_ID,
      initiatedBy: "gridmaster",
      deviceLabel: null,
    });
  });
});
