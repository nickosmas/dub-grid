import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class CalendarSubscriptionError extends Error {
    constructor(readonly code: "not_linked" | "already_active" | "not_active" | "conflict") {
      super(code);
    }
  }
  return {
    CalendarSubscriptionError,
    requireAuthenticatedUserWithClaims: vi.fn(),
    validateCsrfOrigin: vi.fn(),
    getCalendarSubscriptionStatus: vi.fn(),
    issueCalendarSubscription: vi.fn(),
    revokeCalendarSubscription: vi.fn(),
  };
});

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) =>
    mocks.requireAuthenticatedUserWithClaims(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => mocks.validateCsrfOrigin(req),
}));
vi.mock("@/features/account/server", () => ({
  CalendarSubscriptionError: mocks.CalendarSubscriptionError,
  getCalendarSubscriptionStatus: (...args: unknown[]) =>
    mocks.getCalendarSubscriptionStatus(...args),
  issueCalendarSubscription: (...args: unknown[]) => mocks.issueCalendarSubscription(...args),
  revokeCalendarSubscription: (...args: unknown[]) => mocks.revokeCalendarSubscription(...args),
}));

import { DELETE, GET, POST, PUT } from "./route";

function request(method = "GET") {
  return new NextRequest("https://calm.localhost/api/account/calendar-subscription", { method });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthenticatedUserWithClaims.mockResolvedValue({
    user: { id: "user-1" },
    claims: { org_id: "org-1" },
  });
  mocks.validateCsrfOrigin.mockReturnValue(null);
  mocks.getCalendarSubscriptionStatus.mockResolvedValue({ active: false, issuedAt: null });
  mocks.issueCalendarSubscription.mockResolvedValue({
    rawToken: "A".repeat(43),
    issuedAt: "2026-09-01T00:00:00.000Z",
  });
  mocks.revokeCalendarSubscription.mockResolvedValue(undefined);
});

describe("/api/account/calendar-subscription", () => {
  it("loads status for the authenticated user's effective organization without token disclosure", async () => {
    mocks.getCalendarSubscriptionStatus.mockResolvedValue({
      active: true,
      issuedAt: "2026-09-01T00:00:00.000Z",
      token_hash: "must-not-leak",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(mocks.getCalendarSubscriptionStatus).toHaveBeenCalledWith("user-1", "org-1");
    expect(body).toEqual({
      active: true,
      issuedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(body).not.toHaveProperty("token_hash");
  });

  it("returns the raw token only inside the newly issued feed URL", async () => {
    const response = await POST(request("POST"));
    const body = await response.json();

    expect(mocks.issueCalendarSubscription).toHaveBeenCalledWith("user-1", "org-1", "create");
    expect(body).toEqual({
      active: true,
      issuedAt: "2026-09-01T00:00:00.000Z",
      feedUrl: `https://calm.localhost/api/calendar/feed/${"A".repeat(43)}`,
    });
    expect(body).not.toHaveProperty("rawToken");
  });

  it("uses an explicit rotate operation and never creates a second scope", async () => {
    const response = await PUT(request("PUT"));

    expect(response.status).toBe(200);
    expect(mocks.issueCalendarSubscription).toHaveBeenCalledWith("user-1", "org-1", "rotate");
  });

  it("revokes the signed-in user's scoped subscription", async () => {
    const response = await DELETE(request("DELETE"));

    expect(response.status).toBe(200);
    expect(mocks.revokeCalendarSubscription).toHaveBeenCalledWith("user-1", "org-1");
    await expect(response.json()).resolves.toEqual({ active: false, issuedAt: null });
  });

  it("checks CSRF before every mutation", async () => {
    mocks.validateCsrfOrigin.mockReturnValue(
      NextResponse.json({ error: "Invalid origin" }, { status: 403 }),
    );

    expect((await POST(request("POST"))).status).toBe(403);
    expect((await PUT(request("PUT"))).status).toBe(403);
    expect((await DELETE(request("DELETE"))).status).toBe(403);
    expect(mocks.issueCalendarSubscription).not.toHaveBeenCalled();
    expect(mocks.revokeCalendarSubscription).not.toHaveBeenCalled();
  });

  it("does not reveal whether a missing link is an employee, membership, or organization", async () => {
    mocks.getCalendarSubscriptionStatus.mockRejectedValue(
      new mocks.CalendarSubscriptionError("not_linked"),
    );

    const response = await GET(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No active scheduled profile was found.",
    });
  });
});
