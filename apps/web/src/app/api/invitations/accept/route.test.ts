import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const rpc = vi.fn();
const createRequestSupabaseClient = vi.fn();
const dispatchNotificationEvent = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (request: NextRequest) => requireAuthenticatedUser(request),
  createRequestSupabaseClient: (request: NextRequest) => createRequestSupabaseClient(request),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (request: NextRequest) => validateCsrfOrigin(request),
}));
vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/invitations/accept", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "accepted-user" } });
  createRequestSupabaseClient.mockReturnValue({ rpc });
  rpc.mockResolvedValue({
    data: {
      status: "accepted",
      org_id: "org-1",
      role: "user",
      org_slug: "calm-haven",
      invitation_id: "invite-1",
    },
    error: null,
  });
  dispatchNotificationEvent.mockResolvedValue({ success: true });
});

describe("POST /api/invitations/accept", () => {
  it("accepts a live invitation for the authenticated user and returns the RPC context", async () => {
    const res = await POST(request({ token: "invite-token" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "accepted",
      orgId: "org-1",
      role: "user",
      orgSlug: "calm-haven",
    });
    expect(rpc).toHaveBeenCalledWith("accept_invitation", { p_token: "invite-token" });
    expect(dispatchNotificationEvent).toHaveBeenCalledWith("accepted-user", {
      action: "invitation_accepted",
      orgId: "org-1",
      acceptedUserId: "accepted-user",
      invitationId: "invite-1",
    });
  });

  it("blocks unauthenticated callers before invoking the invitation RPC", async () => {
    requireAuthenticatedUser.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const res = await POST(request({ token: "invite-token" }));

    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("blocks a failed CSRF check before reading or accepting a token", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const res = await POST(request({ token: "invite-token" }));

    expect(res.status).toBe(403);
    expect(requireAuthenticatedUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a missing invitation token without invoking the RPC", async () => {
    const res = await POST(request({}));

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not emit an organization event when the RPC returns no organization", async () => {
    rpc.mockResolvedValueOnce({
      data: { status: "already_accepted", org_id: "", role: "user", org_slug: null },
      error: null,
    });

    const res = await POST(request({ token: "invite-token" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "already_accepted",
      orgId: "",
      role: "user",
      orgSlug: null,
    });
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });
});
