import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const extractBearerToken = vi.fn();
const verifyAccessToken = vi.fn();
const revokeAllUserSessions = vi.fn();
const revokeSession = vi.fn();
const getSession = vi.fn();

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
}));
vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({ auth: { getSession } }),
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
  });

  it("rejects a CSRF failure before attempting revocation", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(makeRequest({ scope: "global" }));

    expect(response.status).toBe(403);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it("revokes only the caller's current session by default", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(revokeSession).toHaveBeenCalledWith("session-1");
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it("revokes every user session only for an explicit global sign-out", async () => {
    const response = await POST(makeRequest({ scope: "global" }));

    expect(response.status).toBe(200);
    expect(revokeAllUserSessions).toHaveBeenCalledWith("user-1");
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("uses the user-wide watermark when a verified token lacks a session id", async () => {
    verifyAccessToken.mockResolvedValueOnce({ userId: "user-1", sessionId: null });

    await POST(makeRequest());

    expect(revokeAllUserSessions).toHaveBeenCalledWith("user-1");
    expect(revokeSession).not.toHaveBeenCalled();
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
