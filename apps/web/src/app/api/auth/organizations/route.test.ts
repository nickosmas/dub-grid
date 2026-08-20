import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedSession = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedSession: (req: NextRequest) => requireAuthenticatedSession(req),
  createRequestSupabaseClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));

const TARGET_ORG = "44444444-4444-4444-4444-444444444444";

function makeRequest(body: unknown, opts?: { sandboxCookie?: boolean }): NextRequest {
  return new NextRequest("https://app.test/api/auth/organizations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: opts?.sandboxCookie ? { cookie: "dubgrid-sandbox=still-set" } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  requireAuthenticatedSession.mockResolvedValue({ user: { id: "user-1" } });
  rpc.mockResolvedValue({ error: null });
});

describe("POST /api/auth/organizations", () => {
  it("switches to the requested organization", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ targetOrgId: TARGET_ORG }));

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("switch_org", { target_org_id: TARGET_ORG });
  });

  // A sandbox must not outlive the switch. While its cookie is set, the auth
  // layer rewrites org_id to the sandbox clone and widens org_role to
  // super_admin on every request — so a surviving cookie means the user
  // "switches to org B" and then goes on reading and writing a clone of org A,
  // at an elevated role, for the cookie's week-long lifetime. The client used
  // to handle this with a fire-and-forget exitSandbox() that the immediately
  // following hard navigation routinely aborted.
  it("clears the sandbox cookie so the switch cannot land inside the previous org's clone", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ targetOrgId: TARGET_ORG }, { sandboxCookie: true }));

    expect(res.status).toBe(200);
    const cleared = res.cookies.get("dubgrid-sandbox");
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  });

  it("does not clear the cookie when the switch itself failed", async () => {
    rpc.mockResolvedValue({ error: { message: "Not a member of this organization" } });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ targetOrgId: TARGET_ORG }, { sandboxCookie: true }));

    expect(res.status).toBe(400);
    expect(res.cookies.get("dubgrid-sandbox")).toBeUndefined();
  });

  it("rejects a non-uuid target", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ targetOrgId: "not-a-uuid" }));

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
