import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const requireAuthenticatedUser = vi.fn();
const getServiceClient = vi.fn();
const canManageEmployees = vi.fn();
const isOrgSuperAdminOrGridmaster = vi.fn();
const dispatchNotificationEvent = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
  isOrgSuperAdminOrGridmaster: (...args: unknown[]) =>
    isOrgSuperAdminOrGridmaster(...args),
}));
vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));
vi.mock("@/lib/staff-validation", () => ({
  getStaffFieldErrors: () => ({}),
  buildStaffValidationErrorResponse: () =>
    NextResponse.json({ error: "invalid" }, { status: 422 }),
}));
vi.mock("@dubgrid/contracts", () => ({
  normalizeRequiredStaffEmail: (v: string) => v,
  normalizeStaffName: (v: string) => v,
  normalizeOptionalUsPhone: (v: string) => v,
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/organizations/invitations/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  forbidIfSandboxCookie.mockReturnValue(null);
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "actor-1" } });
  canManageEmployees.mockResolvedValue(true);
  isOrgSuperAdminOrGridmaster.mockResolvedValue(false);
});

describe("POST /api/organizations/invitations/create", () => {
  it("blocks invitation creation while in sandbox mode and never hits the RPC", async () => {
    forbidIfSandboxCookie.mockReturnValue(
      NextResponse.json({ error: "sandbox" }, { status: 403 }),
    );

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "admin" }),
    );

    expect(res.status).toBe(403);
    // Hard 403 before auth/service-client: no invitation is ever created.
    expect(requireAuthenticatedUser).not.toHaveBeenCalled();
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it("creates the invitation when not in sandbox mode", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        invitation_id: "inv-1",
        token: "tok-1",
        expires_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    }));
    getServiceClient.mockReturnValue({ rpc });

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "admin" }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      invitationId: "inv-1",
      token: "tok-1",
      expiresAt: "2026-01-01T00:00:00Z",
    });
    expect(rpc).toHaveBeenCalledWith(
      "send_invitation",
      expect.objectContaining({ p_org_id: ORG_ID }),
    );
  });

  it("rejects super_admin role when caller is not super_admin/gridmaster", async () => {
    const rpc = vi.fn();
    getServiceClient.mockReturnValue({ rpc });
    isOrgSuperAdminOrGridmaster.mockResolvedValue(false);

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "super_admin" }),
    );

    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows super_admin role when caller is super_admin or gridmaster", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        invitation_id: "inv-2",
        token: "tok-2",
        expires_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    }));
    getServiceClient.mockReturnValue({ rpc });
    isOrgSuperAdminOrGridmaster.mockResolvedValue(true);

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "super_admin" }),
    );

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "send_invitation",
      expect.objectContaining({ p_role: "super_admin", p_org_id: ORG_ID }),
    );
  });
});
