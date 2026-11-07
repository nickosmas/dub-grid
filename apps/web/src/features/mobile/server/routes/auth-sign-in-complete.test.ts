import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const checkRateLimit = vi.fn();
const writeSecurityAuditEvent = vi.fn();

vi.mock("../auth", () => ({ requireMobileAuth: (req: NextRequest) => requireMobileAuth(req) }));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/auth/security-audit", () => ({
  writeSecurityAuditEvent: (...args: unknown[]) => writeSecurityAuditEvent(...args),
}));

import { POST } from "./auth-sign-in-complete";

const now = () => Math.floor(Date.now() / 1000);

function post() {
  return new NextRequest("http://localhost/api/mobile/v1/auth/sign-in-complete", {
    method: "POST",
    headers: { authorization: "Bearer verified" },
  });
}

describe("POST mobile sign-in complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false, reset: 0 });
  });

  it("records a verified mobile two-factor sign-in", async () => {
    requireMobileAuth.mockResolvedValue({
      user: { id: "user-1" },
      currentOrg: { id: "org-1" },
      claims: { aal: "aal2", amr: [{ method: "totp", timestamp: now() }] },
    });

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(writeSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "succeeded",
        orgId: "org-1",
        metadata: { surface: "mobile", method: "totp" },
      }),
    );
  });

  it("starts a Super Admin's trial once the second factor is verified (F-227)", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    requireMobileAuth.mockResolvedValue({
      user: { id: "user-1" },
      currentOrg: { id: "org-1" },
      userClient: { rpc },
      claims: {
        org_role: "super_admin",
        aal: "aal2",
        amr: [{ method: "totp", timestamp: now() }],
      },
    });

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("start_trial_for_org", { p_org_id: "org-1" });
  });

  it("leaves the trial alone for anyone else", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    requireMobileAuth.mockResolvedValue({
      user: { id: "user-1" },
      currentOrg: { id: "org-1" },
      userClient: { rpc },
      claims: { org_role: "user", aal: "aal2", amr: [{ method: "totp", timestamp: now() }] },
    });

    await POST(post());

    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a session that has not just verified a second factor", async () => {
    requireMobileAuth.mockResolvedValue({
      user: { id: "user-1" },
      currentOrg: { id: "org-1" },
      claims: { aal: "aal1", amr: [{ method: "password", timestamp: now() }] },
    });

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });
});
