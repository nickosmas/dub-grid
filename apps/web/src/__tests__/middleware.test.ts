import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateEffectiveRole, getRoleLevel, resetMiddlewareOrgAccessMemo } from "../middleware";

// ── Mock next/server ─────────────────────────────────────────────────────────
// NextResponse.next() and NextResponse.redirect() need to return objects
// that the middleware can manipulate (headers, cookies).

function makeResponseObject(init?: { headers?: Headers }) {
  const headers = init?.headers ? new Headers(init.headers) : new Headers();
  const cookieJar: Record<string, { value: string; options?: Record<string, unknown> }> = {};
  return {
    headers,
    cookies: {
      set(name: string, value: string, options?: Record<string, unknown>) {
        cookieJar[name] = { value, options };
      },
      get(name: string) {
        return cookieJar[name];
      },
      _jar: cookieJar,
    },
    _type: "next" as const,
  };
}

function makeRedirectResponse(url: string | URL) {
  const resp = makeResponseObject();
  return { ...resp, _type: "redirect" as const, _redirectUrl: url.toString() };
}

vi.mock("next/server", () => ({
  NextResponse: {
    next: (opts?: { request?: { headers?: Headers } }) => makeResponseObject(opts?.request),
    redirect: (url: string | URL) => makeRedirectResponse(url),
  },
}));

// ── Mock jose ────────────────────────────────────────────────────────────────
const mockJwtVerify = vi.fn();
const mockDecodeJwt = vi.fn();
// Stable mock keyset function returned by createRemoteJWKSet
const mockJwks = vi.fn();

vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
  decodeJwt: (...args: unknown[]) => mockDecodeJwt(...args),
  // createRemoteJWKSet must be mocked — the middleware calls it at getJwks() time.
  // Return a stable function so jwtVerify receives a consistent keyset argument.
  createRemoteJWKSet: () => mockJwks,
}));

// ── Mock @supabase/ssr ───────────────────────────────────────────────────────
const mockGetSession = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getSession: () => mockGetSession() },
    from: (table: string) => mockSupabaseFrom(table),
  }),
}));

// ── Mock @/lib/impersonation-server ─────────────────────────────────────────
const mockVerifyImpersonationSession = vi.fn();
vi.mock("@/lib/impersonation-server", () => ({
  verifyImpersonationSession: (...args: unknown[]) => mockVerifyImpersonationSession(...args),
}));

// ── Mock @/lib/cache ────────────────────────────────────────────────────────
// Pass-through mock: cacheThrough just calls the fetcher directly.
vi.mock("@/lib/cache", () => ({
  cacheThrough: async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
  CacheKey: {
    mwProfile: (userId: string) => `dg:mw:profile:${userId}`,
    mwMembership: (userId: string, slug: string) => `dg:mw:membership:${userId}:${slug}`,
    mwOrgAccess: (orgId: string) => `dg:mw:orgAccess:${orgId}`,
    mwOrgSuspended: (orgId: string) => `dg:mw:orgSuspended:${orgId}`,
  },
  TTL: { MIDDLEWARE: 30 },
}));

// ── Environment variables ────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  // Module-level memo in front of the org-access lookup, so it survives between
  // cases in this file — one test's org state would otherwise leak into the next.
  resetMiddlewareOrgAccessMemo();
  // SUPABASE_JWT_SECRET is no longer used — middleware now verifies via JWKS.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_BASE_DOMAIN = "localhost";
  process.env.SUPABASE_SECRET_KEY = "test-service-role-key";
  mockVerifyImpersonationSession.mockResolvedValue(null);
  mockSupabaseFrom.mockImplementation((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data:
            table === "organizations"
              ? {
                  suspended_at: null,
                  subscription_status: "active",
                  trial_ends_at: null,
                }
              : null,
          error: null,
        }),
      })),
    })),
  }));
});

// ── Helper: create a NextRequest-like object ─────────────────────────────────
function makeNextRequest(
  url: string,
  options: {
    host?: string;
    cookies?: { name: string; value: string }[];
    rawCookie?: string;
  } = {},
) {
  const parsedUrl = new URL(url);
  const host = options.host ?? parsedUrl.host;
  const headersMap = new Map<string, string>();
  headersMap.set("host", host);
  if (options.rawCookie) {
    headersMap.set("cookie", options.rawCookie);
  }

  return {
    url,
    nextUrl: {
      pathname: parsedUrl.pathname,
      searchParams: parsedUrl.searchParams,
    },
    headers: {
      get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
    },
    cookies: {
      getAll: () => options.cookies ?? [],
    },
  };
}

// ── Helper: mock a session with JWT claims ───────────────────────────────────
function mockSessionWithClaims(claims: Record<string, unknown>) {
  const session = {
    access_token: "fake-jwt",
    user: { id: claims.sub ?? "user-1" },
  };
  mockGetSession.mockResolvedValue({ data: { session } });
  mockJwtVerify.mockResolvedValue({ payload: claims });
  mockDecodeJwt.mockReturnValue(claims);
}

// ══════════════════════════════════════════════════════════════════════════════
// Part A: Pure function tests
// ══════════════════════════════════════════════════════════════════════════════

describe("calculateEffectiveRole", () => {
  it("returns 'gridmaster' when platform_role is gridmaster", () => {
    expect(calculateEffectiveRole({ platform_role: "gridmaster" })).toBe("gridmaster");
  });

  it("returns org_role when platform_role is not gridmaster", () => {
    expect(calculateEffectiveRole({ platform_role: "none", org_role: "super_admin" })).toBe(
      "super_admin",
    );
  });

  it("returns 'user' when no org_role is set", () => {
    expect(calculateEffectiveRole({ platform_role: "none" })).toBe("user");
  });

  it("returns 'user' when claims are empty", () => {
    expect(calculateEffectiveRole({})).toBe("user");
  });
});

describe("getRoleLevel", () => {
  it("returns 4 for gridmaster", () => {
    expect(getRoleLevel("gridmaster")).toBe(4);
  });
  it("returns 3 for super_admin", () => {
    expect(getRoleLevel("super_admin")).toBe(3);
  });
  it("returns 2 for admin", () => {
    expect(getRoleLevel("admin")).toBe(2);
  });
  it("returns 0 for user", () => {
    expect(getRoleLevel("user")).toBe(0);
  });
  it("returns 0 for unknown role", () => {
    expect(getRoleLevel("unknown")).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part B: Middleware integration tests
// ══════════════════════════════════════════════════════════════════════════════

// Dynamic import of middleware function — needs mocks set up first
async function runMiddleware(req: ReturnType<typeof makeNextRequest>) {
  const mod = await import("../middleware");
  return mod.middleware(req as Parameters<typeof mod.middleware>[0]) as unknown;
}

describe("middleware: public routes", () => {
  it("passes through /login", async () => {
    const req = makeNextRequest("http://localhost:3000/login");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("passes through /auth/callback", async () => {
    const req = makeNextRequest("http://localhost:3000/auth/callback");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("passes through /api/webhook", async () => {
    const req = makeNextRequest("http://localhost:3000/api/webhook");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("passes through / (root)", async () => {
    const req = makeNextRequest("http://localhost:3000/");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("passes through /privacy", async () => {
    const req = makeNextRequest("http://localhost:3000/privacy");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("passes through /accept-invite", async () => {
    const req = makeNextRequest("http://localhost:3000/accept-invite");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });
});

describe("middleware: marketing page redirects", () => {
  it("redirects / on org subdomain to apex domain", async () => {
    const req = makeNextRequest("http://acme.localhost:3000/", { host: "acme.localhost:3000" });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("localhost:3000/");
    expect((res as { _redirectUrl: string })._redirectUrl).not.toContain("acme");
  });

  it("redirects /privacy on org subdomain to apex", async () => {
    const req = makeNextRequest("http://acme.localhost:3000/privacy", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
  });

  it("does NOT redirect / on gridmaster subdomain", async () => {
    const req = makeNextRequest("http://gridmaster.localhost:3000/", {
      host: "gridmaster.localhost:3000",
    });
    const res = await runMiddleware(req);
    // / is a public route, so it passes through (not redirected to apex)
    expect((res as { _type: string })._type).toBe("next");
  });
});

describe("middleware: unauthenticated access", () => {
  it("redirects to /login when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const req = makeNextRequest("http://localhost:3000/schedule");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/login");
  });
});

describe("middleware: JWT verification", () => {
  it("uses verified claims on successful jwtVerify", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
    expect(mockJwtVerify).toHaveBeenCalled();
  });

  it("falls back to decodeJwt when jwtVerify fails", async () => {
    const session = { access_token: "fake-jwt", user: { id: "user-1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    mockJwtVerify.mockRejectedValue(new Error("expired"));
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
    });
    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
    expect(mockDecodeJwt).toHaveBeenCalled();
  });

  it("blocks gridmaster from unverified tokens", async () => {
    const session = { access_token: "fake-jwt", user: { id: "user-1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    mockJwtVerify.mockRejectedValue(new Error("expired"));
    mockDecodeJwt.mockReturnValue({
      platform_role: "gridmaster",
      org_role: "user",
    });
    const req = makeNextRequest("http://localhost:3000/schedule");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/login");
  });

  it("redirects to /login when both jwtVerify and decodeJwt fail", async () => {
    const session = { access_token: "fake-jwt", user: { id: "user-1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    mockJwtVerify.mockRejectedValue(new Error("expired"));
    mockDecodeJwt.mockImplementation(() => {
      throw new Error("bad token");
    });
    const req = makeNextRequest("http://localhost:3000/schedule");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/login");
  });
});

describe("middleware: Content-Security-Policy", () => {
  function scriptSrcOf(res: unknown): string {
    const csp = (res as { headers: Headers }).headers.get("Content-Security-Policy") ?? "";
    return (
      csp
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith("script-src")) ?? ""
    );
  }

  // F-4: static/public pages keep 'unsafe-inline' (they're prerendered, no nonce
  // possible); the authenticated app is force-dynamic so it gets a per-request
  // nonce + 'strict-dynamic' and drops 'unsafe-inline'. See SECURITY_AUDIT.md F-4.
  it("keeps 'unsafe-inline' and uses no nonce on static/public pages", async () => {
    const req = makeNextRequest("http://localhost:3000/login");
    const res = await runMiddleware(req);
    const scriptSrc = scriptSrcOf(res);
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'nonce-");
  });

  it("uses a per-request nonce + strict-dynamic and drops 'unsafe-inline' for the authenticated app", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
    const scriptSrc = scriptSrcOf(res);
    expect(scriptSrc).toMatch(/'nonce-[^']+'/);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});

describe("middleware: route guards", () => {
  it("allows user role on /people", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/people", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("allows admin role on /people", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/people", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("redirects user role from /settings to /schedule", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/settings", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string; _redirectUrl: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toBe(
      "http://acme.localhost:3000/schedule",
    );
  });

  it("allows admin role on /settings", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/settings", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("redirects regular users to a neutral unavailable page after trial grace", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    mockSupabaseFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data:
              table === "organizations"
                ? {
                    suspended_at: null,
                    subscription_status: "trialing",
                    trial_ends_at: "2026-01-01T00:00:00.000Z",
                  }
                : null,
            error: null,
          }),
        })),
      })),
    }));

    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);

    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toBe(
      "http://acme.localhost:3000/billing-required",
    );
  });

  it("routes super admins to billing recovery after trial grace", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    mockSupabaseFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data:
              table === "organizations"
                ? {
                    suspended_at: null,
                    subscription_status: "trialing",
                    trial_ends_at: "2026-01-01T00:00:00.000Z",
                  }
                : null,
            error: null,
          }),
        })),
      })),
    }));

    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);

    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toBe(
      "http://acme.localhost:3000/settings?section=org-billing",
    );
  });

  it("keeps super admins locked to billing recovery from direct app URLs", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    mockSupabaseFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data:
              table === "organizations"
                ? {
                    suspended_at: null,
                    subscription_status: "trialing",
                    trial_ends_at: "2026-01-01T00:00:00.000Z",
                  }
                : null,
            error: null,
          }),
        })),
      })),
    }));

    const profileRes = await runMiddleware(
      makeNextRequest("http://acme.localhost:3000/profile", {
        host: "acme.localhost:3000",
      }),
    );
    const settingsRes = await runMiddleware(
      makeNextRequest("http://acme.localhost:3000/settings", {
        host: "acme.localhost:3000",
      }),
    );
    const billingRes = await runMiddleware(
      makeNextRequest("http://acme.localhost:3000/settings?section=org-billing", {
        host: "acme.localhost:3000",
      }),
    );

    expect((profileRes as { _type: string })._type).toBe("redirect");
    expect((profileRes as { _redirectUrl: string })._redirectUrl).toBe(
      "http://acme.localhost:3000/settings?section=org-billing",
    );
    expect((settingsRes as { _type: string })._type).toBe("redirect");
    expect((settingsRes as { _redirectUrl: string })._redirectUrl).toBe(
      "http://acme.localhost:3000/settings?section=org-billing",
    );
    expect((billingRes as { _type: string })._type).toBe("next");
  });

  it("redirects non-gridmaster from /gridmaster to /schedule", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/gridmaster", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/schedule");
  });

  it("allows gridmaster on /gridmaster (redirects to gridmaster subdomain /dashboard)", async () => {
    mockSessionWithClaims({
      platform_role: "gridmaster",
      org_role: "user",
      sub: "gm-1",
    });
    const req = makeNextRequest("http://localhost:3000/gridmaster");
    const res = await runMiddleware(req);
    // Gridmaster on non-gridmaster subdomain hitting /gridmaster → redirect to gridmaster subdomain /dashboard
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/dashboard");
  });
});

describe("middleware: header injection", () => {
  it("sets x-dubgrid-role header", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { headers: Headers }).headers.get("x-dubgrid-role")).toBe("admin");
  });

  it("sets x-dubgrid-org-id header", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { headers: Headers }).headers.get("x-dubgrid-org-id")).toBe("org-1");
  });

  it("sets x-dubgrid-org-slug header when present", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
    });
    const res = await runMiddleware(req);
    expect((res as { headers: Headers }).headers.get("x-dubgrid-org-slug")).toBe("acme");
  });
});

describe("middleware: impersonation", () => {
  it("overrides claims when gridmaster has valid impersonation cookie", async () => {
    mockSessionWithClaims({
      platform_role: "gridmaster",
      org_role: "user",
      sub: "gm-1",
    });
    mockVerifyImpersonationSession.mockResolvedValue({
      targetUserId: "u-2",
      targetOrgId: "org-2",
    });
    const impData = {
      sessionId: "s-1",
      targetUserId: "u-2",
      targetOrgId: "org-2",
      targetOrgSlug: "acme",
      targetOrgRole: "admin",
      targetEmail: "test@example.com",
      targetOrgName: "Acme",
      justification: "debug",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const rawCookie = `dubgrid-impersonation=${encodeURIComponent(JSON.stringify(impData))}`;
    const req = makeNextRequest("http://acme.localhost:3000/schedule", {
      host: "acme.localhost:3000",
      rawCookie,
    });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
    expect((res as { headers: Headers }).headers.get("x-dubgrid-role")).toBe("admin");
    expect((res as { headers: Headers }).headers.get("x-dubgrid-impersonating")).toBe("true");
    expect((res as { headers: Headers }).headers.get("x-dubgrid-org-id")).toBe("org-2");
    expect(mockVerifyImpersonationSession).toHaveBeenCalledWith(expect.anything(), "s-1", "gm-1");
  });

  it("clears the cookie and does not override claims when the session isn't verified (forged or expired)", async () => {
    mockSessionWithClaims({
      platform_role: "gridmaster",
      org_role: "user",
      sub: "gm-1",
    });
    mockVerifyImpersonationSession.mockResolvedValue(null);
    const impData = {
      sessionId: "forged-session",
      targetUserId: "u-2",
      targetOrgId: "org-2",
      targetOrgSlug: "acme",
      targetOrgRole: "super_admin",
      targetEmail: "test@example.com",
      targetOrgName: "Acme",
      justification: "debug",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const rawCookie = `dubgrid-impersonation=${encodeURIComponent(JSON.stringify(impData))}`;
    const req = makeNextRequest("http://localhost:3000/schedule", { rawCookie });
    const res = await runMiddleware(req);
    expect((res as { headers: Headers }).headers.get("x-dubgrid-impersonating")).not.toBe("true");
    const cookieJar = (res as { cookies: { _jar: Record<string, unknown> } }).cookies._jar;
    expect(cookieJar["dubgrid-impersonation"]).toBeDefined();
  });

  it("clears expired impersonation cookie", async () => {
    mockSessionWithClaims({
      platform_role: "gridmaster",
      org_role: "user",
      sub: "gm-1",
    });
    const impData = {
      sessionId: "s-1",
      targetUserId: "u-2",
      targetOrgId: "org-2",
      targetOrgSlug: "acme",
      targetOrgRole: "admin",
      targetEmail: "test@example.com",
      targetOrgName: "Acme",
      justification: "debug",
      expiresAt: new Date(Date.now() - 5000).toISOString(), // expired
    };
    const rawCookie = `dubgrid-impersonation=${encodeURIComponent(JSON.stringify(impData))}`;
    const req = makeNextRequest("http://localhost:3000/schedule", { rawCookie });
    const res = await runMiddleware(req);
    // Cookie should be cleared
    const cookieJar = (res as { cookies: { _jar: Record<string, unknown> } }).cookies._jar;
    expect(cookieJar["dubgrid-impersonation"]).toBeDefined();
  });

  it("clears malformed impersonation cookie", async () => {
    mockSessionWithClaims({
      platform_role: "gridmaster",
      org_role: "user",
      sub: "gm-1",
    });
    const rawCookie = "dubgrid-impersonation=not-valid-json";
    const req = makeNextRequest("http://localhost:3000/schedule", { rawCookie });
    const res = await runMiddleware(req);
    const cookieJar = (res as { cookies: { _jar: Record<string, unknown> } }).cookies._jar;
    expect(cookieJar["dubgrid-impersonation"]).toBeDefined();
  });

  it("auto-ends impersonation on /gridmaster path (redirects to dashboard)", async () => {
    mockSessionWithClaims({
      platform_role: "gridmaster",
      org_role: "user",
      sub: "gm-1",
    });
    const impData = {
      sessionId: "s-1",
      targetUserId: "u-2",
      targetOrgId: "org-2",
      targetOrgSlug: "acme",
      targetOrgRole: "admin",
      targetEmail: "test@example.com",
      targetOrgName: "Acme",
      justification: "debug",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const rawCookie = `dubgrid-impersonation=${encodeURIComponent(JSON.stringify(impData))}`;
    const req = makeNextRequest("http://localhost:3000/gridmaster", { rawCookie });
    const res = await runMiddleware(req);
    // Impersonation is auto-ended (cookie cleared on internal res), then
    // gridmaster on non-gridmaster subdomain hitting /gridmaster redirects
    // to gridmaster subdomain /dashboard
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/dashboard");
  });
});
