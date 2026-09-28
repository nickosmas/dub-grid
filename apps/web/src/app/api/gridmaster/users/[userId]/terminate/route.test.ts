import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const validateCsrfOrigin = vi.fn();
const requestRpc = vi.fn();
const auditInsert = vi.fn();
const endUserSessions = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: requestRpc,
    from: (table: string) => (table === "audit_log" ? { insert: auditInsert } : {}),
  }),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/auth/revocation", () => ({
  endUserSessions: (userId: string) => endUserSessions(userId),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const gridmaster = { user: { id: "gridmaster-user", email: "gm@example.com" } };

function makeRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/gridmaster/users/${USER_ID}/terminate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  return POST(makeRequest(body), { params: Promise.resolve({ userId: USER_ID }) });
}

describe("POST /api/gridmaster/users/[userId]/terminate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue(gridmaster);
    requireSensitiveActionAuth.mockResolvedValue({
      ...gridmaster,
      claims: { platform_role: "gridmaster" },
    });
    requestRpc.mockResolvedValue({
      data: { user_id: USER_ID, memberships_archived: 2, employees_removed: 1 },
      error: null,
    });
    auditInsert.mockResolvedValue({ error: null });
    endUserSessions.mockResolvedValue(undefined);
  });

  it("terminates through the RPC, revokes every session, and audits the reason", async () => {
    const response = await call({ reason: "Repeated policy violations" });

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("terminate_user_account", {
      p_actor_id: "gridmaster-user",
      p_target_user_id: USER_ID,
      p_reason: "Repeated policy violations",
    });
    expect(endUserSessions).toHaveBeenCalledWith(USER_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.terminated",
        resource_type: "user",
        resource_id: USER_ID,
        details: expect.objectContaining({
          reason: "Repeated policy violations",
          memberships_archived: 2,
          employees_removed: 1,
          sessionsEnded: true,
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual({ success: true, sessionsEnded: true });
  });

  it("still audits the termination when its sessions cannot be ended (F-101)", async () => {
    endUserSessions.mockRejectedValue(new Error("redis unavailable"));

    const response = await call({ reason: "Repeated policy violations" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, sessionsEnded: false });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.terminated",
        resource_id: USER_ID,
        details: expect.objectContaining({
          reason: "Repeated policy violations",
          sessionsEnded: false,
        }),
      }),
    );
  });

  it("answers 500 when the audit row itself cannot be written", async () => {
    auditInsert.mockResolvedValue({ error: { message: "insert failed" } });

    const response = await call({ reason: "x" });

    expect(response.status).toBe(500);
    expect(endUserSessions).toHaveBeenCalledWith(USER_ID);
  });

  it("requires a reason", async () => {
    const response = await call({ reason: "   " });

    expect(response.status).toBe(400);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(endUserSessions).not.toHaveBeenCalled();
  });

  it("requires fresh sensitive-action assurance", async () => {
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json({ error: "step up" }, { status: 403 }),
    });

    const response = await call({ reason: "x" });

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's refusal without revoking anything", async () => {
    requestRpc.mockResolvedValue({
      data: null,
      error: { message: "Gridmaster accounts are managed from Gridmaster Accounts" },
    });

    const response = await call({ reason: "x" });

    expect(response.status).toBe(400);
    expect(endUserSessions).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });
});
