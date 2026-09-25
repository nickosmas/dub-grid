import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileSensitiveActionAuth = vi.fn();
const verifyAccessToken = vi.fn();
const isSessionRevoked = vi.fn();
const getUser = vi.fn();
const providerSignOut = vi.fn();
const revokeSession = vi.fn();
const revokeAllUserSessions = vi.fn();
const revokeOtherUserSessions = vi.fn();

vi.mock("../auth", () => ({
  requireMobileSensitiveActionAuth: (req: NextRequest) => requireMobileSensitiveActionAuth(req),
}));
vi.mock("@/lib/auth/verify-token", () => ({
  verifyAccessToken: (token: string) => verifyAccessToken(token),
}));
vi.mock("@/lib/auth/revocation", () => ({
  isSessionRevoked: (token: unknown) => isSessionRevoked(token),
  revokeSession: (id: string) => revokeSession(id),
  revokeAllUserSessions: (id: string) => revokeAllUserSessions(id),
  revokeOtherUserSessions: (...args: unknown[]) => revokeOtherUserSessions(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/api-auth", () => ({
  createTokenScopedClient: () => ({ auth: { admin: { signOut: providerSignOut } } }),
}));
vi.mock("@/lib/auth/security-audit", () => ({ writeSecurityAuditEvent: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { POST } from "./auth-sign-out";

function request(body?: unknown, token: string | null = "mobile-token") {
  return new NextRequest("http://localhost/api/mobile/v1/auth/sign-out", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const now = () => Math.floor(Date.now() / 1000);

describe("POST mobile sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessToken.mockResolvedValue({
      userId: "user-1",
      sessionId: "session-1",
      issuedAtMs: Date.now(),
      claims: { amr: [{ method: "otp", timestamp: now() }] },
    });
    isSessionRevoked.mockResolvedValue(false);
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    providerSignOut.mockResolvedValue({ error: null });
    requireMobileSensitiveActionAuth.mockResolvedValue({
      accessToken: "assured-token",
      user: { id: "user-1" },
      claims: { session_id: "session-1" },
      currentOrg: { id: "org-1" },
    });
  });

  it("writes this device's revocation marker on a local sign-out", async () => {
    const response = await POST(request({ scope: "local" }));

    expect(response.status).toBe(200);
    expect(verifyAccessToken).toHaveBeenCalledWith("mobile-token");
    expect(revokeSession).toHaveBeenCalledWith("session-1");
    expect(requireMobileSensitiveActionAuth).not.toHaveBeenCalled();
  });

  it("still succeeds locally when the token is already gone", async () => {
    verifyAccessToken.mockResolvedValueOnce(null);

    const response = await POST(request({ scope: "local" }));

    expect(response.status).toBe(200);
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("revokes other devices in the app only after sensitive-action assurance", async () => {
    const response = await POST(request({ scope: "others" }));

    expect(response.status).toBe(200);
    expect(providerSignOut).toHaveBeenCalledWith("assured-token", "others");
    expect(revokeOtherUserSessions).toHaveBeenCalledWith("user-1", "session-1");
  });

  it("forwards a step-up challenge for a bulk sign-out without revoking anything", async () => {
    requireMobileSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED", method: "totp" }, { status: 403 }),
    });

    const response = await POST(request({ scope: "global" }));

    expect(response.status).toBe(403);
    expect(providerSignOut).not.toHaveBeenCalled();
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it("does not let a password-recovery reason skip assurance for other devices", async () => {
    await POST(request({ scope: "others", reason: "password_recovery" }));

    expect(requireMobileSensitiveActionAuth).toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("completes a password recovery on fresh OTP proof alone", async () => {
    const response = await POST(request({ scope: "global", reason: "password_recovery" }));

    expect(response.status).toBe(200);
    expect(requireMobileSensitiveActionAuth).not.toHaveBeenCalled();
    expect(providerSignOut).toHaveBeenCalledWith("mobile-token", "global");
    expect(revokeAllUserSessions).toHaveBeenCalledWith("user-1");
  });

  it("refuses a recovery completion whose OTP proof is stale", async () => {
    verifyAccessToken.mockResolvedValueOnce({
      userId: "user-1",
      sessionId: "session-1",
      issuedAtMs: Date.now(),
      claims: { amr: [{ method: "password", timestamp: now() }] },
    });

    const response = await POST(request({ scope: "global", reason: "password_recovery" }));

    expect(response.status).toBe(403);
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it("refuses a revoked recovery session", async () => {
    isSessionRevoked.mockResolvedValueOnce(true);

    const response = await POST(request({ scope: "global", reason: "password_recovery" }));

    expect(response.status).toBe(401);
    expect(providerSignOut).not.toHaveBeenCalled();
  });

  it("reports a partial failure rather than claiming the devices signed out", async () => {
    revokeAllUserSessions.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST(request({ scope: "global" }));

    expect(response.status).toBe(503);
  });
});
