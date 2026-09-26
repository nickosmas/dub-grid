import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireLiveAuthenticatedSession = vi.fn();
const checkRateLimit = vi.fn();
const writeSecurityAuditEvent = vi.fn();
const hasRecordedSignIn = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireLiveAuthenticatedSession: (req: NextRequest) => requireLiveAuthenticatedSession(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/auth/security-audit", () => ({
  writeSecurityAuditEvent: (...args: unknown[]) => writeSecurityAuditEvent(...args),
  hasRecordedSignIn: (...args: unknown[]) => hasRecordedSignIn(...args),
}));

import { hashSessionId } from "@/lib/auth/sign-in-completion";
import { POST } from "./route";

function token(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.sig`;
}

const now = () => Math.floor(Date.now() / 1000);
const verifiedFactor = { id: "factor-1", factor_type: "totp", status: "verified" };

function authWith(claims: Record<string, unknown>, factors: object[] = [verifiedFactor]) {
  requireLiveAuthenticatedSession.mockResolvedValue({
    user: { id: "user-1", factors },
    session: { access_token: token({ session_id: "session-1", ...claims }) },
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
    hasRecordedSignIn.mockResolvedValue(false);
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
      metadata: { surface: "web", method: "totp", sessionHash: hashSessionId("session-1") },
    });
  });

  // Repeated calls used to write one success row each (41c2).
  it("records nothing when this session's sign-in is already recorded", async () => {
    authWith({ aal: "aal2", org_id: "org-2", amr: [{ method: "totp", timestamp: now() }] });
    hasRecordedSignIn.mockResolvedValue(true);

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(hasRecordedSignIn).toHaveBeenCalledWith({
      actorId: "user-1",
      sessionHash: hashSessionId("session-1"),
    });
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it("records a fresh password sign-in on an account with no second factor", async () => {
    authWith({ aal: "aal1", org_id: "org-2", amr: [{ method: "password", timestamp: now() }] }, []);

    expect((await POST(post())).status).toBe(200);
    expect(writeSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ method: "password" }) }),
    );
  });

  it("refuses a password alone when the account has a second factor", async () => {
    authWith({ aal: "aal1", org_id: "org-2", amr: [{ method: "password", timestamp: now() }] });

    expect((await POST(post())).status).toBe(403);
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses a session without fresh proof", async () => {
    authWith({ aal: "aal2", org_id: "org-2", amr: [{ method: "totp", timestamp: now() - 7200 }] });

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses before authenticating when the origin check fails", async () => {
    validateCsrfOrigin.mockReturnValueOnce(NextResponse.json({}, { status: 403 }));

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(requireLiveAuthenticatedSession).not.toHaveBeenCalled();
  });
});
