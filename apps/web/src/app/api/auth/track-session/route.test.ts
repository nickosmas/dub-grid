import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const trackUserSessionForUser = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedSession: (req: NextRequest) =>
    requireAuthenticatedSession(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/features/account/server", () => ({
  trackUserSessionForUser: (input: unknown) => trackUserSessionForUser(input),
}));

import { POST } from "@/app/api/auth/track-session/route";

describe("POST /api/auth/track-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedSession.mockResolvedValue({
      session: {
        access_token: createJwt({
          session_id: "session-id-1",
          org_id: "org-id-1",
        }),
      },
      user: { id: "session-user" },
    });
    trackUserSessionForUser.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    const unauthenticated = NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    );
    requireAuthenticatedSession.mockResolvedValueOnce({
      response: unauthenticated,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        body: JSON.stringify({
          platform: "web",
          deviceLabel: "Chrome on macOS",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(trackUserSessionForUser).not.toHaveBeenCalled();
  });

  it("uses the authenticated user and JWT session id instead of caller-controlled identity", async () => {
    await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({
          userId: "forged-user",
          platform: "web",
          deviceLabel: "Chrome on macOS",
        }),
      }),
    );

    expect(trackUserSessionForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "session-user",
        orgId: "org-id-1",
        supabaseSessionId: "session-id-1",
        platform: "web",
        deviceLabel: "Chrome on macOS",
      }),
    );
  });

  it("returns the CSRF failure response before touching the database", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        body: JSON.stringify({
          platform: "web",
          deviceLabel: "Chrome on macOS",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(trackUserSessionForUser).not.toHaveBeenCalled();
  });
});

function createJwt(payload: Record<string, unknown>): string {
  return [
    encodeJwtSegment({ alg: "none", typ: "JWT" }),
    encodeJwtSegment(payload),
    "signature",
  ].join(".");
}

function encodeJwtSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value))
    .toString("base64url");
}
