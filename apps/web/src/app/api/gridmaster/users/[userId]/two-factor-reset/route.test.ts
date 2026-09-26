import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const loadPersonTarget = vi.fn();
const resetPersonTwoFactor = vi.fn();
const scheduleTwoFactorResetNotice = vi.fn();
const writeAudit = vi.fn();
const serviceClient = { service: true };

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => serviceClient }));
vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLogAfterCommit: (input: unknown) => writeAudit(input),
}));
vi.mock("@/app/api/gridmaster/_lib/two-factor-reset-notice", () => ({
  scheduleTwoFactorResetNotice: (to: string) => scheduleTwoFactorResetNotice(to),
}));
vi.mock("@/features/gridmaster/server/person-target", () => ({
  loadPersonTarget: (...args: unknown[]) => loadPersonTarget(...args),
}));
vi.mock("@/features/gridmaster/server/two-factor-reset", () => ({
  resetPersonTwoFactor: (...args: unknown[]) => resetPersonTwoFactor(...args),
}));

import { POST } from "./route";

const USER = "11111111-1111-4111-8111-111111111111";

function post(body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/gridmaster/users/${USER}/two-factor-reset`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ userId: USER }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireGridmasterSession.mockResolvedValue({ user: { id: "gm", email: "gm@dubgrid.com" } });
  requireSensitiveActionAuth.mockResolvedValue({ user: { id: "gm" }, sessionId: "s" });
  loadPersonTarget.mockResolvedValue({ userId: USER, email: "ada@example.com" });
  resetPersonTwoFactor.mockResolvedValue({ factorsRemoved: 1 });
  writeAudit.mockResolvedValue(undefined);
});

describe("POST /api/gridmaster/users/[userId]/two-factor-reset", () => {
  it("needs a reason", async () => {
    expect((await post({ reason: "   " })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(resetPersonTwoFactor).not.toHaveBeenCalled();
  });

  it("changes nothing on a stale session", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });
    expect((await post({ reason: "Lost phone" })).status).toBe(403);
    expect(resetPersonTwoFactor).not.toHaveBeenCalled();
  });

  it("refuses a Gridmaster target", async () => {
    loadPersonTarget.mockResolvedValueOnce(null);
    expect((await post({ reason: "Lost phone" })).status).toBe(404);
    expect(resetPersonTwoFactor).not.toHaveBeenCalled();
  });

  it("resets, emails the person and records the reason", async () => {
    const response = await post({ reason: " Lost phone, verified by call " });
    expect(response.status).toBe(200);
    expect(resetPersonTwoFactor).toHaveBeenCalledWith(serviceClient, USER);
    expect(scheduleTwoFactorResetNotice).toHaveBeenCalledWith("ada@example.com");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.mfa_reset",
        resourceId: USER,
        details: { targetUserId: USER, reason: "Lost phone, verified by call", factorsRemoved: 1 },
      }),
    );
  });

  it("sends nothing and records nothing when the reset fails", async () => {
    resetPersonTwoFactor.mockRejectedValueOnce(new Error("auth down"));
    const response = await post({ reason: "Lost phone" });
    expect(response.status).toBe(500);
    expect(scheduleTwoFactorResetNotice).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });
});
