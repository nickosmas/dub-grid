import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const serviceFrom = vi.fn();
const profileSelect = vi.fn();
const profileEq = vi.fn();
const profileMaybeSingle = vi.fn();
const membershipsSelect = vi.fn();
const membershipsEq = vi.fn();
const membershipsIs = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
  }),
}));

import { GET } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new NextRequest(
    `http://localhost/api/gridmaster/users/${USER_ID}/memberships`,
  );
}

describe("GET /api/gridmaster/users/[userId]/memberships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    profileSelect.mockReturnValue({ eq: profileEq });
    profileEq.mockReturnValue({ maybeSingle: profileMaybeSingle });
    profileMaybeSingle.mockResolvedValue({
      data: { platform_role: "none" },
      error: null,
    });
    membershipsSelect.mockReturnValue({ eq: membershipsEq });
    membershipsEq.mockReturnValue({ is: membershipsIs });
    membershipsIs.mockResolvedValue({
      data: [
        {
          org_id: "22222222-2222-4222-8222-222222222222",
          org_role: "admin",
          joined_at: "2026-05-01T15:00:00.000Z",
          updated_at: "2026-05-01T15:00:00.000Z",
          admin_permissions: null,
          organizations: { name: "Arden Wood", slug: "arden-wood" },
        },
      ],
      error: null,
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "profiles") return { select: profileSelect };
      if (table === "organization_memberships") return { select: membershipsSelect };
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects non-gridmaster sessions before loading memberships", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("returns no memberships for gridmaster accounts", async () => {
    profileMaybeSingle.mockResolvedValueOnce({
      data: { platform_role: "gridmaster" },
      error: null,
    });

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ memberships: [] });
    expect(membershipsSelect).not.toHaveBeenCalled();
  });

  it("loads memberships for non-gridmaster organization users", async () => {
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      memberships: [
        {
          orgId: "22222222-2222-4222-8222-222222222222",
          orgName: "Arden Wood",
          orgSlug: "arden-wood",
          orgRole: "admin",
          joinedAt: "2026-05-01T15:00:00.000Z",
          updatedAt: "2026-05-01T15:00:00.000Z",
          adminPermissions: null,
        },
      ],
    });
  });
});
