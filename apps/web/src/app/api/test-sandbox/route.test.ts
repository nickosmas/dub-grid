import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const checkRateLimit = vi.fn();
const getServiceClient = vi.fn();
const createSandboxForUser = vi.fn();
const deleteSandboxForUser = vi.fn();
const findActiveSandboxForUser = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
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
}));

const USER_ID = "user-1";
const SOURCE_ORG = "11111111-1111-1111-1111-111111111111";

/**
 * Service client stub: profiles returns the default org (+ platform_role);
 * organization_memberships (role in the source org) is configurable.
 * `role: null` means "not an active member".
 */
function buildServiceClient(opts: {
  role: "user" | "admin" | "super_admin" | null;
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
                    data: opts.role ? { org_role: opts.role } : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeRequest(action: string, opts?: { sandboxCookie?: boolean }): NextRequest {
  return new NextRequest("https://app.test/api/test-sandbox", {
    method: "POST",
    body: JSON.stringify({ action }),
    headers: opts?.sandboxCookie ? { cookie: "dubgrid-sandbox=already-in-one" } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  requireAuthenticatedUserWithClaims.mockResolvedValue({
    user: { id: USER_ID },
    claims: { org_id: SOURCE_ORG },
  });
  checkRateLimit.mockResolvedValue({ limited: false, reset: 0, misconfigured: false });
  findActiveSandboxForUser.mockResolvedValue(null);
  createSandboxForUser.mockResolvedValue({ id: "sandbox-1", slug: "sandbox-abc" });
  deleteSandboxForUser.mockResolvedValue(undefined);
});

describe("POST /api/test-sandbox", () => {
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
      expect.objectContaining({ sourceOrgId: SOURCE_ORG }),
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

  // The one case where the profile default is still the right source: on reset
  // a sandbox cookie already exists, so the auth layer has rewritten
  // claims.org_id to the sandbox itself and it can no longer name the source.
  it("falls back to the profile default on reset, where the claim names the sandbox", async () => {
    const REAL_ORG = "33333333-3333-3333-3333-333333333333";
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: USER_ID },
      claims: { org_id: "sandbox-1", org_role: "super_admin", in_sandbox: true },
    });
    getServiceClient.mockReturnValue(buildServiceClient({ role: "admin", profileOrgId: REAL_ORG }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("reset", { sandboxCookie: true }));

    expect(res.status).toBe(200);
    expect(createSandboxForUser).toHaveBeenCalledWith(
      expect.objectContaining({ sourceOrgId: REAL_ORG }),
    );
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
      claims: { org_id: "sandbox-1", org_role: "super_admin", in_sandbox: true },
    });
    getServiceClient.mockReturnValue(buildServiceClient({ role: "user" }));

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
    findActiveSandboxForUser.mockResolvedValue({ id: "existing-sandbox", slug: "existing-slug" });

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
    findActiveSandboxForUser.mockResolvedValue({ id: "stale-sandbox", slug: "stale-slug" });

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
