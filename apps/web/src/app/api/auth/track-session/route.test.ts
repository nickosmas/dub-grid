import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const trackUserSessionForUser = vi.fn();
const dispatchNotificationEvent = vi.fn();
const claimNewSignIn = vi.fn();
const rememberSignInDevice = vi.fn();
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

vi.mock("@/features/account/server/security-alerts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/account/server/security-alerts")>()),
  claimNewSignIn: (...args: unknown[]) => claimNewSignIn(...args),
}));

vi.mock("@/features/account/server/known-devices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/account/server/known-devices")>()),
  rememberSignInDevice: (...args: unknown[]) => rememberSignInDevice(...args),
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
    // Default: this session was already reported, so it is not a new sign-in.
    claimNewSignIn.mockResolvedValue(null);
    // Default: a browser this user has not signed in from before.
    rememberSignInDevice.mockResolvedValue(true);
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

  // Answering success on a failed detection lost the alert (F-46); a 5xx is
  // what the browser's registration retries.
  it("answers a failed detection with a retryable error and records nothing", async () => {
    claimNewSignIn.mockRejectedValueOnce(new Error("db down"));

    const response = await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({ platform: "web", deviceLabel: "Chrome on macOS" }),
      }),
    );

    expect(response.status).toBe(500);
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
    claimNewSignIn.mockResolvedValueOnce("claimed");

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
      browserName: null,
      locationCity: null,
      locationCountry: null,
      occurredAt: expect.any(String),
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

  // Every Mac reports "Macintosh", so the claim keys on the session, and it
  // runs before the upsert that fills in the platform it claims.
  it("claims the sign-in by its session before recording it", async () => {
    await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({ platform: "web", deviceLabel: "Macintosh" }),
      }),
    );

    expect(claimNewSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "session-user",
        supabaseSessionId: "session-id-1",
        platform: "web",
        claims: expect.objectContaining({ session_id: "session-id-1" }),
      }),
    );
    expect(claimNewSignIn.mock.invocationCallOrder[0]).toBeLessThan(
      trackUserSessionForUser.mock.invocationCallOrder[0]!,
    );
  });

  // The claim is spent once it wins, so an alert held back until after the
  // write would be lost for good when the write failed and the client retried.
  it("still alerts when recording the session fails after the claim", async () => {
    claimNewSignIn.mockResolvedValueOnce("claimed");
    trackUserSessionForUser.mockRejectedValueOnce(new Error("write failed"));

    const response = await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({ platform: "web", deviceLabel: "Chrome on macOS" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(dispatchNotificationEvent).toHaveBeenCalledOnce();
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "session-user",
      expect.objectContaining({ action: "security_new_device", supabaseSessionId: "session-id-1" }),
    );
  });

  it("alerts a session with no row only once its write lands", async () => {
    claimNewSignIn.mockResolvedValue("unrecorded");
    trackUserSessionForUser.mockRejectedValueOnce(new Error("write failed"));
    const report = () =>
      POST(
        new NextRequest("http://localhost/api/auth/track-session", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
          body: JSON.stringify({ platform: "web", deviceLabel: "Chrome on macOS" }),
        }),
      );

    expect((await report()).status).toBe(500);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();

    expect((await report()).status).toBe(200);
    expect(dispatchNotificationEvent).toHaveBeenCalledOnce();
  });

  it("stays quiet on a new session from a browser this user has signed in from before", async () => {
    claimNewSignIn.mockResolvedValueOnce("claimed");
    rememberSignInDevice.mockResolvedValueOnce(false);

    await POST(trackRequest({ cookie: `dg_device=${KNOWN_DEVICE}` }));

    expect(rememberSignInDevice).toHaveBeenCalledWith({
      userId: "session-user",
      deviceId: KNOWN_DEVICE,
      platform: "web",
    });
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("remembers the device of a session with no row only after its write lands", async () => {
    claimNewSignIn.mockResolvedValueOnce("unrecorded");

    await POST(trackRequest({ cookie: `dg_device=${KNOWN_DEVICE}` }));

    expect(trackUserSessionForUser.mock.invocationCallOrder[0]).toBeLessThan(
      rememberSignInDevice.mock.invocationCallOrder[0]!,
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledOnce();
  });

  it("keeps the browser's device id and refreshes its cookie", async () => {
    const response = await POST(trackRequest({ cookie: `dg_device=${KNOWN_DEVICE}` }));

    const cookie = response.cookies.get("dg_device");
    expect(cookie?.value).toBe(KNOWN_DEVICE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(cookie?.maxAge).toBe(400 * 24 * 60 * 60);
  });

  it("issues a device id to a browser without a valid one", async () => {
    claimNewSignIn.mockResolvedValueOnce("claimed");

    const response = await POST(trackRequest({ cookie: "dg_device=not-an-issued-id" }));

    const issued = response.cookies.get("dg_device")?.value;
    expect(issued).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(rememberSignInDevice).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: issued }),
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledOnce();
  });

  it("does not check the device when the session has reported before", async () => {
    await POST(trackRequest({ cookie: `dg_device=${KNOWN_DEVICE}` }));

    expect(rememberSignInDevice).not.toHaveBeenCalled();
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

const KNOWN_DEVICE = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

function trackRequest({ cookie }: { cookie: string }): NextRequest {
  return new NextRequest("http://localhost/api/auth/track-session", {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie },
    body: JSON.stringify({ platform: "web", deviceLabel: "Chrome on macOS" }),
  });
}

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
