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

  it("accepts an account with no factor and a token minted before the claim existed", async () => {
    mocks.verify.mockResolvedValue(verifiedWith({ mfa_enrolled: false, aal: "aal1" }));
    expect("response" in (await requireAuthenticatedSession(request()))).toBe(false);

    mocks.verify.mockResolvedValue(verifiedWith({ aal: "aal1" }));
    expect("response" in (await requireAuthenticatedSession(request()))).toBe(false);
  });

  it("does not take the claim from a caller-supplied string", async () => {
    mocks.verify.mockResolvedValue(verifiedWith({ mfa_enrolled: "true", aal: "aal1" }));
    expect("response" in (await requireAuthenticatedSession(request()))).toBe(false);
  });
});
