import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const rpc = vi.fn();
const createRequestSupabaseClient = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
  createRequestSupabaseClient: () => createRequestSupabaseClient(),
}));

import { POST } from "@/app/api/auth/start-trial/route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/start-trial", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/start-trial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "user-1" },
      claims: { org_role: "super_admin", org_id: ORG_ID },
    });
    rpc.mockResolvedValue({ error: null });
    createRequestSupabaseClient.mockReturnValue({ rpc });
  });

  it("calls start_trial_for_org with the org id for an authenticated user", async () => {
    const response = await POST(makeRequest({ orgId: ORG_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("start_trial_for_org", {
      p_org_id: ORG_ID,
    });
  });

  it("rejects unauthenticated requests before calling the RPC", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const response = await POST(makeRequest({ orgId: ORG_ID }));

    expect(response.status).toBe(401);
    expect(createRequestSupabaseClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-super_admin claim before calling the RPC (B4)", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce({
      user: { id: "user-1" },
      claims: { org_role: "admin", org_id: ORG_ID },
    });

    const response = await POST(makeRequest({ orgId: ORG_ID }));

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects when the claim org doesn't match the requested org (B4)", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce({
      user: { id: "user-1" },
      claims: { org_role: "super_admin", org_id: "22222222-2222-4222-8222-222222222222" },
    });

    const response = await POST(makeRequest({ orgId: ORG_ID }));

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid org id before calling the RPC", async () => {
    const response = await POST(makeRequest({ orgId: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 400 when the RPC errors", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "boom" } });

    const response = await POST(makeRequest({ orgId: ORG_ID }));

    expect(response.status).toBe(400);
  });
});
