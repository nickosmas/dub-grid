import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const requestRpc = vi.fn();
const fetchLive = vi.fn();
const writeGridmasterAuditLog = vi.fn();
const scheduleImpersonationNotice = vi.fn();

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
  createRequestSupabaseClient: () => ({ rpc: requestRpc }),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/features/account/server", () => ({
  fetchLiveImpersonationSessionsForGridmaster: (id: string) => fetchLive(id),
}));
vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLog: (input: unknown) => writeGridmasterAuditLog(input),
}));
vi.mock("@/app/api/gridmaster/_lib/impersonation-notice", () => ({
  scheduleImpersonationNotice: (input: unknown) => scheduleImpersonationNotice(input),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { POST } from "./route";

const request = () =>
  new NextRequest("http://localhost/api/account/logout-cleanup", { method: "POST" });

describe("POST /api/account/logout-cleanup (F-35)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "gm-1", email: "gm@example.com" },
      claims: { platform_role: "gridmaster" },
    });
    fetchLive.mockResolvedValue([
      { session_id: "s-1", target_user_id: "u-1", target_org_id: "o-1" },
    ]);
    requestRpc.mockResolvedValue({ error: null });
  });

  it("ends a live session the way the portal does: ended, told and recorded", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("end_impersonation", {
      p_session_id: "s-1",
      p_reason: "manual",
    });
    expect(scheduleImpersonationNotice).toHaveBeenCalledWith({
      kind: "end",
      targetUserId: "u-1",
      targetOrgId: "o-1",
    });
    expect(writeGridmasterAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "impersonation.ended",
        resourceId: "s-1",
        orgId: "o-1",
        details: { reason: "manual", trigger: "sign_out" },
      }),
    );
  });

  it("does nothing for anyone but a Gridmaster", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "u-2" },
      claims: { platform_role: "none" },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(fetchLive).not.toHaveBeenCalled();
    expect(requestRpc).not.toHaveBeenCalled();
  });

  it("tells no one and records nothing when the end fails", async () => {
    requestRpc.mockResolvedValue({ error: new Error("db down") });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(scheduleImpersonationNotice).not.toHaveBeenCalled();
    expect(writeGridmasterAuditLog).not.toHaveBeenCalled();
  });
});
