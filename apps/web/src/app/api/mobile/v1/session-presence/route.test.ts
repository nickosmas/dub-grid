import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const trackUserSessionForUser = vi.fn();
const claimNewSignIn = vi.fn();
const scheduleSecurityAlert = vi.fn();
const rememberSignInDevice = vi.fn();

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KNOWN_INSTALL = "0e9d8c7b-6a5f-4e3d-9c2b-1a0f9e8d7c6b";

vi.mock("@/features/account/server/security-alerts", () => ({
  claimNewSignIn: (...args: unknown[]) => claimNewSignIn(...args),
  scheduleSecurityAlert: (...args: unknown[]) => scheduleSecurityAlert(...args),
}));

vi.mock("@/features/account/server/known-devices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/account/server/known-devices")>()),
  rememberSignInDevice: (...args: unknown[]) => rememberSignInDevice(...args),
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
    claimNewSignIn.mockResolvedValue(null);
    // Default: an install this user has not signed in from before.
    rememberSignInDevice.mockResolvedValue(true);
  });

  // Mobile sign-ins used to raise no out-of-band alert at all.
  it("alerts on a mobile sign-in session not seen before", async () => {
    claimNewSignIn.mockResolvedValueOnce("claimed");
    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/mobile/v1/session-presence", {
        method: "POST",
        body: JSON.stringify({ platform: "android", deviceLabel: "Pixel 8" }),
      }) as never,
    );

    expect(claimNewSignIn).toHaveBeenCalledWith({
      userId: "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      supabaseSessionId: "78da2bc6-bba9-44d2-83b4-6b3923f5c5d8",
      platform: "android",
      claims: expect.objectContaining({ session_id: "78da2bc6-bba9-44d2-83b4-6b3923f5c5d8" }),
    });
    expect(claimNewSignIn.mock.invocationCallOrder[0]).toBeLessThan(
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

  it("still alerts when recording the device fails after the claim", async () => {
    claimNewSignIn.mockResolvedValueOnce("claimed");
    trackUserSessionForUser.mockRejectedValueOnce(new Error("write failed"));
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/session-presence", {
        method: "POST",
        body: JSON.stringify({ platform: "ios", deviceLabel: "iPhone" }),
      }) as never,
    );

    expect(response.status).toBe(500);
    expect(scheduleSecurityAlert).toHaveBeenCalledOnce();
  });

  it("alerts a device with no session row only once its write lands", async () => {
    claimNewSignIn.mockResolvedValue("unrecorded");
    trackUserSessionForUser.mockRejectedValueOnce(new Error("write failed"));
    const { POST } = await import("./route");
    const report = () =>
      POST(
        new Request("http://localhost/api/mobile/v1/session-presence", {
          method: "POST",
          body: JSON.stringify({ platform: "ios", deviceLabel: "iPhone" }),
        }) as never,
      );

    expect((await report()).status).toBe(500);
    expect(scheduleSecurityAlert).not.toHaveBeenCalled();

    expect((await report()).status).toBe(200);
    expect(scheduleSecurityAlert).toHaveBeenCalledOnce();
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
    expect(payload).toEqual({ success: true, deviceId: expect.stringMatching(UUID_V4) });
  });

  it("stays quiet on a new session from an install this user has signed in from before", async () => {
    claimNewSignIn.mockResolvedValueOnce("claimed");
    rememberSignInDevice.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/session-presence", {
        method: "POST",
        body: JSON.stringify({ platform: "ios", deviceLabel: "iPhone", deviceId: KNOWN_INSTALL }),
      }) as never,
    );

    expect(rememberSignInDevice).toHaveBeenCalledWith({
      userId: "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      deviceId: KNOWN_INSTALL,
      platform: "ios",
    });
    expect(scheduleSecurityAlert).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ success: true, deviceId: KNOWN_INSTALL });
  });

  it("issues a device id to an app that sends none, and alerts for it", async () => {
    claimNewSignIn.mockResolvedValueOnce("claimed");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/session-presence", {
        method: "POST",
        body: JSON.stringify({ platform: "android", deviceLabel: "Pixel 8" }),
      }) as never,
    );

    const { deviceId } = (await response.json()) as { deviceId: string };
    expect(deviceId).toMatch(UUID_V4);
    expect(rememberSignInDevice).toHaveBeenCalledWith(expect.objectContaining({ deviceId }));
    expect(scheduleSecurityAlert).toHaveBeenCalledTimes(1);
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
