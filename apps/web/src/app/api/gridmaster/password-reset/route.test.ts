import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const resetPasswordForEmail = vi.fn();
const generateLink = vi.fn();
const writeGridmasterAuditLog = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createAnonClient: () => ({ auth: { resetPasswordForEmail } }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  passwordResetLimiter: { kind: "actor" },
  emailTargetLimiter: { kind: "target" },
  hashEmail: (value: string) => `hash:${value}`,
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ auth: { admin: { generateLink } } }),
}));

vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLog: (...args: unknown[]) => writeGridmasterAuditLog(...args),
}));

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new NextRequest("https://gridmaster.dubgrid.app/api/gridmaster/password-reset", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/gridmaster/password-reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({ user: { id: "gm-1" } });
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    resetPasswordForEmail.mockResolvedValue({ error: null });
    writeGridmasterAuditLog.mockResolvedValue(undefined);
  });

  it("sends the recovery email and only then records the audit row", async () => {
    const response = await POST(makeRequest({ email: "user@example.com" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "https://gridmaster.dubgrid.app/reset-password",
    });
    expect(generateLink).not.toHaveBeenCalled();
    expect(writeGridmasterAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.password_reset_sent",
        details: { target_email: "user@example.com" },
      }),
    );
  });

  it("reports failure and writes no audit row when the send fails", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: "smtp down", status: 500 } });

    const response = await POST(makeRequest({ email: "user@example.com" }));

    expect(response.status).toBe(500);
    expect(writeGridmasterAuditLog).not.toHaveBeenCalled();
  });

  it("caps sends per target address", async () => {
    checkRateLimit.mockImplementation(async (_limiter: unknown, key: string) => ({
      limited: key.startsWith("pwreset-email:"),
      misconfigured: false,
      reset: Date.now() + 30_000,
    }));

    const response = await POST(makeRequest({ email: "user@example.com" }));

    expect(response.status).toBe(429);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
