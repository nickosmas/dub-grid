import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const loadPersonTarget = vi.fn();
const resetPersonTwoFactor = vi.fn();
const scheduleTwoFactorResetNotice = vi.fn();
const writeAudit = vi.fn();
const validateCsrfOrigin = vi.fn();
const serviceClient = { service: true };

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => validateCsrfOrigin() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => serviceClient }));
vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLogAfterCommit: (input: unknown) => writeAudit(input),
}));
vi.mock("@/app/api/gridmaster/_lib/two-factor-reset-notice", () => ({
  scheduleTwoFactorResetNotice: (to: string, options?: unknown) =>
    scheduleTwoFactorResetNotice(to, options),
}));
vi.mock("@/features/gridmaster/server/person-target", () => ({
  loadPersonTarget: (...args: unknown[]) => loadPersonTarget(...args),
}));
vi.mock("@/features/gridmaster/server/two-factor-reset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gridmaster/server/two-factor-reset")>()),
  resetPersonTwoFactor: (...args: unknown[]) => resetPersonTwoFactor(...args),
}));

import { PartialTwoFactorResetError } from "@/features/gridmaster/server/two-factor-reset";
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
  validateCsrfOrigin.mockReturnValue(null);
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
    expect(scheduleTwoFactorResetNotice).toHaveBeenCalledWith("ada@example.com", {
      partial: false,
    });
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

  it("records and announces a reset that stopped after removing a factor (F-90)", async () => {
    resetPersonTwoFactor.mockRejectedValueOnce(
      new PartialTwoFactorResetError(1, new Error("auth down")),
    );
    const response = await post({ reason: "Lost phone" });

    expect(response.status).toBe(500);
    expect(scheduleTwoFactorResetNotice).toHaveBeenCalledTimes(1);
    expect(scheduleTwoFactorResetNotice).toHaveBeenCalledWith("ada@example.com", {
      partial: true,
    });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.mfa_reset",
        details: expect.objectContaining({
          factorsRemoved: 1,
          partial: true,
          reason: "Lost phone",
        }),
      }),
    );
  });

  it("refuses a cross-origin request before anything else (F-95)", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Invalid origin" }, { status: 403 }),
    );
    expect((await post({ reason: "Lost phone" })).status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(resetPersonTwoFactor).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });
});
