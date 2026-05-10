import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const fetchActiveUserSessionsForUser = vi.fn();
const revokeUserSessionForUser = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));

vi.mock("@/features/account/server", () => ({
  fetchActiveUserSessionsForUser: (userId: string) =>
    fetchActiveUserSessionsForUser(userId),
  revokeUserSessionForUser: (userId: string, refreshTokenHash: string) =>
    revokeUserSessionForUser(userId, refreshTokenHash),
}));

import { DELETE, GET } from "./route";

describe("/api/account/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "user-id" },
    });
    fetchActiveUserSessionsForUser.mockResolvedValue([]);
    revokeUserSessionForUser.mockResolvedValue(undefined);
  });

  it("loads only active sessions for the signed-in user", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/account/sessions"),
    );

    expect(response.status).toBe(200);
    expect(fetchActiveUserSessionsForUser).toHaveBeenCalledWith("user-id");
    await expect(response.json()).resolves.toEqual({ sessions: [] });
  });

  it("rejects unauthenticated session reads", async () => {
    requireAuthenticatedUser.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/account/sessions"),
    );

    expect(response.status).toBe(401);
    expect(fetchActiveUserSessionsForUser).not.toHaveBeenCalled();
  });

  it("revokes only sessions owned by the signed-in user", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "hash" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(revokeUserSessionForUser).toHaveBeenCalledWith("user-id", "hash");
  });
});
