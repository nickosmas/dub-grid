import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const trackUserSessionForUser = vi.fn();
const isNewSignInSession = vi.fn();
const scheduleSecurityAlert = vi.fn();

vi.mock("@/features/account/server/security-alerts", () => ({
  isNewSignInSession: (...args: unknown[]) => isNewSignInSession(...args),
  scheduleSecurityAlert: (...args: unknown[]) => scheduleSecurityAlert(...args),
}));

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
}));

vi.mock("@/features/account/server", () => ({
  trackUserSessionForUser: (input: unknown) => trackUserSessionForUser(input),
}));

describe("POST /api/mobile/v1/session-presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuth.mockResolvedValue({
      user: {
        id: "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      },
      currentOrg: {
        id: "11111111-1111-4111-8111-111111111111",
      },
      claims: {
        session_id: "78da2bc6-bba9-44d2-83b4-6b3923f5c5d8",
      },
    });
    trackUserSessionForUser.mockResolvedValue(undefined);
    isNewSignInSession.mockResolvedValue(false);
  });

  // Mobile sign-ins used to raise no out-of-band alert at all.
  it("alerts on a mobile sign-in session not seen before", async () => {
    isNewSignInSession.mockResolvedValueOnce(true);
    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/mobile/v1/session-presence", {
        method: "POST",
        body: JSON.stringify({ platform: "android", deviceLabel: "Pixel 8" }),
      }) as never,
    );

    expect(isNewSignInSession).toHaveBeenCalledWith(
      "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      "78da2bc6-bba9-44d2-83b4-6b3923f5c5d8",
    );
    expect(isNewSignInSession.mock.invocationCallOrder[0]).toBeLessThan(
      trackUserSessionForUser.mock.invocationCallOrder[0]!,
    );
    expect(scheduleSecurityAlert).toHaveBeenCalledWith(
      "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      expect.objectContaining({
        action: "security_new_device",
        supabaseSessionId: "78da2bc6-bba9-44d2-83b4-6b3923f5c5d8",
        platform: "android",
        deviceLabel: "Pixel 8",
      }),
    );
  });

  it("stays quiet when the same mobile session reports again", async () => {
    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/mobile/v1/session-presence", {
        method: "POST",
        body: JSON.stringify({ platform: "ios", deviceLabel: "iPhone" }),
      }) as never,
    );

    expect(scheduleSecurityAlert).not.toHaveBeenCalled();
  });

  it("registers the authenticated mobile session", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/session-presence", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.9, 10.0.0.1",
          "x-vercel-ip-city": "Migori",
          "x-vercel-ip-country": "KE",
        },
        body: JSON.stringify({
          platform: "ios",
          deviceLabel: "DubGrid Mobile on iOS",
        }),
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(trackUserSessionForUser).toHaveBeenCalledWith({
      userId: "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      orgId: "11111111-1111-4111-8111-111111111111",
      supabaseSessionId: "78da2bc6-bba9-44d2-83b4-6b3923f5c5d8",
      platform: "ios",
      deviceLabel: "DubGrid Mobile on iOS",
      appVersion: null,
      ipAddress: "203.0.113.9",
      locationCity: "Migori",
      locationCountry: "Kenya",
    });
    expect(payload).toEqual({ success: true });
  });

  it("rejects authenticated requests that are missing a Supabase session id", async () => {
    requireMobileAuth.mockResolvedValueOnce({
      user: {
        id: "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      },
      claims: {},
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/session-presence", {
        method: "POST",
        body: JSON.stringify({
          platform: "ios",
          deviceLabel: "DubGrid Mobile on iOS",
        }),
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "Missing session id" });
    expect(trackUserSessionForUser).not.toHaveBeenCalled();
  });
});
