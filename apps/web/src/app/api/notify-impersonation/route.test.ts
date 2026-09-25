import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const sendResendEmail = vi.fn();
const serviceFrom = vi.fn();
const update = vi.fn();
const updateEq = vi.fn();
const lookupEq = vi.fn();
const sessionMaybeSingle = vi.fn();
const orgMaybeSingle = vi.fn();
const getUserById = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/resend", () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
}));
vi.mock("@react-email/components", () => ({
  render: vi.fn(async () => "<html>notice</html>"),
}));
vi.mock("@/lib/email", () => ({
  sanitizeHeaderValue: (value: string) => value,
  emailBaseUrl: () => "https://app.test",
}));
vi.mock("@/lib/env.server", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "DubGrid <test@example.com>" },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom, auth: { admin: { getUserById } } }),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

const GRIDMASTER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_SESSION_ID = "33333333-3333-4333-8333-333333333333";

const TARGET_USER_ID = "44444444-4444-4444-8444-444444444444";
const TARGET_ORG_ID = "55555555-5555-4555-8555-555555555555";

function request(body: Record<string, unknown> = { type: "start", sessionId: SESSION_ID }) {
  return new NextRequest("http://localhost/api/notify-impersonation", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.5" },
    body: JSON.stringify(body),
  });
}

function liveSession(overrides: Record<string, unknown> = {}) {
  return {
    target_user_id: TARGET_USER_ID,
    target_org_id: TARGET_ORG_ID,
    justification: "Customer support investigation",
    ended_at: null,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    ...overrides,
  };
}

function sessionTable() {
  const lookup = {
    eq: (...args: unknown[]) => {
      lookupEq(...args);
      return lookup;
    },
    maybeSingle: () => sessionMaybeSingle(),
  };
  return {
    select: () => lookup,
    update: (values: unknown) => {
      update(values);
      const chain = {
        eq: (...args: unknown[]) => {
          updateEq(...args);
          return chain;
        },
      };
      return chain;
    },
  };
}

describe("POST /api/notify-impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    requireGridmasterSession.mockResolvedValue({
      user: { id: GRIDMASTER_ID },
      sessionId: AUTH_SESSION_ID,
    });
    sendResendEmail.mockResolvedValue(undefined);
    sessionMaybeSingle.mockResolvedValue({ data: liveSession(), error: null });
    orgMaybeSingle.mockResolvedValue({ data: { name: "Calm Haven" }, error: null });
    getUserById.mockResolvedValue({ data: { user: { email: "target@example.com" } }, error: null });
    serviceFrom.mockImplementation((table: string) =>
      table === "impersonation_sessions"
        ? sessionTable()
        : { select: () => ({ eq: () => ({ maybeSingle: () => orgMaybeSingle() }) }) },
    );
  });

  it("stops before side effects when live Gridmaster authorization fails", async () => {
    const denied = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireGridmasterSession.mockResolvedValue({ response: denied });

    expect(await POST(request())).toBe(denied);
    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("mails the session's own target, whatever address the request names", async () => {
    const response = await POST(
      request({
        type: "start",
        sessionId: SESSION_ID,
        targetEmail: "someone-else@example.com",
        targetOrgName: "Spoofed Org",
      }),
    );

    expect(response.status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "target@example.com",
        subject: "Account access notice: Calm Haven",
      }),
    );
  });

  it("only reads a session this Gridmaster started on this device", async () => {
    sessionMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(lookupEq).toHaveBeenNthCalledWith(1, "session_id", SESSION_ID);
    expect(lookupEq).toHaveBeenNthCalledWith(2, "gridmaster_id", GRIDMASTER_ID);
    expect(lookupEq).toHaveBeenNthCalledWith(3, "auth_session_id", AUTH_SESSION_ID);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("refuses a start notice for an ended session and an end notice for a live one", async () => {
    sessionMaybeSingle.mockResolvedValue({
      data: liveSession({ ended_at: new Date().toISOString() }),
      error: null,
    });
    expect((await POST(request())).status).toBe(409);

    sessionMaybeSingle.mockResolvedValue({ data: liveSession(), error: null });
    expect((await POST(request({ type: "end", sessionId: SESSION_ID }))).status).toBe(409);

    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("scopes service-role session updates to the authenticated Gridmaster owner", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ ip_address: "203.0.113.5" });
    expect(updateEq).toHaveBeenNthCalledWith(1, "session_id", SESSION_ID);
    expect(updateEq).toHaveBeenNthCalledWith(2, "gridmaster_id", GRIDMASTER_ID);
    expect(updateEq).toHaveBeenNthCalledWith(3, "auth_session_id", AUTH_SESSION_ID);
  });
});
