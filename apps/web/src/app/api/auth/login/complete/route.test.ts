import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedSession = vi.fn();
const checkRateLimit = vi.fn();
const writeSecurityAuditEvent = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedSession: (req: NextRequest) => requireAuthenticatedSession(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/auth/security-audit", () => ({
  writeSecurityAuditEvent: (...args: unknown[]) => writeSecurityAuditEvent(...args),
}));

import { POST } from "./route";

function token(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.sig`;
}

const now = () => Math.floor(Date.now() / 1000);

function authWith(claims: Record<string, unknown>) {
  requireAuthenticatedSession.mockResolvedValue({
    user: { id: "user-1" },
    session: { access_token: token(claims) },
    sessionId: "session-1",
  });
}

function post() {
  return new NextRequest("http://localhost/api/auth/login/complete", { method: "POST" });
}

describe("POST /api/auth/login/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false, reset: 0 });
  });

  it("records a two-factor sign-in against the organization it ended in", async () => {
    authWith({ aal: "aal2", org_id: "org-2", amr: [{ method: "totp", timestamp: now() }] });

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(writeSecurityAuditEvent).toHaveBeenCalledWith({
      event: "security.auth.login",
      outcome: "succeeded",
      reason: "accepted",
      actorId: "user-1",
      orgId: "org-2",
      metadata: { surface: "web", method: "totp" },
    });
  });

  it("refuses a session without a freshly verified second factor", async () => {
    authWith({ aal: "aal2", org_id: "org-2", amr: [{ method: "totp", timestamp: now() - 7200 }] });

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses before authenticating when the origin check fails", async () => {
    validateCsrfOrigin.mockReturnValueOnce(NextResponse.json({}, { status: 403 }));

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(requireAuthenticatedSession).not.toHaveBeenCalled();
  });
});
