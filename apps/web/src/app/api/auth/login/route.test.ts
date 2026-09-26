import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const validateCsrfOrigin = vi.fn();
const signInWithPassword = vi.fn();
const fetchTermsAcceptanceStatus = vi.fn();
const rpc = vi.fn();
const refreshSession = vi.fn();
const serviceFrom = vi.fn();
const deleteSandboxForUser = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  loginLimiter: {},
  loginIpLimiter: {},
  loginSurgeLimiter: {},
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

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (table: string) => serviceFrom(table) }),
}));

vi.mock("@/features/test-sandbox/server", () => ({
  deleteSandboxForUser: (...args: unknown[]) => deleteSandboxForUser(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/auth/security-audit", () => ({ writeSecurityAuditEvent: vi.fn() }));
const endUserSession = vi.fn();
vi.mock("@/lib/auth/revocation", () => ({
  endUserSession: (...args: unknown[]) => endUserSession(...args),
}));

import { POST } from "@/app/api/auth/login/route";
import { writeSecurityAuditEvent } from "@/lib/auth/security-audit";
import { hashSessionId } from "@/lib/auth/sign-in-completion";
import { SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";

/** A refusal is recorded against the person and ends the session it created. */
function expectRefusal(outcome: string, reason: string, orgId: string | null) {
  expect(writeSecurityAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      event: "security.auth.login",
      outcome,
      reason,
      actorId: USER_ID,
      orgId,
    }),
  );
  expect(writeSecurityAuditEvent).not.toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "succeeded" }),
  );
  expect(endUserSession).toHaveBeenCalledExactlyOnceWith(USER_ID, SESSION_ID);
}

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
    access_token: createJwt({ sub: USER_ID, session_id: SESSION_ID, ...claims }),
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    ...overrides,
  };
}

function stubOrgLookup(
  orgId: string | null,
  state: { archivedAt?: string | null; suspendedAt?: string | null } = {},
) {
  serviceFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { platform_role: null }, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: orgId
              ? {
                  id: orgId,
                  name: "Org",
                  archived_at: state.archivedAt ?? null,
                  suspended_at: state.suspendedAt ?? null,
                }
              : null,
            error: null,
          }),
        }),
      }),
    };
  });
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
    deleteSandboxForUser.mockResolvedValue({ deletedCount: 0 });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-key";
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    validateCsrfOrigin.mockReturnValue(null);
    fetchTermsAcceptanceStatus.mockResolvedValue({
      acceptedCurrentTerms: true,
      acceptedVersion: "v1",
    });
    serviceFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { platform_role: null }, error: null }),
        }),
      }),
    }));
    rpc.mockResolvedValue({ data: null, error: null });
    refreshSession.mockResolvedValue({ data: { session: null }, error: null });
    endUserSession.mockResolvedValue(undefined);
  });

  it("returns 429 without attempting sign-in when rate limited", async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: true, reset: Date.now() + 1000 });

    const res = await POST(makeRequest("acme.localhost"));

    expect(res.status).toBe(429);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("sheds a login surge before calling the auth provider", async () => {
    checkRateLimit
      .mockResolvedValueOnce({ limited: false, misconfigured: false })
      .mockResolvedValueOnce({ limited: false, misconfigured: false })
      .mockResolvedValueOnce({ limited: true, reset: Date.now() + 3_000, misconfigured: false });

    const res = await POST(makeRequest("acme.localhost"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3");
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
    // The password was right, so the refusal is recorded (F-29).
    expect(writeSecurityAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: "security.auth.login",
        outcome: "rejected",
        reason: "account_disabled",
        metadata: expect.objectContaining({ surface: "web" }),
      }),
    );
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
    // A password alone is not a sign-in: the step is challenged, not succeeded.
    expect(writeSecurityAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: "security.auth.login",
        outcome: "challenged",
        reason: "second_factor_required",
        orgId: ORG_ID,
      }),
    );
    expect(endUserSession).not.toHaveBeenCalled();
  });

  // Before the switch the person may not belong to the host organization, so
  // that organization's log must not carry their challenge (41c2).
  it("names no organization for a challenge on another organization's host", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_slug: "other", org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [{ factor_type: "totp", status: "verified" }],
        },
      },
      error: null,
    });

    await POST(makeRequest("acme.localhost"));

    expect(writeSecurityAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "challenged", orgId: null }),
    );
  });

  it("rejects a gridmaster on an organization login before returning tokens", async () => {
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

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({ code: "GRIDMASTER_PORTAL_REQUIRED" });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(fetchTermsAcceptanceStatus).not.toHaveBeenCalled();
    expectRefusal("rejected", "gridmaster_portal_required", null);
  });

  it("rejects an MFA-enrolled gridmaster on an organization login before MFA begins", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ platform_role: "gridmaster" }),
        user: {
          id: USER_ID,
          email: "gm@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [{ factor_type: "totp", status: "verified" }],
        },
      },
      error: null,
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({ code: "GRIDMASTER_PORTAL_REQUIRED" });
    expect(body).not.toHaveProperty("session");
  });

  it("uses the profile role to block a gridmaster whose newly-issued token is stale", async () => {
    serviceFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { platform_role: "gridmaster" }, error: null }),
        }),
      }),
    }));
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: ORG_ID, org_slug: "acme", org_role: "admin" }),
        user: {
          id: USER_ID,
          email: "gm@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });

    const res = await POST(makeRequest("acme.localhost"));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: "GRIDMASTER_PORTAL_REQUIRED" });
  });

  it("starts the active organization's trial for a super_admin", async () => {
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
    expect(body.didSwitchOrg).toBe(false);
    expect(body.destination).toBe("/dashboard");
    expect(rpc).toHaveBeenCalledWith("start_trial_for_org", { p_org_id: ORG_ID });
    expect(rpc).not.toHaveBeenCalledWith("switch_org", expect.anything());
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("does not start a trial for a non-super_admin", async () => {
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

  it.each(["user", "admin", "super_admin"] as const)(
    "returns a usable organization destination for the %s role",
    async (orgRole) => {
      signInWithPassword.mockResolvedValueOnce({
        data: {
          session: makeSession({ org_id: ORG_ID, org_slug: "acme", org_role: orgRole }),
          user: {
            id: USER_ID,
            email: "user@example.com",
            email_confirmed_at: "2026-01-01T00:00:00Z",
            factors: [],
          },
        },
        error: null,
      });

      const response = await POST(makeRequest("acme.localhost"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        destination: "/dashboard",
      });
    },
  );

  it("switches a new session to the organization selected by the subdomain", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    stubOrgLookup(ORG_ID);
    const switched = makeSession({ org_id: ORG_ID, org_slug: "acme", org_role: "super_admin" });
    refreshSession.mockResolvedValueOnce({ data: { session: switched }, error: null });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.didSwitchOrg).toBe(true);
    expect(body.session.access_token).toBe(switched.access_token);
    expect(rpc).toHaveBeenCalledWith("switch_org", { target_org_id: ORG_ID });
    expect(res.cookies.get(SANDBOX_COOKIE_NAME)?.value).toBe("");
    // Attributed to the organization the session ended in, not the one it began in.
    expect(writeSecurityAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "succeeded", orgId: ORG_ID }),
    );
  });

  it("does not return the pre-switch session when host organization refresh fails", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    stubOrgLookup(ORG_ID);
    refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "expired" },
    });

    const res = await POST(makeRequest("acme.localhost"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({
      success: false,
      code: "SESSION_REFRESH_FAILED",
      error: "We couldn't verify your session. Sign in again.",
    });
    expect(body).not.toHaveProperty("session");
    expectRefusal("failed", "service_unavailable", ORG_ID);
  });

  it("refuses login when the requested organization does not exist", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    stubOrgLookup(null);

    const res = await POST(makeRequest("missing.localhost"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("ORG_ACCESS_DENIED");
    expect(rpc).not.toHaveBeenCalledWith("switch_org", expect.anything());
    expectRefusal("rejected", "organization_unavailable", null);
  });

  it("marks a completed password sign-in with its session so it is recorded once", async () => {
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

    expect((await POST(makeRequest("acme.localhost"))).status).toBe(200);
    expect(writeSecurityAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outcome: "succeeded",
        metadata: expect.objectContaining({ sessionHash: hashSessionId(SESSION_ID) }),
      }),
    );
    expect(endUserSession).not.toHaveBeenCalled();
  });

  it("refuses and records a sign-in to an organization the person has no access to", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    stubOrgLookup(ORG_ID);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "no membership" } });

    const res = await POST(makeRequest("acme.localhost"));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ORG_ACCESS_DENIED");
    expectRefusal("rejected", "organization_access_denied", null);
  });

  it("records an organization lookup outage as a failure, not a closed organization", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { platform_role: null }, error: null }),
            }),
          }),
        };
      }
      throw new Error("database unavailable");
    });

    const res = await POST(makeRequest("outage.localhost"));

    expect(res.status).toBe(403);
    expectRefusal("failed", "service_unavailable", null);
  });

  it("still refuses when ending the refused session fails", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    stubOrgLookup(null);
    endUserSession.mockRejectedValueOnce(new Error("provider down"));

    const res = await POST(makeRequest("missing.localhost"));

    expect(res.status).toBe(403);
    expect(await res.json()).not.toHaveProperty("session");
  });

  it.each([
    ["suspended", { suspendedAt: "2026-09-01T00:00:00Z" }, "ORG_SUSPENDED"],
    ["deleted", { archivedAt: "2026-09-01T00:00:00Z" }, "ORG_DELETED"],
  ])("refuses login to a %s organization with its own code", async (_label, state, code) => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: makeSession({ org_id: OTHER_ORG_ID, org_role: "user" }),
        user: {
          id: USER_ID,
          email: "user@example.com",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          factors: [],
        },
      },
      error: null,
    });
    stubOrgLookup(ORG_ID, state);

    const res = await POST(makeRequest("closed.localhost"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe(code);
    expect(rpc).not.toHaveBeenCalledWith("switch_org", expect.anything());
    expectRefusal("rejected", "organization_unavailable", null);
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
    expectRefusal("failed", "service_unavailable", null);
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
    // Not a completed sign-in: the person still has to confirm the address.
    expect(writeSecurityAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "challenged", reason: "email_unconfirmed" }),
    );
  });
});
