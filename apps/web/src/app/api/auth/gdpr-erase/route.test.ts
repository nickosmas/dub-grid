import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const getServiceClient = vi.fn();
const canManageProfileChangeRequests = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/features/account/server", () => ({
  canManageProfileChangeRequests: (...args: unknown[]) => canManageProfileChangeRequests(...args),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

describe("POST /api/auth/gdpr-erase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    forbidIfSandboxCookie.mockReturnValue(null);
  });

  it("returns STEP_UP_REQUIRED before reading or erasing personal data", async () => {
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json(
        { error: "Confirm your identity.", code: "STEP_UP_REQUIRED", method: "totp" },
        { status: 403 },
      ),
    });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("https://app.test/api/auth/gdpr-erase", {
        method: "POST",
        body: JSON.stringify({ confirmation: "ERASE MY DATA" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "STEP_UP_REQUIRED" });
    expect(getServiceClient).not.toHaveBeenCalled();
    expect(canManageProfileChangeRequests).not.toHaveBeenCalled();
  });
});
