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
  isOrgSuperAdminOrGridmaster: (...args: unknown[]) => isOrgSuperAdminOrGridmaster(...args),
}));
vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));
vi.mock("@/lib/staff-validation", () => ({
  getStaffFieldErrors: () => ({}),
  buildStaffValidationErrorResponse: () => NextResponse.json({ error: "invalid" }, { status: 422 }),
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
    forbidIfSandboxCookie.mockReturnValue(NextResponse.json({ error: "sandbox" }, { status: 403 }));

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "admin" }));

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
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "admin" }));

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

  // Chainable stub for the refreshPendingInvitation update: .update().eq().ilike()
  // .is().is().gte().select().maybeSingle()
  function makeRefreshChain(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    for (const method of ["update", "eq", "ilike", "is", "gte", "select"]) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = async () => result;
    return chain;
  }

  it("refreshes an orphaned pending invite (from a failed first send) instead of 409", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An active invitation already exists for this email" },
    }));
    const from = vi.fn(() =>
      makeRefreshChain({
        data: { id: "inv-orphan", token: "fresh-tok", expires_at: "2026-02-02T00:00:00Z" },
        error: null,
      }),
    );
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "orphan@test.com", role: "admin" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      invitationId: "inv-orphan",
      token: "fresh-tok",
      expiresAt: "2026-02-02T00:00:00Z",
      resent: true,
    });
    expect(from).toHaveBeenCalledWith("invitations");
  });

  it("still 409s when the guard fires but no pending row can be refreshed", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An active invitation already exists for this email" },
    }));
    const from = vi.fn(() => makeRefreshChain({ data: null, error: null }));
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "gone@test.com", role: "admin" }));

    expect(res.status).toBe(409);
  });

  it("maps a genuine already-a-member RPC error to 409 without refreshing", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "User is already a member of this organization" },
    }));
    const from = vi.fn();
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "member@test.com", role: "admin" }));

    expect(res.status).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });
});
