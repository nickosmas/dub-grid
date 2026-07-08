import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requestRpc = vi.fn();
const serviceFrom = vi.fn();
const serviceRpc = vi.fn();
let profilesCountQuery: ReturnType<typeof makeProfilesCountQuery>;

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({
    rpc: requestRpc,
  }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
    rpc: serviceRpc,
  }),
}));

vi.mock("@/lib/db/shared", () => ({
  ORGANIZATION_COLS: "id,name,slug,updated_at",
  ORGANIZATION_WITH_BILLING_COLS: "id,name,slug,updated_at,stripe_customer_id,subscription_seats",
}));

vi.mock("@/lib/db/mappers", () => ({
  rowToOrganization: (row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
  }),
}));

import { GET } from "./route";

function makeRequest() {
  return new NextRequest("http://localhost/api/gridmaster/dashboard");
}

function makeOrganizationsQuery(rows: Record<string, unknown>[]) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() =>
      Promise.resolve({
        data: rows,
        error: null,
      }),
    ),
  };
  return query;
}

function makeProfilesCountQuery(count: number) {
  const query = {
    select: vi.fn(() => query),
    neq: vi.fn(() =>
      Promise.resolve({
        count,
        error: null,
      }),
    ),
  };
  return query;
}

describe("GET /api/gridmaster/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireGridmasterSession.mockResolvedValue({
      session: { access_token: "token" },
      user: { id: "gridmaster-user", email: "gm@example.com" },
    });
    profilesCountQuery = makeProfilesCountQuery(2);
    serviceFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return makeOrganizationsQuery([
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Arden Wood",
            slug: "arden-wood",
          },
        ]);
      }
      if (table === "profiles") {
        return profilesCountQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    requestRpc.mockResolvedValue({
      data: [
        {
          org_id: "11111111-1111-4111-8111-111111111111",
          user_count: 3,
          employee_count: 9,
        },
      ],
      error: null,
    });
  });

  it("rejects non-gridmaster sessions before loading dashboard data", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
    expect(requestRpc).not.toHaveBeenCalled();
  });

  it("loads stats with the authenticated request client", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      organizations: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Arden Wood",
          slug: "arden-wood",
        },
      ],
      platformUserCount: 2,
      stats: [
        {
          orgId: "11111111-1111-4111-8111-111111111111",
          userCount: 3,
          employeeCount: 9,
        },
      ],
    });
    expect(serviceFrom).toHaveBeenCalledWith("organizations");
    expect(serviceFrom).toHaveBeenCalledWith("profiles");
    expect(requestRpc).toHaveBeenCalledWith("get_tenant_stats");
    expect(profilesCountQuery.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(profilesCountQuery.neq).toHaveBeenCalledWith("platform_role", "gridmaster");
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});
