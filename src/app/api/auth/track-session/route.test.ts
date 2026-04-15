import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const upsert = vi.fn();
const from = vi.fn((table: string) => ({ table, upsert }));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) =>
    requireAuthenticatedUser(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => from(table),
  }),
}));

import { POST } from "@/app/api/auth/track-session/route";

describe("POST /api/auth/track-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "session-user" },
    });
    upsert.mockResolvedValue({ error: null });
  });

  it("rejects unauthenticated requests", async () => {
    const unauthenticated = NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    );
    requireAuthenticatedUser.mockResolvedValueOnce({
      response: unauthenticated,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        body: JSON.stringify({
          refreshTokenHash: "hash",
          deviceLabel: "Chrome on macOS",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("uses the authenticated session user id instead of caller-controlled identity", async () => {
    await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({
          userId: "forged-user",
          refreshTokenHash: "hash",
          deviceLabel: "Chrome on macOS",
        }),
      }),
    );

    expect(from).toHaveBeenCalledWith("user_sessions");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "session-user",
        refresh_token_hash: "hash",
        device_label: "Chrome on macOS",
      }),
      { onConflict: "refresh_token_hash" },
    );
  });

  it("returns the CSRF failure response before touching the database", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/auth/track-session", {
        method: "POST",
        body: JSON.stringify({
          refreshTokenHash: "hash",
          deviceLabel: "Chrome on macOS",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});
