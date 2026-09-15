import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileSensitiveActionAuth = vi.fn();

vi.mock("../auth", () => ({
  requireMobileSensitiveActionAuth: (req: NextRequest) => requireMobileSensitiveActionAuth(req),
}));

import { POST } from "./credential-assurance";

function request() {
  return new NextRequest("http://localhost/api/mobile/v1/profile/credential-assurance", {
    method: "POST",
    headers: { authorization: "Bearer fresh-token" },
  });
}

describe("POST mobile credential assurance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileSensitiveActionAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns success only after canonical sensitive-action authorization passes", async () => {
    const req = request();
    const response = await POST(req);

    expect(requireMobileSensitiveActionAuth).toHaveBeenCalledWith(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("forwards the server-selected challenge without reaching a mutation", async () => {
    requireMobileSensitiveActionAuth.mockResolvedValueOnce({
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
});
