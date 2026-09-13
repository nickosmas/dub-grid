import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSensitiveActionAuth = vi.fn();
const validateCsrfOrigin = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

import { POST } from "./route";

function request() {
  return new NextRequest("http://localhost/api/account/credential-assurance", {
    method: "POST",
    headers: { authorization: "Bearer fresh-token" },
  });
}

describe("POST /api/account/credential-assurance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("accepts only after the canonical assurance boundary passes", async () => {
    const req = request();
    const response = await POST(req);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(requireSensitiveActionAuth).toHaveBeenCalledWith(req);
  });

  it("forwards the structured step-up denial without running a mutation", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json(
        {
          code: "STEP_UP_REQUIRED",
          method: "totp",
          error: "Confirm your identity, then try again.",
        },
        { status: 403 },
      ),
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "STEP_UP_REQUIRED",
      method: "totp",
      error: "Confirm your identity, then try again.",
    });
  });

  it("rejects invalid CSRF before checking assurance", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    expect((await POST(request())).status).toBe(403);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });
});
