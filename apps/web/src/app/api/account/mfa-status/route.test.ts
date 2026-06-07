import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const updateSelfMfaStatus = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/features/account/server", () => ({
  updateSelfMfaStatus: (...args: unknown[]) => updateSelfMfaStatus(...args),
}));

import { POST } from "./route";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/mfa-status", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "user-1" } });
  validateCsrfOrigin.mockReturnValue(null);
  updateSelfMfaStatus.mockResolvedValue({ mfaEnabled: true });
});

describe("POST /api/account/mfa-status", () => {
  it("enables MFA for the authenticated user", async () => {
    const res = await POST(post({ enabled: true }));
    expect(res.status).toBe(200);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith("user-1", true);
  });

  it("disables MFA for the authenticated user", async () => {
    updateSelfMfaStatus.mockResolvedValueOnce({ mfaEnabled: false });
    const res = await POST(post({ enabled: false }));
    expect(res.status).toBe(200);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith("user-1", false);
  });

  it("rejects a non-boolean enabled value with 400", async () => {
    const res = await POST(post({ enabled: "yes" }));
    expect(res.status).toBe(400);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
  });

  it("rejects a missing enabled field with 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
  });

  it("blocks unauthenticated callers", async () => {
    requireAuthenticatedUser.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });
    const res = await POST(post({ enabled: true }));
    expect(res.status).toBe(401);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
  });

  it("rejects invalid CSRF", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(post({ enabled: true }));
    expect(res.status).toBe(403);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
  });
});
