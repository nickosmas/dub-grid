import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const validateCsrfOrigin = vi.fn();
const sendResendEmail = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) =>
    requireAuthenticatedUserWithClaims(req),
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

vi.mock("@/lib/resend", () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
}));

vi.mock("@/lib/email", () => ({
  sanitizeHeaderValue: (value: string) => value,
  emailBaseUrl: () => "https://app.test",
}));

// Avoid rendering the real react-email template in unit tests.
vi.mock("@react-email/components", () => ({
  render: vi.fn(async () => "<html>trial</html>"),
}));

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

// One query object backs both chains the route uses:
//   GET:  .select(...).eq(...).maybeSingle()
//   send/POST: .update(...).eq(...).is(...)
let orgResult: { data: unknown; error: unknown } = { data: null, error: null };

function makeQuery() {
  const query = {
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => Promise.resolve({ error: null })),
    maybeSingle: vi.fn(() => Promise.resolve(orgResult)),
  };
  return query;
}

function superAdminAuth(extra: Record<string, unknown> = {}) {
  return {
    user: { id: "user-1", email: "owner@example.com" },
    session: { access_token: "test-token" },
    claims: { sub: "user-1", org_role: "super_admin", org_id: ORG_ID, ...extra },
  };
}

function request(method = "GET") {
  return new NextRequest("http://localhost/api/trial-welcome", { method });
}

describe("GET /api/trial-welcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgResult = { data: null, error: null };
    requireAuthenticatedUserWithClaims.mockResolvedValue(superAdminAuth());
    serviceFrom.mockImplementation(() => makeQuery());
  });

  it("shows the welcome for a trialing org the super_admin hasn't dismissed", async () => {
    orgResult = {
      data: {
        name: "Acme",
        subscription_status: "trialing",
        trial_ends_at: "2026-06-05T00:00:00Z",
        trial_welcome_email_sent_at: "2026-05-20T00:00:00Z",
        trial_welcome_seen_at: null,
      },
      error: null,
    };

    const res = await GET(request());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: true,
      trialEndsAt: "2026-06-05T00:00:00Z",
    });
  });

  it("hides the welcome once it has been dismissed", async () => {
    orgResult = {
      data: {
        name: "Acme",
        subscription_status: "trialing",
        trial_ends_at: "2026-06-05T00:00:00Z",
        trial_welcome_email_sent_at: "2026-05-20T00:00:00Z",
        trial_welcome_seen_at: "2026-05-22T00:00:00Z",
      },
      error: null,
    };

    const res = await GET(request());
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: false,
      trialEndsAt: "2026-06-05T00:00:00Z",
    });
  });

  it("returns empty when the trial clock has not started", async () => {
    orgResult = {
      data: {
        name: "Acme",
        subscription_status: "trialing",
        trial_ends_at: null,
        trial_welcome_email_sent_at: null,
        trial_welcome_seen_at: null,
      },
      error: null,
    };

    const res = await GET(request());
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: false,
      trialEndsAt: null,
    });
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("returns empty for non-super-admins without hitting the DB", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce(
      superAdminAuth({ org_role: "admin" }),
    );

    const res = await GET(request());
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: false,
      trialEndsAt: null,
    });
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("sends the trial-started email once when it hasn't been sent yet", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_test";
    try {
      orgResult = {
        data: {
          name: "Acme",
          subscription_status: "trialing",
          trial_ends_at: "2026-06-05T00:00:00Z",
          trial_welcome_email_sent_at: null,
          trial_welcome_seen_at: null,
        },
        error: null,
      };

      const res = await GET(request());
      expect(res.status).toBe(200);
      expect(sendResendEmail).toHaveBeenCalledTimes(1);
    } finally {
      if (prevKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = prevKey;
    }
  });
});

describe("POST /api/trial-welcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    forbidIfSandboxCookie.mockReturnValue(null);
    requireAuthenticatedUserWithClaims.mockResolvedValue(superAdminAuth());
    serviceFrom.mockImplementation(() => makeQuery());
  });

  it("marks the welcome seen for a super_admin", async () => {
    const res = await POST(request("POST"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(serviceFrom).toHaveBeenCalledWith("organizations");
  });

  it("blocks the CSRF check before doing anything", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Bad origin" }, { status: 403 }),
    );

    const res = await POST(request("POST"));
    expect(res.status).toBe(403);
    expect(requireAuthenticatedUserWithClaims).not.toHaveBeenCalled();
  });

  it("blocks a sandbox request", async () => {
    forbidIfSandboxCookie.mockReturnValueOnce(
      NextResponse.json({ error: "Sandbox" }, { status: 403 }),
    );

    const res = await POST(request("POST"));
    expect(res.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("forbids non-super-admins", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce(
      superAdminAuth({ org_role: "admin" }),
    );

    const res = await POST(request("POST"));
    expect(res.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
  });
});
