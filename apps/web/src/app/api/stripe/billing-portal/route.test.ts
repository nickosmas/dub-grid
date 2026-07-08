import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const serviceFrom = vi.fn();
const organizationSingle = vi.fn();
const createBillingPortalSession = vi.fn();
const writeBillingPortalOpenedAuditLog = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/lib/stripe", () => ({
  createBillingPortalSession: (...args: unknown[]) => createBillingPortalSession(...args),
  writeBillingPortalOpenedAuditLog: (...args: unknown[]) =>
    writeBillingPortalOpenedAuditLog(...args),
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
const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/stripe/billing-portal", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/billing-portal", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    validateCsrfOrigin.mockReturnValue(null);
    organizationSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_123" },
      error: null,
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: organizationSingle,
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "user-1" },
      permissions: { isGridmaster: false, isSuperAdmin: true },
      serviceClient: { from: serviceFrom },
      userClient: { from: vi.fn() },
    });
    createBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.com/session",
    });
    writeBillingPortalOpenedAuditLog.mockResolvedValue(undefined);
  });

  it("uses super-admin or gridmaster org permissions before opening the portal", async () => {
    await POST(
      makeRequest({
        orgId: ORG_ID,
        returnUrl: "http://localhost:3000/settings?section=org-billing",
      }),
    );

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
    expect(createBillingPortalSession).toHaveBeenCalledWith(
      "cus_123",
      "http://localhost:3000/settings?section=org-billing",
    );
    expect(writeBillingPortalOpenedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      {
        orgId: ORG_ID,
        actor: {
          id: "user-1",
          email: undefined,
        },
      },
    );
  });

  it("does not open the portal when org permissions fail", async () => {
    requireOrgPermissions.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
    });

    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        returnUrl: "http://localhost:3000/settings?section=org-billing",
      }),
    );

    expect(response.status).toBe(403);
    expect(createBillingPortalSession).not.toHaveBeenCalled();
  });

  it("rejects return URLs outside the configured site origin", async () => {
    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        returnUrl: "https://evil.example/settings?section=org-billing",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid return URL" });
    expect(requireOrgPermissions).not.toHaveBeenCalled();
    expect(createBillingPortalSession).not.toHaveBeenCalled();
  });

  it("allows the CSRF-validated request origin when NEXT_PUBLIC_SITE_URL is missing locally", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";

    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        returnUrl: "http://localhost:3000/settings?section=org-billing",
      }),
    );

    expect(response.status).toBe(200);
    expect(createBillingPortalSession).toHaveBeenCalledWith(
      "cus_123",
      "http://localhost:3000/settings?section=org-billing",
    );
  });
});
