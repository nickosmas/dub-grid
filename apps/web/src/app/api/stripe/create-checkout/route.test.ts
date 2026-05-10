import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const serviceFrom = vi.fn();
const organizationSingle = vi.fn();
const organizationMembershipSelect = vi.fn();
const employeeSelect = vi.fn();
const superAdminMaybeSingle = vi.fn();
const seatCountIs = vi.fn();
const organizationUpdate = vi.fn();
const organizationUpdateEq = vi.fn();
const getUserById = vi.fn();
const createCheckoutSession = vi.fn();
const createStripeCustomer = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/lib/stripe", () => ({
  createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
  createStripeCustomer: (...args: unknown[]) => createStripeCustomer(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
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
  return new NextRequest("http://localhost/api/stripe/create-checkout", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/create-checkout", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    validateCsrfOrigin.mockReturnValue(null);
    organizationSingle.mockResolvedValue({
      data: {
        id: ORG_ID,
        name: "Acme Health",
        stripe_customer_id: "cus_123",
      },
      error: null,
    });
    superAdminMaybeSingle.mockResolvedValue({
      data: { user_id: "super-admin-user" },
      error: null,
    });
    seatCountIs.mockResolvedValue({
      data: [
        { id: 1, user_id: "linked-user" },
        { id: 2, user_id: null },
        { id: 3, user_id: null },
        { id: 4, user_id: null },
        { id: 5, user_id: null },
        { id: 6, user_id: null },
      ],
      error: null,
    });
    organizationMembershipSelect.mockImplementation((columns: string) => {
      if (columns === "user_id") {
        const is = vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: superAdminMaybeSingle,
          })),
        }));
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is,
            })),
            is: vi.fn(() =>
              Promise.resolve({
                data: [
                  { user_id: "linked-user" },
                  { user_id: "management-only-user" },
                ],
                error: null,
              }),
            ),
          })),
        };
      }
    });
    employeeSelect.mockReturnValue({
      eq: vi.fn(() => ({
        is: seatCountIs,
      })),
    });
    organizationUpdateEq.mockResolvedValue({ error: null });
    organizationUpdate.mockReturnValue({ eq: organizationUpdateEq });
    getUserById.mockResolvedValue({
      data: { user: { email: "owner@example.com" } },
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
          update: organizationUpdate,
        };
      }
      if (table === "organization_memberships") {
        return { select: organizationMembershipSelect };
      }
      if (table === "employees") {
        return { select: employeeSelect };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "user-1", email: "actor@example.com" },
      permissions: { isGridmaster: false, isSuperAdmin: true },
      serviceClient: {
        from: serviceFrom,
        auth: { admin: { getUserById } },
      },
      userClient: { from: vi.fn() },
    });
    createCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    });
    createStripeCustomer.mockResolvedValue({ id: "cus_created" });
    checkRateLimit.mockResolvedValue({ limited: false });
  });

  it("uses super-admin or gridmaster org permissions before checkout", async () => {
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
      { allowLockedWorkspace: true },
    );
    const isAllowed = requireOrgPermissions.mock.calls[0][2];
    expect(isAllowed({ isGridmaster: false, isSuperAdmin: true })).toBe(true);
    expect(isAllowed({ isGridmaster: true, isSuperAdmin: false })).toBe(true);
    expect(isAllowed({ isGridmaster: false, isSuperAdmin: false })).toBe(false);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      "cus_123",
      ORG_ID,
      7,
      "http://localhost:3000/settings?section=org-billing",
    );
  });

  it("does not create checkout when org permissions fail", async () => {
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
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rate limits checkout creation after permissions pass", async () => {
    checkRateLimit.mockResolvedValueOnce({
      limited: true,
      reset: Date.now() + 30_000,
    });

    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        returnUrl: "http://localhost:3000/settings?section=org-billing",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(createCheckoutSession).not.toHaveBeenCalled();
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
    expect(createCheckoutSession).not.toHaveBeenCalled();
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
    expect(createCheckoutSession).toHaveBeenCalledWith(
      "cus_123",
      ORG_ID,
      7,
      "http://localhost:3000/settings?section=org-billing",
    );
  });

  it("creates a Stripe customer with a real billing contact email and directory seat count", async () => {
    organizationSingle.mockResolvedValueOnce({
      data: {
        id: ORG_ID,
        name: "Acme Health",
        stripe_customer_id: null,
      },
      error: null,
    });

    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        returnUrl: "http://localhost:3000/settings?section=org-billing",
      }),
    );

    expect(response.status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith("super-admin-user");
    expect(createStripeCustomer).toHaveBeenCalledWith(
      ORG_ID,
      "Acme Health",
      "owner@example.com",
    );
    expect(organizationUpdate).toHaveBeenCalledWith({
      stripe_customer_id: "cus_created",
    });
    expect(createCheckoutSession).toHaveBeenCalledWith(
      "cus_created",
      ORG_ID,
      7,
      "http://localhost:3000/settings?section=org-billing",
    );
  });
});
