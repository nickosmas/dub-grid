import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateEffectiveRole, getRoleLevel } from "../../middleware";

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
      get(name: string) { return cookieJar[name]; },
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
    next: (opts?: { request?: { headers?: Headers } }) =>
      makeResponseObject(opts?.request),
    redirect: (url: string | URL) => makeRedirectResponse(url),
  },
}));

// ── Mock jose ────────────────────────────────────────────────────────────────
const mockJwtVerify = vi.fn();
const mockDecodeJwt = vi.fn();

vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
  decodeJwt: (...args: unknown[]) => mockDecodeJwt(...args),
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

// ── Environment variables ────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_JWT_SECRET = "test-secret-key-32chars-minimum!";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_BASE_DOMAIN = "localhost";
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
    expect(calculateEffectiveRole({ platform_role: "none", org_role: "super_admin" })).toBe("super_admin");
  });

  it("returns 'user' when no org_role is set", () => {
    expect(calculateEffectiveRole({ platform_role: "none" })).toBe("user");
  });

  it("returns 'user' when claims are empty", () => {
    expect(calculateEffectiveRole({})).toBe("user");
  });
});

describe("getRoleLevel", () => {
  it("returns 4 for gridmaster", () => { expect(getRoleLevel("gridmaster")).toBe(4); });
  it("returns 3 for super_admin", () => { expect(getRoleLevel("super_admin")).toBe(3); });
  it("returns 2 for admin", () => { expect(getRoleLevel("admin")).toBe(2); });
  it("returns 0 for user", () => { expect(getRoleLevel("user")).toBe(0); });
  it("returns 0 for unknown role", () => { expect(getRoleLevel("unknown")).toBe(0); });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part B: Middleware integration tests
// ══════════════════════════════════════════════════════════════════════════════

// Dynamic import of middleware function — needs mocks set up first
async function runMiddleware(req: ReturnType<typeof makeNextRequest>) {
  const mod = await import("../../middleware");
  return mod.middleware(req as Parameters<typeof mod.middleware>[0]);
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
    const req = makeNextRequest("http://acme.localhost:3000/privacy", { host: "acme.localhost:3000" });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
  });

  it("does NOT redirect / on gridmaster subdomain", async () => {
    const req = makeNextRequest("http://gridmaster.localhost:3000/", { host: "gridmaster.localhost:3000" });
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
    const req = makeNextRequest("http://acme.localhost:3000/schedule", { host: "acme.localhost:3000" });
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
    const req = makeNextRequest("http://acme.localhost:3000/schedule", { host: "acme.localhost:3000" });
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
    mockDecodeJwt.mockImplementation(() => { throw new Error("bad token"); });
    const req = makeNextRequest("http://localhost:3000/schedule");
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/login");
  });
});

describe("middleware: route guards", () => {
  it("redirects user role from /staff to /schedule", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/staff", { host: "acme.localhost:3000" });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/schedule");
  });

  it("allows admin role on /staff", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/staff", { host: "acme.localhost:3000" });
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
    const req = makeNextRequest("http://acme.localhost:3000/settings", { host: "acme.localhost:3000" });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("redirect");
    expect((res as { _redirectUrl: string })._redirectUrl).toContain("/schedule");
  });

  it("allows admin role on /settings", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/settings", { host: "acme.localhost:3000" });
    const res = await runMiddleware(req);
    expect((res as { _type: string })._type).toBe("next");
  });

  it("redirects non-gridmaster from /gridmaster to /schedule", async () => {
    mockSessionWithClaims({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
      org_slug: "acme",
      sub: "user-1",
    });
    const req = makeNextRequest("http://acme.localhost:3000/gridmaster", { host: "acme.localhost:3000" });
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
    const req = makeNextRequest("http://acme.localhost:3000/schedule", { host: "acme.localhost:3000" });
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
    const req = makeNextRequest("http://acme.localhost:3000/schedule", { host: "acme.localhost:3000" });
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
    const req = makeNextRequest("http://acme.localhost:3000/schedule", { host: "acme.localhost:3000" });
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
