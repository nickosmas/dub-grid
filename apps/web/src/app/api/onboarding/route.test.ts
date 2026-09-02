import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: () => null,
}));

import { POST } from "./route";

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const EFFECTIVE_ORG_ID = "22222222-2222-4222-8222-222222222222";
const COMPLETED_AT = "2026-09-01T08:00:00.000Z";

function onboardingRequest() {
  return new NextRequest("http://localhost/api/onboarding", {
    method: "POST",
    body: JSON.stringify({ orgId: REQUESTED_ORG_ID }),
  });
}

describe("POST /api/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: null, error: null });
    maybeSingle.mockResolvedValue({
      data: { onboarding_completed_at: COMPLETED_AT },
      error: null,
    });
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "user-1" },
      orgId: EFFECTIVE_ORG_ID,
      userClient: { rpc },
      serviceClient: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle }),
            }),
          }),
        }),
      },
    });
  });

  it("writes and verifies completion for the effective organization", async () => {
    const response = await POST(onboardingRequest());

    expect(response.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.any(NextRequest),
      REQUESTED_ORG_ID,
      expect.any(Function),
      { allowDuringSetup: true, allowLockedOrganization: true },
    );
    expect(rpc).toHaveBeenCalledWith("complete_onboarding", {
      p_org_id: EFFECTIVE_ORG_ID,
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      completedAt: COMPLETED_AT,
    });
  });

  it("does not report success when the membership write cannot be verified", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(onboardingRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "We couldn't confirm setup was saved. Try again.",
    });
  });

  it("returns the authorization response without running the completion RPC", async () => {
    requireOrgPermissions.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(onboardingRequest());

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
