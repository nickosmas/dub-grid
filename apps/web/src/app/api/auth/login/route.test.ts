import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const validateCsrfOrigin = vi.fn();
const signInWithPassword = vi.fn();
const fetchTermsAcceptanceStatus = vi.fn();
const rpc = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  loginLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

// The token-scoped client used for org RPCs (get_my_organizations,
// switch_org, start_trial_for_org) and post-switch refreshSession, plus the
// anon-key client used for signInWithPassword itself.
vi.mock("@/lib/api-auth", () => ({
  createTokenScopedClient: () => ({
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { refreshSession: (...args: unknown[]) => refreshSession(...args) },
  }),
  createAnonClient: () => ({
    auth: { signInWithPassword: (...args: unknown[]) => signInWithPassword(...args) },
  }),
}));

vi.mock("@/features/account/server", () => ({
  fetchTermsAcceptanceStatus: (userId: string) => fetchTermsAcceptanceStatus(userId),
}));

vi.mock("@/lib/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureMessage: vi.fn(),
}));

import { POST } from "@/app/api/auth/login/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";

function encodeJwtSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createJwt(payload: Record<string, unknown>): string {
  return [
    encodeJwtSegment({ alg: "none", typ: "JWT" }),
    encodeJwtSegment(payload),
    "signature",
  ].join(".");
}

function makeSession(
  claims: Record<string, unknown>,
  overrides?: Partial<Record<string, unknown>>,
) {
  return {
    access_token: createJwt({ sub: USER_ID, ...claims }),
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    ...overrides,
  };
}

function makeRequest(
  host: string,
  body: unknown = { email: "user@example.com", password: "password123" },
) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { host, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-key";
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    validateCsrfOrigin.mockReturnValue(null);
    fetchTermsAcceptanceStatus.mockResolvedValue({
      acceptedCurrentTerms: true,
      acceptedVersion: "v1",
    });
    rpc.mockResolvedValue({ data: null, error: null });
    refreshSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  it("returns 429 without attempting sign-in when rate limited", async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: true, reset: Date.now() + 1000 });

    const res = await POST(makeRequest("acme.localhost"));

    expect(res.status).toBe(429);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a generic 401 on invalid credentials", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid login credentials", status: 400 },
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Check your email and password and try again.");
  });

  it("returns 403 ACCOUNT_DISABLED when the JWT hook refuses a removed employee", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Your account has been disabled. Contact your organization admin.",
        status: 403,
      },
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({
      success: false,
      code: "ACCOUNT_DISABLED",
      error: "Your account has been disabled. Contact your organization admin.",
    });
  });

  it("returns 503 (not a credentials error) when GoTrue fails with a 5xx, e.g. a hook blip", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: "{}", status: 502 },
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("DubGrid is unavailable right now. Try again in a moment.");
  });

  it("skips org orchestration and returns mfa_required for MFA-enrolled users", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: ORG_ID, org_slug: "acme", org_role: "super_admin" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [{ factor_type: "totp", status: "verified" }],
        },
      },
      error: null,
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.mfa_required).toBe(true);
    expect(body.destination).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchTermsAcceptanceStatus).not.toHaveBeenCalled();
  });

  it("signs in without an org switch when the JWT's org already matches the subdomain, and starts the trial for a super_admin", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: ORG_ID, org_slug: "acme", org_role: "super_admin" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.needsClientOrgSwitch).toBe(false);
    expect(body.destination).toBe("/dashboard");
    expect(rpc).toHaveBeenCalledWith("start_trial_for_org", { p_org_id: ORG_ID });
    expect(rpc).not.toHaveBeenCalledWith("switch_org", expect.anything());
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("does not start a trial for a non-super_admin in the matching org", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: ORG_ID, org_slug: "acme", org_role: "admin" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });

    await POST(makeRequest("acme.localhost"));

    expect(rpc).not.toHaveBeenCalled();
  });

  // Org-switching (get_my_organizations → switch_org → refreshSession) is
  // deliberately NOT collapsed into this route — see orchestratePostSignIn's
  // doc comment and the project_login_double_mint_constraint memory. The
  // route just signals needsClientOrgSwitch and leaves the actual switch to
  // the client (OrgLogin.tsx's findAndSwitchToOrg/switchToOrgAndPrepare).
  it("signals needsClientOrgSwitch without touching org RPCs when the subdomain doesn't match the JWT's org", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_slug: "otherorg", org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.needsClientOrgSwitch).toBe(true);
    expect(body.destination).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
    // The initial (pre-switch) tokens are returned as-is — the client is
    // responsible for minting the final, post-switch session itself.
    expect(body.session.access_token).toBe(
      makeSession({ org_id: OTHER_ORG_ID, org_slug: "otherorg", org_role: "user" }).access_token,
    );
  });

  it("gridmaster: always refreshes once and returns the resolved destination", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ platform_role: "gridmaster" }),
        user: {
          id: USER_ID,
          email: "gm@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    refreshSession.mockResolvedValueOnce({
      data: {
        session: makeSession({ platform_role: "gridmaster" }, { access_token: "gm-refreshed" }),
      },
      error: null,
    });

    const res = await POST(makeRequest("gridmaster.localhost"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(body.session.access_token).toBe("gm-refreshed");
    expect(body.destination).toBe("/dashboard");
  });

  it("gridmaster: returns SESSION_REFRESH_FAILED when the post-signin refresh fails", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ platform_role: "gridmaster" }),
        user: {
          id: USER_ID,
          email: "gm@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: "boom" } });

    const res = await POST(makeRequest("gridmaster.localhost"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("SESSION_REFRESH_FAILED");
  });

  it("directs the user to /accept-terms when current terms aren't accepted", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: ORG_ID, org_slug: "acme", org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    fetchTermsAcceptanceStatus.mockResolvedValueOnce({
      acceptedCurrentTerms: false,
      acceptedVersion: "v0",
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(body.destination).toBe("/accept-terms?next=%2Fdashboard");
  });

  it("skips orchestration entirely when the email isn't confirmed yet", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: ORG_ID, org_slug: "acme", org_role: "super_admin" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: null,
          factors: [],
        },
      },
      error: null,
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.destination).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchTermsAcceptanceStatus).not.toHaveBeenCalled();
  });
});
