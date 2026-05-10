import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requestRpc = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({
    rpc: requestRpc,
  }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
  }),
}));

import { GET } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function makeServiceBuilder(
  table: string,
  rows: Record<string, unknown>[],
) {
  if (table === "user_sessions") {
    return {
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: rows, error: null }),
      })),
    };
  }
  if (table === "organization_memberships") {
    return {
      select: vi.fn(() => ({
        is: vi.fn().mockResolvedValue({ data: rows, error: null }),
      })),
    };
  }
  return {
    select: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

describe("GET /api/gridmaster/security/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user" },
      session: { access_token: "token" },
    });
    requestRpc.mockImplementation((name: string) => {
      if (name === "get_all_users_with_profiles") {
        return Promise.resolve({
          data: [
            {
              id: USER_ID,
              email: "mina@example.com",
              platform_role: "none",
              org_role: "admin",
              org_id: ORG_ID,
              org_name: "Arden Wood",
              org_slug: "arden-wood",
            },
          ],
          error: null,
        });
      }
      if (name === "get_gridmaster_accounts") {
        return Promise.resolve({
          data: [
            {
              id: "99999999-9999-4999-8999-999999999999",
              email: "gridmaster@example.com",
              first_name: "Grid",
              last_name: "Master",
            },
          ],
          error: null,
        });
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "user_sessions") {
        return makeServiceBuilder(table, [
          {
            id: "33333333-3333-4333-8333-333333333333",
            user_id: USER_ID,
            org_id: ORG_ID,
            supabase_session_id: "44444444-4444-4444-8444-444444444444",
            platform: "ios",
            app_version: "1.0.0",
            device_label: "DubGrid Mobile on iOS",
            ip_address: "192.168.1.204",
            last_active_at: new Date().toISOString(),
            created_at: "2026-05-07T12:00:00.000Z",
            refresh_token_hash: "should-not-leak",
          },
        ]);
      }
      if (table === "organization_memberships") {
        return makeServiceBuilder(table, [
          {
            user_id: USER_ID,
            org_id: ORG_ID,
            org_role: "admin",
            archived_at: null,
          },
        ]);
      }
      if (table === "organizations") {
        return makeServiceBuilder(table, [
          {
            id: ORG_ID,
            name: "Arden Wood",
            slug: "arden-wood",
          },
        ]);
      }
      if (table === "profiles") {
        return makeServiceBuilder(table, [
          {
            id: USER_ID,
            first_name: "Mina",
            last_name: "Rivera",
          },
          {
            id: "99999999-9999-4999-8999-999999999999",
            first_name: "Grid",
            last_name: "Master",
          },
        ]);
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("requires a gridmaster session before reading all user sessions", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/gridmaster/security/sessions"),
    );

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("returns enriched all-user session rows without exposing revocation hashes", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/gridmaster/security/sessions"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("get_all_users_with_profiles");
    expect(payload.sessions).toHaveLength(1);
    expect(payload.gridmasterSessions).toEqual([]);
    expect(payload.sessions[0]).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      userId: USER_ID,
      userName: "Mina Rivera",
      userEmail: "mina@example.com",
      userPlatformRole: "none",
      org: {
        orgId: ORG_ID,
        orgName: "Arden Wood",
        orgSlug: "arden-wood",
        orgRole: "admin",
      },
      supabaseSessionId: "44444444-4444-4444-8444-444444444444",
      platform: "ios",
      deviceLabel: "DubGrid Mobile on iOS",
      ipAddress: "192.168.1.204",
      status: "active",
    });
    expect(payload.sessions[0]).not.toHaveProperty("refreshTokenHash");
  });

  it("enriches gridmaster-owned sessions as platform-wide", async () => {
    serviceFrom.mockImplementation((table: string) => {
      if (table === "user_sessions") {
        return makeServiceBuilder(table, [
          {
            id: "88888888-8888-4888-8888-888888888888",
            user_id: "99999999-9999-4999-8999-999999999999",
            org_id: null,
            supabase_session_id: "77777777-7777-4777-8777-777777777777",
            platform: "web",
            app_version: null,
            device_label: "Chrome on macOS",
            ip_address: "127.0.0.1",
            last_active_at: new Date().toISOString(),
            created_at: "2026-05-08T19:41:52.000Z",
          },
        ]);
      }
      if (table === "organization_memberships") {
        return makeServiceBuilder(table, []);
      }
      if (table === "organizations") {
        return makeServiceBuilder(table, []);
      }
      if (table === "profiles") {
        return makeServiceBuilder(table, []);
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET(
      new NextRequest("http://localhost/api/gridmaster/security/sessions"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("get_gridmaster_accounts");
    expect(payload.sessions).toEqual([]);
    expect(payload.gridmasterSessions).toHaveLength(1);
    expect(payload.gridmasterSessions[0]).toMatchObject({
      userId: "99999999-9999-4999-8999-999999999999",
      userName: "Grid Master",
      userEmail: "gridmaster@example.com",
      userPlatformRole: "gridmaster",
      org: null,
      platform: "web",
      deviceLabel: "Chrome on macOS",
    });
  });
});
