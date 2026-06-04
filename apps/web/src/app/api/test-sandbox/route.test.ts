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
  requireAuthenticatedUserWithClaims: (req: NextRequest) =>
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
}));

const USER_ID = "user-1";
const SOURCE_ORG = "11111111-1111-1111-1111-111111111111";

/** Service client stub: profiles returns the default org; memberships is configurable. */
function buildServiceClient(opts: { member: boolean }) {
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { org_id: SOURCE_ORG }, error: null }),
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
                    data: opts.member ? { id: "m-1" } : null,
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

function makeRequest(action: string): NextRequest {
  return new NextRequest("https://app.test/api/test-sandbox", {
    method: "POST",
    body: JSON.stringify({ action }),
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
    getServiceClient.mockReturnValue(buildServiceClient({ member: false }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(403);
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });

  it("clones and sets the sandbox cookie for an active member", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ member: true }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(200);
    expect(createSandboxForUser).toHaveBeenCalledWith(
      expect.objectContaining({ sourceOrgId: SOURCE_ORG }),
    );
    expect(res.cookies.get("dubgrid-sandbox")?.value).toBeTruthy();
  });

  it("rate-limits the expensive enter/reset clone path", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, reset: 1000, misconfigured: false });
    getServiceClient.mockReturnValue(buildServiceClient({ member: true }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("enter"));

    expect(res.status).toBe(429);
    expect(createSandboxForUser).not.toHaveBeenCalled();
  });

  it("does not throttle or membership-check exit", async () => {
    getServiceClient.mockReturnValue(buildServiceClient({ member: false }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest("exit"));

    expect(res.status).toBe(200);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(deleteSandboxForUser).toHaveBeenCalled();
  });
});
