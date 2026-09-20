import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const select = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({ select }),
  }),
}));

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET } from "./route";

const ORG_ID = "22222222-2222-4222-8222-222222222222";

describe("GET /api/gridmaster/invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({ user: { id: "gm-1" } });
    select.mockReturnValue({
      eq: () => ({
        order: async () => ({
          data: [{ id: "inv-1", org_id: ORG_ID, email: "a@example.com" }],
          error: null,
        }),
      }),
    });
  });

  it("rejects non-gridmaster sessions", async () => {
    requireGridmasterSession.mockResolvedValue({
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    });
    const response = await GET(
      new NextRequest(`http://localhost/api/gridmaster/invitations?orgId=${ORG_ID}`),
    );
    expect(response.status).toBe(403);
    expect(select).not.toHaveBeenCalled();
  });

  it("lists invitations without their tokens", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/gridmaster/invitations?orgId=${ORG_ID}`),
    );
    expect(response.status).toBe(200);
    const columns = select.mock.calls[0][0] as string;
    expect(columns.split(",").map((c) => c.trim())).not.toContain("token");
    expect(columns).toContain("email");
  });
});
