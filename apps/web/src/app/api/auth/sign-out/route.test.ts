import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const extractBearerToken = vi.fn();
const verifyAccessToken = vi.fn();
const revokeAllUserSessions = vi.fn();
const revokeSession = vi.fn();
const getSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const providerSignOut = vi.fn();
const createTokenScopedClient = vi.fn();
const revokeOtherUserSessions = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (request: NextRequest) => validateCsrfOrigin(request),
}));
vi.mock("@/lib/auth/verify-token", () => ({
  extractBearerToken: (request: NextRequest) => extractBearerToken(request),
  verifyAccessToken: (token: string) => verifyAccessToken(token),
}));
vi.mock("@/lib/auth/revocation", () => ({
  revokeAllUserSessions: (userId: string) => revokeAllUserSessions(userId),
  revokeSession: (sessionId: string) => revokeSession(sessionId),
  revokeOtherUserSessions: (...args: unknown[]) => revokeOtherUserSessions(...args),
}));
vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({ auth: { getSession } }),
  requireSensitiveActionAuth: (...args: unknown[]) => requireSensitiveActionAuth(...args),
  createTokenScopedClient: (...args: unknown[]) => createTokenScopedClient(...args),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

function makeRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/auth/sign-out", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/auth/sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    extractBearerToken.mockReturnValue("access-token");
    verifyAccessToken.mockResolvedValue({ userId: "user-1", sessionId: "session-1" });
    revokeSession.mockResolvedValue(undefined);
    revokeAllUserSessions.mockResolvedValue(undefined);
    revokeOtherUserSessions.mockResolvedValue(undefined);
    requireSensitiveActionAuth.mockResolvedValue({
      user: { id: "user-1" },
      sessionId: "fresh-session",
      session: { access_token: "fresh-token" },
    });
    providerSignOut.mockResolvedValue({ error: null });
    createTokenScopedClient.mockReturnValue({ auth: { admin: { signOut: providerSignOut } } });
  });

  it("rejects a CSRF failure before attempting revocation", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(makeRequest({ scope: "global" }));

    expect(response.status).toBe(403);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });

  it("revokes only the caller's current session by default", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(revokeSession).toHaveBeenCalledWith("session-1");
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });

  it("revokes every user session only for an explicit global sign-out", async () => {
    const response = await POST(makeRequest({ scope: "global" }));

    expect(response.status).toBe(200);
    expect(revokeAllUserSessions).toHaveBeenCalledWith("user-1");
    expect(revokeSession).not.toHaveBeenCalled();
    expect(createTokenScopedClient).toHaveBeenCalledWith("fresh-token");
    expect(providerSignOut).toHaveBeenCalledWith("fresh-token", "global");
  });

  it("never escalates local sign-out to all devices when the token lacks a session id", async () => {
    verifyAccessToken.mockResolvedValueOnce({ userId: "user-1", sessionId: null });

    await POST(makeRequest());

    expect(revokeAllUserSessions).not.toHaveBeenCalled();
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("signs out peers while preserving the exact session that supplied fresh proof", async () => {
    const response = await POST(makeRequest({ scope: "others" }));
    expect(response.status).toBe(200);
    expect(providerSignOut).toHaveBeenCalledWith("fresh-token", "others");
    expect(revokeOtherUserSessions).toHaveBeenCalledWith("user-1", "fresh-session");
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it.each(["others", "global"])("requires fresh proof before any %s mutation", async (scope) => {
    const denial = { code: "STEP_UP_REQUIRED", method: "totp" };
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json(denial, { status: 403 }),
    });
    const response = await POST(makeRequest({ scope }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(denial);
    expect(providerSignOut).not.toHaveBeenCalled();
    expect(revokeOtherUserSessions).not.toHaveBeenCalled();
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("rejects bulk requests without a signed session id", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({ user: { id: "user-1" }, sessionId: null });
    const response = await POST(makeRequest({ scope: "global" }));
    expect(response.status).toBe(401);
    expect(providerSignOut).not.toHaveBeenCalled();
  });

  it("reports provider failure without changing app revocation state", async () => {
    providerSignOut.mockResolvedValueOnce({ error: new Error("private provider details") });
    const response = await POST(makeRequest({ scope: "global" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider details");
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it("reports a partial persistence failure without replaying the mutation", async () => {
    revokeOtherUserSessions.mockRejectedValueOnce(new Error("database details"));
    const response = await POST(makeRequest({ scope: "others" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("database details");
    expect(providerSignOut).toHaveBeenCalledOnce();
  });

  it("finishes cleanly when the browser no longer has a token", async () => {
    extractBearerToken.mockReturnValueOnce(null);
    getSession.mockResolvedValueOnce({ data: { session: null } });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
