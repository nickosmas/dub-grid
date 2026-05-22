import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedSession = vi.fn();
const rpc = vi.fn();
const createRequestSupabaseClient = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedSession: (req: NextRequest) =>
    requireAuthenticatedSession(req),
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
    requireAuthenticatedSession.mockResolvedValue({
      session: { access_token: "token" },
      user: { id: "user-1" },
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
    requireAuthenticatedSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const response = await POST(makeRequest({ orgId: ORG_ID }));

    expect(response.status).toBe(401);
    expect(createRequestSupabaseClient).not.toHaveBeenCalled();
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
