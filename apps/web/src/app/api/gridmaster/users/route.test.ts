import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const requestRpc = vi.fn();
const serviceFrom = vi.fn();
const serviceRpc = vi.fn();
const profileUpdate = vi.fn();
const profileEq = vi.fn();
const auditInsert = vi.fn();
const userSessionsIn = vi.fn();
const mobileTokensIn = vi.fn();
const membershipsIn = vi.fn();
const forceLogoutOrder = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({
    rpc: requestRpc,
  }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
    rpc: serviceRpc,
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

import { GET, PATCH } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function makePatchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/gridmaster/users", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("GET /api/gridmaster/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    requestRpc.mockResolvedValue({
      data: [
        {
          id: USER_ID,
          email: "user@example.com",
          platform_role: "none",
          org_role: "admin",
          org_id: ORG_ID,
          org_name: "Arden Wood",
          org_slug: "arden-wood",
          created_at: "2026-05-01T15:00:00.000Z",
          last_sign_in_at: null,
          deactivated_at: null,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          email: "gm-target@example.com",
          platform_role: "gridmaster",
          org_role: null,
          org_id: null,
          org_name: null,
          org_slug: null,
          created_at: "2026-05-01T16:00:00.000Z",
          last_sign_in_at: null,
          deactivated_at: null,
        },
      ],
      error: null,
    });
    userSessionsIn.mockResolvedValue({
      data: [{ user_id: USER_ID, last_active_at: new Date().toISOString() }],
      error: null,
    });
    mobileTokensIn.mockResolvedValue({
      data: [{ user_id: USER_ID, disabled_at: null }],
      error: null,
    });
    membershipsIn.mockResolvedValue({
      data: [{ user_id: USER_ID, archived_at: null }],
      error: null,
    });
    forceLogoutOrder.mockResolvedValue({
      data: [{ resource_id: USER_ID, created_at: "2026-05-01T17:00:00.000Z" }],
      error: null,
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "user_sessions") {
        return { select: () => ({ in: userSessionsIn }) };
      }
      if (table === "mobile_device_tokens") {
        return { select: () => ({ in: mobileTokensIn }) };
      }
      if (table === "organization_memberships") {
        return { select: () => ({ in: membershipsIn }) };
      }
      if (table === "audit_log") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: forceLogoutOrder,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects non-gridmaster sessions before loading users", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/gridmaster/users"));

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("loads users with the authenticated request client", async () => {
    const response = await GET(new NextRequest("http://localhost/api/gridmaster/users"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      users: [
        {
          id: USER_ID,
          email: "user@example.com",
          firstName: null,
          lastName: null,
          platformRole: "none",
          orgRole: "admin",
          orgId: ORG_ID,
          orgName: "Arden Wood",
          orgSlug: "arden-wood",
          createdAt: "2026-05-01T15:00:00.000Z",
          lastSignInAt: null,
          deactivatedAt: null,
          membershipCount: 1,
          activeSessionCount: 1,
          mobileDeviceCount: 1,
          lastForceLogoutAt: "2026-05-01T17:00:00.000Z",
        },
      ],
    });
    expect(requestRpc).toHaveBeenCalledWith("get_all_users_with_profiles");
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("filters gridmaster accounts out of the organization-user response", async () => {
    const response = await GET(new NextRequest("http://localhost/api/gridmaster/users"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].email).toBe("user@example.com");
    expect(body.users).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ platformRole: "gridmaster" })]),
    );
  });
});

describe("PATCH /api/gridmaster/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    profileEq.mockResolvedValue({ error: null });
    profileUpdate.mockReturnValue({ eq: profileEq });
    auditInsert.mockResolvedValue({ error: null });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return { update: profileUpdate };
      }
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects CSRF failures before gridmaster auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await PATCH(
      makePatchRequest({ userId: USER_ID, orgId: ORG_ID, deactivate: true }),
    );

    expect(response.status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("rejects non-gridmaster sessions before validation", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await PATCH(
      makePatchRequest({ userId: "not-a-uuid", orgId: ORG_ID, deactivate: true }),
    );

    expect(response.status).toBe(403);
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("validates input before mutating", async () => {
    const response = await PATCH(
      makePatchRequest({ userId: "not-a-uuid", orgId: ORG_ID, deactivate: true }),
    );

    expect(response.status).toBe(400);
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("updates activation state and writes a platform audit event", async () => {
    const response = await PATCH(
      makePatchRequest({ userId: USER_ID, orgId: ORG_ID, deactivate: true }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(profileUpdate).toHaveBeenCalledWith({
      deactivated_at: expect.any(String),
      deactivated_by: "gridmaster-user",
    });
    expect(profileEq).toHaveBeenCalledWith("id", USER_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "gridmaster-user",
        actor_email: "gm@example.com",
        action: "user.deactivated",
        resource_type: "user",
        resource_id: USER_ID,
        details: expect.objectContaining({
          initiated_by: "gridmaster",
          targetUserId: USER_ID,
        }),
      }),
    );
  });
});
