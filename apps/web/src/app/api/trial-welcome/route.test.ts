import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const requireOrgPermissions = vi.fn();
const validateCsrfOrigin = vi.fn();
const sendResendEmail = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
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

// One query object backs the chains the route uses:
//   GET org read:   .select(...).eq(...).maybeSingle()
//   email claim:    .update(...).eq(...).is(...).select(...).maybeSingle()
//   POST seen-mark: .update(...).eq(...).is(...)
// All builder methods are chainable; maybeSingle is the terminal that resolves.
let orgResult: { data: unknown; error: unknown } = { data: null, error: null };
// The atomic email claim resolves to the row it won (null = lost the race / already sent).
let claimResult: { data: unknown; error: unknown } = { data: { id: "org" }, error: null };
let maybeSingleCalls = 0;

function makeQuery() {
  const query = {
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    // First maybeSingle in a GET is the org read; the second (if any) is the claim.
    maybeSingle: vi.fn(() => Promise.resolve(maybeSingleCalls++ === 0 ? orgResult : claimResult)),
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

function allowLiveSuperAdmin() {
  requireOrgPermissions.mockResolvedValue({
    actor: { id: "user-1", email: "owner@example.com" },
    permissions: { isSuperAdmin: true },
    serviceClient: { from: serviceFrom },
    userClient: {},
    orgId: ORG_ID,
  });
}

describe("GET /api/trial-welcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgResult = { data: null, error: null };
    claimResult = { data: { id: "org" }, error: null };
    maybeSingleCalls = 0;
    requireAuthenticatedUserWithClaims.mockResolvedValue(superAdminAuth());
    serviceFrom.mockImplementation(() => makeQuery());
    allowLiveSuperAdmin();
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

  it("rejects a stale super-admin claim after live membership access is removed", async () => {
    const denied = NextResponse.json({ error: "Not a member" }, { status: 403 });
    requireOrgPermissions.mockResolvedValueOnce({ response: denied });

    const res = await GET(request());
    expect(res).toBe(denied);
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

  it("sends only ONE email when two requests race (atomic claim)", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_test";
    try {
      // Stateful service that models the atomic claim: the UPDATE ... WHERE
      // trial_welcome_email_sent_at IS NULL ... RETURNING row only succeeds for
      // the first caller; the racing caller gets no row back.
      let sentAt: string | null = null;
      const org = {
        name: "Acme",
        subscription_status: "trialing",
        trial_ends_at: "2026-06-05T00:00:00Z",
        trial_welcome_seen_at: null,
      };
      serviceFrom.mockImplementation(() => {
        let pendingUpdate: string | null | undefined;
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          is: () => q,
          update: (vals: { trial_welcome_email_sent_at: string | null }) => {
            pendingUpdate = vals.trial_welcome_email_sent_at;
            return q;
          },
          maybeSingle: () => {
            // org read
            if (pendingUpdate === undefined) {
              return Promise.resolve({
                data: { ...org, trial_welcome_email_sent_at: sentAt },
                error: null,
              });
            }
            // atomic claim: only flips null -> value once
            if (sentAt === null && pendingUpdate) {
              sentAt = pendingUpdate;
              return Promise.resolve({ data: { id: "org" }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return q;
      });

      await Promise.all([GET(request()), GET(request())]);
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
    allowLiveSuperAdmin();
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

  it("forbids a stale claim when the live membership lacks super-admin permission", async () => {
    const denied = NextResponse.json({ error: "Insufficient permission" }, { status: 403 });
    requireOrgPermissions.mockResolvedValueOnce({ response: denied });

    const res = await POST(request("POST"));
    expect(res).toBe(denied);
    expect(serviceFrom).not.toHaveBeenCalled();
  });
});
