import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const sendResendEmail = vi.fn();
const serviceFrom = vi.fn();
const update = vi.fn();
const eq = vi.fn();

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
  getServiceClient: () => ({ from: serviceFrom }),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

const GRIDMASTER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_SESSION_ID = "33333333-3333-4333-8333-333333333333";

function request() {
  return new NextRequest("http://localhost/api/notify-impersonation", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.5" },
    body: JSON.stringify({
      targetEmail: "target@example.com",
      targetOrgName: "Calm Haven",
      type: "start",
      sessionId: SESSION_ID,
      justification: "Customer support investigation",
    }),
  });
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
    eq.mockReturnValue({ eq });
    update.mockReturnValue({ eq });
    serviceFrom.mockReturnValue({ update });
  });

  it("stops before side effects when live Gridmaster authorization fails", async () => {
    const denied = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireGridmasterSession.mockResolvedValue({ response: denied });

    expect(await POST(request())).toBe(denied);
    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("scopes service-role session updates to the authenticated Gridmaster owner", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(serviceFrom).toHaveBeenCalledWith("impersonation_sessions");
    expect(eq).toHaveBeenNthCalledWith(1, "session_id", SESSION_ID);
    expect(eq).toHaveBeenNthCalledWith(2, "gridmaster_id", GRIDMASTER_ID);
    expect(eq).toHaveBeenNthCalledWith(3, "auth_session_id", AUTH_SESSION_ID);
  });
});
