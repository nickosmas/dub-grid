import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const requestRpc = vi.fn();
const serviceFrom = vi.fn();
const serviceAuthGetUserById = vi.fn();
const profilesSelect = vi.fn();
const profilesEq = vi.fn();
const auditInsert = vi.fn();

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
    auth: {
      admin: {
        getUserById: serviceAuthGetUserById,
      },
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

import { GET, POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/gridmaster/accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/gridmaster/accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    profilesSelect.mockReturnValue({ eq: profilesEq });
    profilesEq.mockResolvedValue({
      data: [
        {
          id: USER_ID,
          first_name: "Grid",
          last_name: "Master",
          created_at: "2026-05-01T15:00:00.000Z",
          deactivated_at: null,
          deactivated_by: null,
        },
      ],
      error: null,
    });
    serviceAuthGetUserById.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email: "gm-target@example.com",
          created_at: "2026-05-01T14:00:00.000Z",
          last_sign_in_at: null,
        },
      },
      error: null,
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return { select: profilesSelect };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects non-gridmaster sessions before loading accounts", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/gridmaster/accounts"));

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("loads gridmaster accounts from server-only profile and auth data", async () => {
    const response = await GET(new NextRequest("http://localhost/api/gridmaster/accounts"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accounts: [
        {
          id: USER_ID,
          email: "gm-target@example.com",
          firstName: "Grid",
          lastName: "Master",
          createdAt: "2026-05-01T15:00:00.000Z",
          lastSignInAt: null,
          deactivatedAt: null,
          deactivatedBy: null,
        },
      ],
    });
    expect(serviceFrom).toHaveBeenCalledWith("profiles");
    expect(profilesEq).toHaveBeenCalledWith("platform_role", "gridmaster");
    expect(serviceAuthGetUserById).toHaveBeenCalledWith(USER_ID);
    expect(requestRpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/gridmaster/accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    requestRpc.mockResolvedValue({
      data: { user_id: USER_ID, email: "gm-target@example.com" },
      error: null,
    });
    auditInsert.mockResolvedValue({ error: null });
    serviceFrom.mockImplementation((table: string) => {
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

    const response = await POST(
      makePostRequest({ action: "promote", email: "gm-target@example.com" }),
    );

    expect(response.status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(requestRpc).not.toHaveBeenCalled();
  });

  it("rejects non-gridmaster sessions before validation", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(
      makePostRequest({ action: "demote", userId: "bad", orgId: ORG_ID, orgRole: "user" }),
    );

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("promotes an existing auth user by email and writes audit", async () => {
    const response = await POST(
      makePostRequest({ action: "promote", email: "gm-target@example.com" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, userId: USER_ID });
    expect(requestRpc).toHaveBeenCalledWith("promote_gridmaster_by_email", {
      p_email: "gm-target@example.com",
    });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "gridmaster-user",
        action: "gridmaster_account.promoted",
        resource_type: "user",
        resource_id: USER_ID,
      }),
    );
  });

  it("demotes a gridmaster into a selected organization and role", async () => {
    const response = await POST(
      makePostRequest({
        action: "demote",
        userId: USER_ID,
        orgId: ORG_ID,
        orgRole: "admin",
      }),
    );

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("demote_gridmaster_account", {
      p_target_user_id: USER_ID,
      p_org_id: ORG_ID,
      p_org_role: "admin",
    });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        action: "gridmaster_account.demoted",
        resource_id: USER_ID,
      }),
    );
  });

  it("deactivates and reactivates through the guarded RPC", async () => {
    const response = await POST(
      makePostRequest({
        action: "setActivation",
        userId: USER_ID,
        deactivate: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("set_gridmaster_account_deactivated", {
      p_target_user_id: USER_ID,
      p_deactivate: true,
    });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "gridmaster_account.deactivated",
        resource_id: USER_ID,
      }),
    );
  });

  it("returns guard failures such as self-demotion or last-gridmaster errors", async () => {
    requestRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Cannot remove the last active gridmaster account" },
    });

    const response = await POST(
      makePostRequest({
        action: "demote",
        userId: USER_ID,
        orgId: ORG_ID,
        orgRole: "user",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot remove the last active gridmaster account",
    });
    expect(auditInsert).not.toHaveBeenCalled();
  });
});
