import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const trackUserSessionForUser = vi.fn();
const dispatchNotificationEvent = vi.fn();
const newDeviceLookup = vi.fn();
const lookupFilters: Array<[string, unknown]> = [];
const after = vi.fn((task: () => unknown) => void task());

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => after(task),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedSession: (req: NextRequest) => requireAuthenticatedSession(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/features/account/server", () => ({
  trackUserSessionForUser: (input: unknown) => trackUserSessionForUser(input),
}));

vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          lookupFilters.push([column, value]);
          return {
            eq: (column2: string, value2: unknown) => {
              lookupFilters.push([column2, value2]);
              return { limit: () => newDeviceLookup() };
            },
          };
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { POST } from "@/app/api/auth/track-session/route";

describe("POST /api/auth/track-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupFilters.length = 0;
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
    dispatchNotificationEvent.mockResolvedValue({ success: true });
    // Default: this session was already recorded, so it is not a new sign-in.
    newDeviceLookup.mockResolvedValue({ data: [{ id: "existing-session" }] });
  });

  it("rejects unauthenticated requests", async () => {
    const unauthenticated = NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
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

  it("alerts, after the response, on a sign-in session not seen before", async () => {
    newDeviceLookup.mockResolvedValueOnce({ data: [] });

    await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({
          platform: "web",
          deviceLabel: "Chrome on macOS",
        }),
      }),
    );

    expect(after).toHaveBeenCalledTimes(1);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith("session-user", {
      action: "security_new_device",
      orgId: "org-id-1",
      targetUserId: "session-user",
      supabaseSessionId: "session-id-1",
      platform: "web",
      deviceLabel: "Chrome on macOS",
      ipAddress: null,
    });
  });

  it("records browser metadata and hosting-provided location", async () => {
    await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "x-forwarded-for": "198.51.100.180",
          "x-vercel-ip-city": "Migori%20Town",
          "x-vercel-ip-country": "KE",
        },
        body: JSON.stringify({
          platform: "web",
          deviceLabel: "iPhone",
          browserName: "Safari",
          browserVersion: "18.6",
        }),
      }),
    );

    expect(trackUserSessionForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceLabel: "iPhone",
        browserName: "Safari",
        browserVersion: "18.6",
        ipAddress: "198.51.100.180",
        locationCity: "Migori Town",
        locationCountry: "Kenya",
      }),
    );
  });

  // Every Mac reports "Macintosh", so keying on the label hid a second Mac.
  it("recognises a sign-in by its session, not its device label", async () => {
    newDeviceLookup.mockResolvedValueOnce({ data: [] });

    await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({ platform: "web", deviceLabel: "Macintosh" }),
      }),
    );

    expect(lookupFilters).toEqual([
      ["user_id", "session-user"],
      ["supabase_session_id", "session-id-1"],
    ]);
  });

  it("stays quiet when the same session reports again", async () => {
    await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({
          platform: "web",
          deviceLabel: "Chrome on macOS",
        }),
      }),
    );

    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
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
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
