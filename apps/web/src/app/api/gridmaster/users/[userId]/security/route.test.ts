import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const loadPersonTarget = vi.fn();
const endPersonSession = vi.fn();
const forgetPersonDevice = vi.fn();
const disablePersonPushDevice = vi.fn();
const revokePersonCalendarFeed = vi.fn();
const clearLoginLock = vi.fn();
const writeAudit = vi.fn();
const validateCsrfOrigin = vi.fn();
const serviceClient = { service: true };

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => validateCsrfOrigin() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => serviceClient }));
const loginLimiterConfigured = vi.fn(() => true);
vi.mock("@/lib/rate-limit", () => ({
  clearLoginLock: (email: string) => clearLoginLock(email),
  loginLimiterConfigured: () => loginLimiterConfigured(),
}));
vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLogAfterCommit: (input: unknown) => writeAudit(input),
}));
vi.mock("@/features/gridmaster/server/person-target", () => ({
  loadPersonTarget: (...args: unknown[]) => loadPersonTarget(...args),
}));
vi.mock("@/features/gridmaster/server/person-security", () => ({
  endPersonSession: (...args: unknown[]) => endPersonSession(...args),
  forgetPersonDevice: (...args: unknown[]) => forgetPersonDevice(...args),
  disablePersonPushDevice: (...args: unknown[]) => disablePersonPushDevice(...args),
  revokePersonCalendarFeed: (...args: unknown[]) => revokePersonCalendarFeed(...args),
}));

import { POST } from "./route";

const USER = "11111111-1111-4111-8111-111111111111";
const ROW = "22222222-2222-4222-8222-222222222222";

function post(body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/gridmaster/users/${USER}/security`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ userId: USER }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  requireGridmasterSession.mockResolvedValue({ user: { id: "gm", email: "gm@dubgrid.com" } });
  requireSensitiveActionAuth.mockResolvedValue({ user: { id: "gm" }, sessionId: "s" });
  loadPersonTarget.mockResolvedValue({ userId: USER, email: "ada@example.com" });
  for (const helper of [
    endPersonSession,
    forgetPersonDevice,
    disablePersonPushDevice,
    revokePersonCalendarFeed,
  ]) {
    helper.mockResolvedValue(true);
  }
  clearLoginLock.mockResolvedValue({ locked: false, resetsAt: null });
  writeAudit.mockResolvedValue(undefined);
});

describe("POST /api/gridmaster/users/[userId]/security", () => {
  it("changes nothing on a stale session", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });
    expect((await post({ action: "endSession", sessionId: ROW })).status).toBe(403);
    expect(endPersonSession).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("refuses a Gridmaster target", async () => {
    loadPersonTarget.mockResolvedValueOnce(null);
    expect((await post({ action: "forgetDevice", deviceId: ROW })).status).toBe(404);
    expect(forgetPersonDevice).not.toHaveBeenCalled();
  });

  it("rejects an unknown action or a malformed id", async () => {
    expect((await post({ action: "deleteAccount" })).status).toBe(400);
    expect((await post({ action: "endSession", sessionId: "nope" })).status).toBe(400);
  });

  it.each([
    ["endSession", { sessionId: ROW }, endPersonSession, "user.session_ended", "sessionId"],
    ["forgetDevice", { deviceId: ROW }, forgetPersonDevice, "user.device_forgotten", "deviceId"],
    [
      "disablePushDevice",
      { deviceId: ROW },
      disablePersonPushDevice,
      "user.push_device_disabled",
      "deviceId",
    ],
    [
      "revokeCalendarFeed",
      { feedId: ROW },
      revokePersonCalendarFeed,
      "user.calendar_feed_revoked",
      "feedId",
    ],
  ] as const)(
    "runs %s on the person's own row and records it",
    async (action, fields, helper, audit, key) => {
      const response = await post({ action, ...fields });
      expect(response.status).toBe(200);
      expect(helper).toHaveBeenCalledWith(serviceClient, USER, ROW);
      expect(writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: audit,
          resourceId: USER,
          details: { targetUserId: USER, [key]: ROW },
        }),
      );
    },
  );

  it("answers 404 and records nothing for a row that is not theirs", async () => {
    endPersonSession.mockResolvedValueOnce(false);
    expect((await post({ action: "endSession", sessionId: ROW })).status).toBe(404);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("refuses to clear a lock where no limiter runs, and records nothing", async () => {
    loginLimiterConfigured.mockReturnValueOnce(false);
    expect((await post({ action: "clearLoginLock" })).status).toBe(409);
    expect(clearLoginLock).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("clears the sign-in lock and returns what it reads back", async () => {
    const response = await post({ action: "clearLoginLock" });
    expect(response.status).toBe(200);
    expect(clearLoginLock).toHaveBeenCalledWith("ada@example.com");
    expect(await response.json()).toEqual({
      success: true,
      loginLock: { locked: false, resetsAt: null },
    });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.login_lock_cleared" }),
    );
  });

  it("refuses a cross-origin request before anything else (F-95)", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Invalid origin" }, { status: 403 }),
    );
    expect((await post({ action: "clearLoginLock" })).status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(clearLoginLock).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });
});
