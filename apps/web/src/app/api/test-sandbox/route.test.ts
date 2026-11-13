import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const checkRateLimit = vi.fn();
const getServiceClient = vi.fn();
const createSandboxForUser = vi.fn();
const deleteSandboxForUser = vi.fn();
const findActiveSandboxForUser = vi.fn();
const findSandboxFromOtherSession = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithTokenClaims: (req: NextRequest) =>
    requireAuthenticatedUserWithClaims(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/features/test-sandbox/server", () => ({
  createSandboxForUser: (...args: unknown[]) => createSandboxForUser(...args),
  deleteSandboxForUser: (...args: unknown[]) => deleteSandboxForUser(...args),
  findActiveSandboxForUser: (...args: unknown[]) => findActiveSandboxForUser(...args),
  findSandboxFromOtherSession: (...args: unknown[]) => findSandboxFromOtherSession(...args),
}));

const USER_ID = "user-1";
const SOURCE_ORG = "11111111-1111-1111-1111-111111111111";
const AUTH_SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Service client stub: profiles returns the default org (+ platform_role);
 * organization_memberships (role in the source org) is configurable.
 * `role: null` means "not an active member".
 */
function buildServiceClient(opts: {
  role: "user" | "admin" | "super_admin" | null;
  adminPermissions?: Record<string, boolean>;
  gridmaster?: boolean;
  /** profiles.org_id — the user's GLOBAL default, which any device can move. */
  profileOrgId?: string;
}) {
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  org_id: opts.profileOrgId ?? SOURCE_ORG,
                  platform_role: opts.gridmaster ? "gridmaster" : null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "organization_memberships") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: opts.role
                      ? {
                          org_role: opts.role,
                          admin_permissions: opts.adminPermissions ?? { canManageEmployees: true },
                        }
                      : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { archived_at: null, suspended_at: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "employees") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { suspended_at: null }, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeRequest(
  action: string,
  opts?: { sandboxCookie?: boolean; replaceExisting?: boolean },
): NextRequest {
  return new NextRequest("https://app.test/api/test-sandbox", {
    method: "POST",
    body: JSON.stringify(
      opts?.replaceExisting === undefined
        ? { action }
        : { action, replaceExisting: opts.replaceExisting },
    ),
    headers: opts?.sandboxCookie ? { cookie: "dubgrid-sandbox=already-in-one" } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  requireAuthenticatedUserWithClaims.mockResolvedValue({
    user: { id: USER_ID },
    sessionId: AUTH_SESSION_ID,
    claims: { org_id: SOURCE_ORG },
  });
  checkRateLimit.mockResolvedValue({ limited: false, reset: 0, misconfigured: false });
  findActiveSandboxForUser.mockResolvedValue(null);
  findSandboxFromOtherSession.mockResolvedValue(null);
  createSandboxForUser.mockResolvedValue({ id: "sandbox-1", slug: "sandbox-abc" });
  deleteSandboxForUser.mockResolvedValue(undefined);
});

describe("POST /api/test-sandbox", () => {
  it("asks before replacing a sandbox open in another session, and deletes nothing", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: "super_admin" }));
    findSandboxFromOtherSession.mockResolvedValue({
      id: "other-sandbox",
      startedAt: "2026-11-12T22:14:00.000Z",
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "SANDBOX_OPEN_ELSEWHERE",
      startedAt: "2026-11-12T22:14:00.000Z",
    });
    expect(deleteSandboxForUser).not.toHaveBeenCalled();
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });

  it("replaces the other session's sandbox once the person confirms", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: "super_admin" }));
    findSandboxFromOtherSession.mockResolvedValue({ id: "other-sandbox", startedAt: null });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter", { replaceExisting: true }));

    expect(res.status).toBe(200);
    expect(findSandboxFromOtherSession).not.toHaveBeenCalled();
    expect(deleteSandboxForUser).toHaveBeenCalled();
    expect(createSandboxForUser).toHaveBeenCalled();
  });

  it("replaces this session's sandbox when it was cloned from another organization", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: "super_admin" }));
    findActiveSandboxForUser.mockResolvedValue({
      id: "old-sandbox",
      slug: "sandbox-old",
      sourceOrgId: "22222222-2222-2222-2222-222222222222",
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ sandbox: { reused: false } });
    expect(deleteSandboxForUser).toHaveBeenCalled();
    expect(createSandboxForUser).toHaveBeenCalledWith(
      expect.objectContaining({ sourceOrgId: SOURCE_ORG }),
    );
  });

  it("marks the sandbox cookie Secure over https only, as the auth cookies", async () => {
    // WebKit refuses a Secure cookie set over plain http, even on localhost.
    getServiceClient.mockReturnValue(buildServiceClient({ role: "super_admin" }));
    const { POST } = await import("./route");

    const overHttps = await POST(makeRequest("enter"));
    expect(overHttps.headers.get("set-cookie")).toMatch(/dubgrid-sandbox=.*; Secure/i);

    const overHttp = await POST(
      new NextRequest("http://calmhaven.localhost:3000/api/test-sandbox", {
        method: "POST",
        body: JSON.stringify({ action: "enter" }),
      }),
    );
    expect(overHttp.status).toBe(200);
    expect(overHttp.headers.get("set-cookie")).not.toMatch(/Secure/i);
  });

  it("exits without consulting the sandbox cookie's validity", async () => {
    // Exit authenticates with the token's own claims; a stale cookie must not
    // be able to refuse the one action that clears it.
    getServiceClient.mockReturnValue(buildServiceClient({ role: "super_admin" }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("exit", { sandboxCookie: true }));

    expect(res.status).toBe(200);
    expect(deleteSandboxForUser).toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toMatch(/dubgrid-sandbox=;.*Max-Age=0/i);
  });

  it("refuses to clone an org the user is not an active member of", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: null }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(403);
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });

  it("clones and sets the sandbox cookie for an active admin member", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: "admin" }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(200);
    expect(createSandboxForUser).toHaveBeenCalledWith(
      expect.objectContaining({ sourceOrgId: SOURCE_ORG, sessionId: AUTH_SESSION_ID }),
    );
    expect(res.cookies.get("dubgrid-sandbox")?.value).toBeTruthy();
  });

  // profiles.org_id is a per-user global that switch_org rewrites on EVERY
  // device. Sourcing the clone from it meant a user sitting on org A's
  // subdomain could press Enter and get a full copy of org B's employees, PII
  // and schedules — because some other device of theirs had switched to B.
  // The session's own claim is the only value scoped to this browser.
  it("clones the session's org, not whichever org another device last switched to", async () => {
    const OTHER_ORG = "22222222-2222-2222-2222-222222222222";
    getServiceClient.mockReturnValue(
      buildServiceClient({ role: "admin", profileOrgId: OTHER_ORG }),
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(200);
    expect(createSandboxForUser).toHaveBeenCalledWith(
      expect.objectContaining({ sourceOrgId: SOURCE_ORG }),
    );
  });

  it("uses the current session's recorded sandbox source on reset", async () => {
    const REAL_ORG = "33333333-3333-3333-3333-333333333333";
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: USER_ID },
      sessionId: AUTH_SESSION_ID,
      claims: { org_id: "sandbox-1", org_role: "super_admin", in_sandbox: true },
    });
    getServiceClient.mockReturnValue(buildServiceClient({ role: "admin", profileOrgId: REAL_ORG }));
    findActiveSandboxForUser.mockResolvedValue({
      id: "sandbox-1",
      slug: "sandbox-abc",
      sourceOrgId: REAL_ORG,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("reset", { sandboxCookie: true }));

    expect(res.status).toBe(200);
    expect(createSandboxForUser).toHaveBeenCalledWith(
      expect.objectContaining({ sourceOrgId: REAL_ORG }),
    );
  });

  it("refuses an Admin who can't manage staff, since a sandbox makes them Super Admin of a copy (F-198)", async () => {
    getServiceClient.mockReturnValue(
      buildServiceClient({ role: "admin", adminPermissions: { canEditShifts: true } }),
    );

    const { POST } = await import("./route");
    const response = await POST(makeRequest("enter"));

    expect(response.status).toBe(403);
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });

  it("refuses a plain user-role member (sandbox is admin+ only)", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: "user" }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(403);
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });

  it("refuses a user-role member on reset even if a sandbox cookie already widened their claims", async () => {
    // Once inside a sandbox, requireAuthenticatedUserWithClaims rewrites
    // claims.org_role to "super_admin" — the route must not trust that for
    // the sandbox-mode gate, or a demoted user could keep resetting forever.
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: USER_ID },
      sessionId: AUTH_SESSION_ID,
      claims: { org_id: "sandbox-1", org_role: "super_admin", in_sandbox: true },
    });
    getServiceClient.mockReturnValue(buildServiceClient({ role: "user" }));
    findActiveSandboxForUser.mockResolvedValue({
      id: "sandbox-1",
      slug: "sandbox-abc",
      sourceOrgId: SOURCE_ORG,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("reset"));

    expect(res.status).toBe(403);
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });

  it("allows a gridmaster to enter sandbox mode without an org_role membership check", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: null, gridmaster: true }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(200);
    expect(createSandboxForUser).toHaveBeenCalledWith(
      expect.objectContaining({ sourceOrgId: SOURCE_ORG }),
    );
  });

  it("rate-limits the expensive enter/reset clone path", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, reset: 1000, misconfigured: false });
    getServiceClient.mockReturnValue(buildServiceClient({ role: "admin" }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(429);
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });

  it("does not throttle or membership-check exit", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: null }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("exit"));

    expect(res.status).toBe(200);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(deleteSandboxForUser).toHaveBeenCalled();
  });

  it("clears the sandbox cookie on exit", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: null }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("exit"));

    const cookie = res.cookies.get("dubgrid-sandbox");
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });

  it("reuses an existing sandbox on enter instead of cloning again", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: "admin" }));
    findActiveSandboxForUser.mockResolvedValue({
      id: "existing-sandbox",
      slug: "existing-slug",
      sourceOrgId: SOURCE_ORG,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(createSandboxForUser).not.toHaveBeenCalled();
    expect(body.sandbox).toEqual({ id: "existing-sandbox", slug: "existing-slug", reused: true });
  });

  it("reset wipes any existing sandbox and clones a fresh one, ignoring reuse", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ role: "admin" }));
    // Even though a reusable sandbox exists, "reset" must not reuse it.
    findActiveSandboxForUser.mockResolvedValue({
      id: "stale-sandbox",
      slug: "stale-slug",
      sourceOrgId: SOURCE_ORG,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("reset"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(deleteSandboxForUser).toHaveBeenCalled();
    expect(createSandboxForUser).toHaveBeenCalledWith(
      expect.objectContaining({ sourceOrgId: SOURCE_ORG }),
    );
    expect(body.sandbox).toEqual({ id: "sandbox-1", slug: "sandbox-abc", reused: false });
    expect(res.cookies.get("dubgrid-sandbox")?.value).toBeTruthy();
  });

  it("rejects a malformed action body", async () => {
    const req = new NextRequest("https://app.test/api/test-sandbox", {
      method: "POST",
      body: JSON.stringify({ action: "bogus" }),
    });

    const { POST } = await import("./route");
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(createSandboxForUser).not.toHaveBeenCalled();
    expect(deleteSandboxForUser).not.toHaveBeenCalled();
  });

  it("returns 503 when the rate limiter is misconfigured", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, reset: 0, misconfigured: true });
    getServiceClient.mockReturnValue(buildServiceClient({ role: "admin" }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(503);
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });
});
