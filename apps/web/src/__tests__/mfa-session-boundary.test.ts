import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  revoked: vi.fn(),
}));

vi.mock("@/lib/auth/verify-token", () => ({
  verifyAccessToken: mocks.verify,
  extractBearerToken: (req: NextRequest) =>
    req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/auth/revocation", () => ({ isSessionRevoked: mocks.revoked }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

import {
  requireAuthenticatedSession,
  requireAuthenticatedUser,
  requireAuthenticatedUserWithClaims,
} from "@/lib/api-auth";

function request() {
  return new NextRequest("http://calmhaven.localhost/api/anything", {
    headers: { authorization: "Bearer token-under-test" },
  });
}

function verifiedWith(claims: Record<string, unknown>) {
  return {
    claims: {
      sub: "11111111-1111-4111-8111-111111111111",
      email: "member@dubgrid.test",
      ...claims,
    },
    sessionId: "session-1",
  };
}

describe("MFA challenge at the session boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revoked.mockResolvedValue(false);
  });

  it("refuses an enrolled session that never answered its challenge", async () => {
    mocks.verify.mockResolvedValue(verifiedWith({ mfa_enrolled: true, aal: "aal1" }));

    for (const entry of [
      requireAuthenticatedSession,
      requireAuthenticatedUser,
      requireAuthenticatedUserWithClaims,
    ]) {
      const result = await entry(request());
      expect("response" in result).toBe(true);
      const response = (result as { response: Response }).response;
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "STEP_UP_REQUIRED",
        method: "totp",
      });
    }
  });

  it("accepts the same account once it is at aal2", async () => {
    mocks.verify.mockResolvedValue(verifiedWith({ mfa_enrolled: true, aal: "aal2" }));
    const result = await requireAuthenticatedSession(request());
    expect("response" in result).toBe(false);
  });

  it("accepts an account the hook reported as having no factor", async () => {
    mocks.verify.mockResolvedValue(verifiedWith({ mfa_enrolled: false, aal: "aal1" }));
    expect("response" in (await requireAuthenticatedSession(request()))).toBe(false);
  });

  it("refuses a token with no claim as a stale session, not a step-up", async () => {
    // Finding F-01: this used to be accepted, which meant a hook that stopped
    // minting the claim silently disabled the gate. A challenge cannot supply
    // a claim the token never carried, so the answer is to sign in again.
    mocks.verify.mockResolvedValue(verifiedWith({ aal: "aal1" }));
    const result = await requireAuthenticatedSession(request());
    expect("response" in result).toBe(true);
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "This session is no longer valid. Sign in again.",
    });
  });

  it("refuses a claim of the wrong type rather than reading it as a boolean", async () => {
    mocks.verify.mockResolvedValue(verifiedWith({ mfa_enrolled: "true", aal: "aal1" }));
    expect("response" in (await requireAuthenticatedSession(request()))).toBe(true);

    mocks.verify.mockResolvedValue(verifiedWith({ mfa_enrolled: "false", aal: "aal1" }));
    expect("response" in (await requireAuthenticatedSession(request()))).toBe(true);
  });

  it("accepts a claimless token that already answered a challenge", async () => {
    mocks.verify.mockResolvedValue(verifiedWith({ aal: "aal2" }));
    expect("response" in (await requireAuthenticatedSession(request()))).toBe(false);
  });
});
