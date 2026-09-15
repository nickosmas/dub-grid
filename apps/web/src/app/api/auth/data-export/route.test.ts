import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const forbidIfSandboxCookie = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const getServiceClient = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

describe("GET /api/auth/data-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forbidIfSandboxCookie.mockReturnValue(null);
  });

  it("returns STEP_UP_REQUIRED before reading personal data when proof is stale", async () => {
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json(
        { error: "Confirm your identity.", code: "STEP_UP_REQUIRED", method: "password" },
        { status: 403 },
      ),
    });

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("https://app.test/api/auth/data-export"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "STEP_UP_REQUIRED" });
    expect(getServiceClient).not.toHaveBeenCalled();
  });
});
