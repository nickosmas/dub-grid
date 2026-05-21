import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const syncCheckoutSessionToDb = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/lib/stripe", () => ({
  syncCheckoutSessionToDb: (...args: unknown[]) =>
    syncCheckoutSessionToDb(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/stripe/checkout-complete", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/checkout-complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "user-1", email: "owner@example.com" },
      permissions: { isGridmaster: false, isSuperAdmin: true },
      serviceClient: { from: vi.fn() },
      userClient: { from: vi.fn() },
    });
    syncCheckoutSessionToDb.mockResolvedValue(undefined);
  });

  it("syncs a completed Checkout Session for super admins", async () => {
    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        sessionId: "cs_test_123",
      }),
    );

    expect(response.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.any(NextRequest),
      ORG_ID,
      expect.any(Function),
      { allowLockedOrganization: true },
    );
    const isAllowed = requireOrgPermissions.mock.calls[0][2];
    expect(isAllowed({ isGridmaster: false, isSuperAdmin: true })).toBe(true);
    expect(isAllowed({ isGridmaster: true, isSuperAdmin: false })).toBe(true);
    expect(isAllowed({ isGridmaster: false, isSuperAdmin: false })).toBe(false);
    expect(syncCheckoutSessionToDb).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      "cs_test_123",
      ORG_ID,
      {
        actor: {
          id: "user-1",
          email: "owner@example.com",
        },
      },
    );
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("does not sync when org permissions fail", async () => {
    requireOrgPermissions.mockResolvedValueOnce({
      response: NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      ),
    });

    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        sessionId: "cs_test_123",
      }),
    );

    expect(response.status).toBe(403);
    expect(syncCheckoutSessionToDb).not.toHaveBeenCalled();
  });

  it("rejects invalid input before permissions", async () => {
    const response = await POST(
      makeRequest({
        orgId: "not-an-org-id",
        sessionId: "",
      }),
    );

    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
    expect(syncCheckoutSessionToDb).not.toHaveBeenCalled();
  });
});
