import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requestRpc = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({
    rpc: requestRpc,
  }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(url = "http://localhost/api/gridmaster/audit-log") {
  return new NextRequest(url);
}

describe("GET /api/gridmaster/audit-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    requestRpc.mockResolvedValue({
      data: [
        {
          id: "1",
          target_user_id: TARGET_USER_ID,
          target_email: "user@example.com",
          changed_by_id: "gridmaster-user",
          changed_by_email: "gm@example.com",
          from_role: "user",
          to_role: "admin",
          created_at: "2026-05-01T15:00:00.000Z",
          org_id: ORG_ID,
          org_name: "Arden Wood",
        },
      ],
      error: null,
    });
  });

  it("rejects non-gridmaster sessions before loading audit entries", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
  });

  it("loads audit entries with the authenticated request client", async () => {
    const response = await GET(
      makeRequest(`http://localhost/api/gridmaster/audit-log?orgId=${ORG_ID}&limit=25`),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entries: [
        {
          id: "1",
          targetUserId: TARGET_USER_ID,
          targetEmail: "user@example.com",
          changedById: "gridmaster-user",
          changedByEmail: "gm@example.com",
          fromRole: "user",
          toRole: "admin",
          createdAt: "2026-05-01T15:00:00.000Z",
          orgId: ORG_ID,
          orgName: "Arden Wood",
        },
      ],
    });
    expect(requestRpc).toHaveBeenCalledWith("get_audit_log", {
      p_org_id: ORG_ID,
      p_limit: 25,
      p_offset: 0,
    });
  });
});
