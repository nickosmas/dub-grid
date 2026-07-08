import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const serviceFrom = vi.fn();
const organizationSingle = vi.fn();
const subscriptionMaybeSingle = vi.fn();
const employeeIs = vi.fn();
const membershipIs = vi.fn();
const auditLimit = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: vi.fn(),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ORIGINAL_STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_STRIPE_PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY;
const ORIGINAL_STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function makeRequest(orgId = ORG_ID) {
  return new NextRequest(`http://localhost/api/billing?orgId=${orgId}`);
}

describe("GET /api/billing", () => {
  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_SECRET_KEY;
    process.env.STRIPE_PRICE_ID_MONTHLY = ORIGINAL_STRIPE_PRICE_ID_MONTHLY;
    process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_STRIPE_WEBHOOK_SECRET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_PRICE_ID_MONTHLY = "price_mock";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";

    organizationSingle.mockResolvedValue({
      data: {
        id: ORG_ID,
        name: "Acme Health",
        slug: "acme",
        stripe_customer_id: "cus_123",
        subscription_status: "active",
        trial_ends_at: null,
        subscription_seats: null,
      },
      error: null,
    });
    subscriptionMaybeSingle.mockResolvedValue({
      data: {
        stripe_subscription_id: "sub_123",
        stripe_customer_id: "cus_123",
        status: "active",
        quantity: 5,
        current_period_end: "2026-06-01T00:00:00.000Z",
        cancel_at: null,
        canceled_at: null,
        trial_end: null,
      },
      error: null,
    });
    employeeIs.mockResolvedValue({
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
    membershipIs.mockResolvedValue({
      data: [{ user_id: "linked-user" }, { user_id: "management-only-user" }],
      error: null,
    });
    auditLimit.mockResolvedValue({
      data: [
        {
          id: 42,
          action: "billing.subscription_canceled",
          actor_id: null,
          actor_email: "Stripe",
          resource_type: "billing",
          resource_id: "sub_123",
          details: { initiated_by: "stripe" },
          created_at: "2026-05-03T12:00:00.000Z",
        },
        {
          id: 43,
          action: "billing.trial_extended",
          actor_id: "gridmaster-user",
          actor_email: "gridmaster@example.com",
          resource_type: "billing",
          resource_id: null,
          details: { initiated_by: "gridmaster", days: 14 },
          created_at: "2026-05-03T11:00:00.000Z",
        },
        {
          id: 44,
          action: "billing.subscription_created",
          actor_id: "user-1",
          actor_email: "owner@example.com",
          resource_type: "billing",
          resource_id: "sub_456",
          details: { initiated_by: "checkout_sync" },
          created_at: "2026-05-03T10:00:00.000Z",
        },
      ],
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
      if (table === "subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: subscriptionMaybeSingle,
            })),
          })),
        };
      }
      if (table === "employees") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: employeeIs,
            })),
          })),
        };
      }
      if (table === "organization_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: membershipIs,
            })),
          })),
        };
      }
      if (table === "audit_log") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              like: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: auditLimit,
                })),
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    requireOrgPermissions.mockResolvedValue({
      actor: {
        id: "user-1",
        user_metadata: { first_name: "Olivia", last_name: "Chen" },
      },
      permissions: { isGridmaster: false, isSuperAdmin: true },
      serviceClient: { from: serviceFrom },
      userClient: { from: vi.fn() },
    });
  });

  it("validates the org id before resolving permissions", async () => {
    const response = await GET(makeRequest("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  it("uses org permission checks for the requested organization", async () => {
    await GET(makeRequest());

    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.any(NextRequest),
      ORG_ID,
      expect.any(Function),
      { allowLockedOrganization: true, ignoreSandbox: true },
    );
    const isAllowed = requireOrgPermissions.mock.calls[0][2];
    expect(isAllowed({ isGridmaster: false, isSuperAdmin: true })).toBe(true);
    expect(isAllowed({ isGridmaster: false, isSuperAdmin: false })).toBe(false);
  });

  it("returns a minimized billing summary for super admins", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      orgId: ORG_ID,
      orgName: "Acme Health",
      orgSlug: "acme",
      status: "active",
      trialEndsAt: null,
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      cancelAt: null,
      canceledAt: null,
      subscriptionSeats: 5,
      appUserCount: 7,
      seatDelta: -2,
      hasStripeCustomer: true,
      hasStripeSubscription: true,
      stripeConfigured: true,
      canManageBilling: true,
      billingAccess: {
        state: "active",
        reason: "active_subscription",
        isLocked: false,
        shouldNotifyAdmins: false,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
      recentOperations: [
        {
          id: "42",
          action: "billing.subscription_canceled",
          label: "Subscription canceled",
          actorLabel: "Stripe",
          resourceType: "billing",
          resourceId: "sub_123",
          details: { initiated_by: "stripe" },
          createdAt: "2026-05-03T12:00:00.000Z",
        },
        {
          id: "43",
          action: "billing.trial_extended",
          label: "Trial extended",
          actorLabel: "Gridmaster",
          resourceType: "billing",
          resourceId: null,
          details: { initiated_by: "gridmaster", days: 14 },
          createdAt: "2026-05-03T11:00:00.000Z",
        },
        {
          id: "44",
          action: "billing.subscription_created",
          label: "Subscription started",
          actorLabel: "You (Olivia Chen)",
          resourceType: "billing",
          resourceId: "sub_456",
          details: { initiated_by: "checkout_sync" },
          createdAt: "2026-05-03T10:00:00.000Z",
        },
      ],
    });
  });

  it("marks Stripe unconfigured when the webhook secret is missing", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "";

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stripeConfigured).toBe(false);
  });

  it("forwards permission failures without loading billing data", async () => {
    requireOrgPermissions.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
  });
});
