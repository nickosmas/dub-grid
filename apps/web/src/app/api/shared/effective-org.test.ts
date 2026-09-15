import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (...args: unknown[]) => requireAuthenticatedUser(...args),
  createRequestSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

import { resolveEffectiveOrgId } from "./permissions";
import { encodeSandboxCookieValue, SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const SANDBOX_ORG_ID = "33333333-3333-4333-8333-333333333333";
const REAL_ORG_ID = "44444444-4444-4444-8444-444444444444";

function request(cookieSessionId = AUTH_SESSION_ID) {
  const value = encodeSandboxCookieValue({
    sandboxOrgId: SANDBOX_ORG_ID,
    userId: USER_ID,
    sessionId: cookieSessionId,
  });
  return new NextRequest("http://localhost/api/example", {
    headers: { cookie: `${SANDBOX_COOKIE_NAME}=${value}` },
  });
}

function query(data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

describe("resolveEffectiveOrgId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: USER_ID },
      sessionId: AUTH_SESSION_ID,
    });
  });

  it("uses a live sandbox owned by the verified auth session", async () => {
    const organizationQuery = query({ id: SANDBOX_ORG_ID });
    const profileQuery = query({ platform_role: null });
    serviceFrom.mockImplementation((table: string) =>
      table === "organizations" ? organizationQuery : profileQuery,
    );

    await expect(resolveEffectiveOrgId(request(), USER_ID, REAL_ORG_ID)).resolves.toBe(
      SANDBOX_ORG_ID,
    );
    expect(organizationQuery.eq).toHaveBeenCalledWith("sandbox_owner_session_id", AUTH_SESSION_ID);
  });

  it("rejects a cookie copied from another auth session before tenant access", async () => {
    await expect(
      resolveEffectiveOrgId(request("55555555-5555-4555-8555-555555555555"), USER_ID, REAL_ORG_ID),
    ).rejects.toThrow("Invalid Test Sandbox session state");
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("rejects stale server-side sandbox state instead of falling back to the real tenant", async () => {
    serviceFrom.mockImplementation((table: string) =>
      table === "organizations" ? query(null) : query({ platform_role: null }),
    );
    await expect(resolveEffectiveOrgId(request(), USER_ID, REAL_ORG_ID)).rejects.toThrow(
      "Invalid Test Sandbox ownership state",
    );
  });
});
