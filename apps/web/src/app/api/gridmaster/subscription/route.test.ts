import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireGridmasterSession = vi.fn();
const serviceFrom = vi.fn();
const subscriptionSingle = vi.fn();
const subscriptionUpdateEq = vi.fn();
const subscriptionUpdate = vi.fn();
const employeeIs = vi.fn();
const membershipIs = vi.fn();
const organizationEq = vi.fn();
const organizationUpdate = vi.fn();
const organizationSingle = vi.fn();
const auditInsert = vi.fn();
const scheduleSubscriptionCancellation = vi.fn();
const syncSubscriptionSeats = vi.fn();
const extendTrial = vi.fn();
const cacheDel = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
  }),
}));

vi.mock("@/lib/stripe", () => ({
  cancelSubscription: vi.fn(),
  extendTrial: (...args: unknown[]) => extendTrial(...args),
  scheduleSubscriptionCancellation: (...args: unknown[]) =>
    scheduleSubscriptionCancellation(...args),
  syncSubscriptionSeats: (...args: unknown[]) => syncSubscriptionSeats(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  CacheKey: {
    mwOrgAccess: (orgId: string) => `dg:mw:orgAccess:${orgId}`,
    organization: (orgId: string) => `dg:org:${orgId}:organization`,
  },
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/gridmaster/subscription", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/gridmaster/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheDel.mockResolvedValue(undefined);
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    subscriptionSingle.mockResolvedValue({ data: null, error: null });
    subscriptionUpdateEq.mockResolvedValue({ error: null });
    subscriptionUpdate.mockReturnValue({ eq: subscriptionUpdateEq });
    employeeIs.mockResolvedValue({
      data: [
        { id: 1, user_id: "linked-user" },
        { id: 2, user_id: null },
        { id: 3, user_id: null },
        { id: 4, user_id: null },
        { id: 5, user_id: null },
        { id: 6, user_id: null },
        { id: 7, user_id: null },
        { id: 8, user_id: null },
      ],
      error: null,
    });
    membershipIs.mockResolvedValue({
      data: [{ user_id: "linked-user" }, { user_id: "management-only-user" }],
      error: null,
    });
    organizationEq.mockResolvedValue({ error: null });
    organizationUpdate.mockReturnValue({ eq: organizationEq });
    organizationSingle.mockResolvedValue({ data: { trial_started_at: null }, error: null });
    scheduleSubscriptionCancellation.mockResolvedValue({
      status: "active",
      cancel_at: 1_780_876_800,
      canceled_at: null,
      items: {
        data: [{ current_period_end: 1_780_876_800 }],
      },
    });
    auditInsert.mockResolvedValue({ error: null });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: subscriptionSingle,
            })),
          })),
          update: subscriptionUpdate,
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
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects CSRF failures before gridmaster auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(makeRequest({ orgId: ORG_ID, action: "cancel" }));

    expect(response.status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("validates bad input before mutating", async () => {
    const response = await POST(makeRequest({ orgId: "not-a-uuid", action: "cancel" }));

    expect(response.status).toBe(400);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("rejects unsupported status overrides before mutating", async () => {
    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        action: "override_status",
        status: "freeform-status",
      }),
    );

    expect(response.status).toBe(400);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("allows gridmasters to extend trials beyond one year", async () => {
    const response = await POST(
      makeRequest({ orgId: ORG_ID, action: "extend_trial", trialDays: 5000 }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(organizationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_status: "trialing",
        trial_ends_at: expect.any(String),
        // Pending trial (trial_started_at null) gets its start stamped on extend.
        trial_started_at: expect.any(String),
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "gridmaster-user",
        action: "billing.trial_extended",
        resource_type: "organization",
        resource_id: ORG_ID,
        details: expect.objectContaining({ days: 5000 }),
      }),
    );
  });

  it("cancels an organization subscription status and audits the action", async () => {
    const response = await POST(makeRequest({ orgId: ORG_ID, action: "cancel" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(organizationUpdate).toHaveBeenCalledWith({
      subscription_status: "canceled",
    });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "gridmaster-user",
        action: "billing.subscription_canceled",
        resource_type: "organization",
        resource_id: ORG_ID,
      }),
    );
  });

  it("sets a trial end date when overriding an organization back to trialing", async () => {
    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        action: "override_status",
        status: "trialing",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(organizationUpdate).toHaveBeenCalledWith({
      subscription_status: "trialing",
      trial_ends_at: expect.any(String),
    });
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:mw:orgAccess:${ORG_ID}`,
      `dg:org:${ORG_ID}:organization`,
    );
  });

  it("invalidates organization access after overriding billing to active", async () => {
    const response = await POST(
      makeRequest({ orgId: ORG_ID, action: "override_status", status: "active" }),
    );

    expect(response.status).toBe(200);
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:mw:orgAccess:${ORG_ID}`,
      `dg:org:${ORG_ID}:organization`,
    );
  });

  it("syncs Stripe seats to app users and audits the action", async () => {
    subscriptionSingle.mockResolvedValueOnce({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });

    const response = await POST(makeRequest({ orgId: ORG_ID, action: "sync_seats" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(syncSubscriptionSeats).toHaveBeenCalledWith("sub_123", 9);
    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 9,
      }),
    );
    expect(subscriptionUpdateEq).toHaveBeenCalledWith("org_id", ORG_ID);
    expect(organizationUpdate).toHaveBeenCalledWith({
      subscription_seats: 9,
    });
    expect(organizationEq).toHaveBeenCalledWith("id", ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "gridmaster-user",
        action: "billing.seats_synced",
        resource_type: "organization",
        resource_id: ORG_ID,
        details: expect.objectContaining({ seats: 9 }),
      }),
    );
  });

  it("schedules cancellation at period end and audits the action", async () => {
    subscriptionSingle.mockResolvedValueOnce({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });
    const cancelAt = new Date(1_780_876_800 * 1000).toISOString();

    const response = await POST(makeRequest({ orgId: ORG_ID, action: "cancel_at_period_end" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(scheduleSubscriptionCancellation).toHaveBeenCalledWith("sub_123");
    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        current_period_end: cancelAt,
        cancel_at: cancelAt,
        canceled_at: null,
      }),
    );
    expect(subscriptionUpdateEq).toHaveBeenCalledWith("org_id", ORG_ID);
    expect(organizationUpdate).toHaveBeenCalledWith({
      subscription_status: "active",
    });
    expect(organizationEq).toHaveBeenCalledWith("id", ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "gridmaster-user",
        action: "billing.subscription_cancel_scheduled",
        resource_type: "organization",
        resource_id: ORG_ID,
        details: expect.objectContaining({ cancel_at: cancelAt }),
      }),
    );
  });

  it("rejects scheduled cancellation when the organization has no Stripe subscription", async () => {
    const response = await POST(makeRequest({ orgId: ORG_ID, action: "cancel_at_period_end" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe subscription required",
    });
    expect(scheduleSubscriptionCancellation).not.toHaveBeenCalled();
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it("rejects seat sync when the organization has no Stripe subscription", async () => {
    const response = await POST(makeRequest({ orgId: ORG_ID, action: "sync_seats" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe subscription required",
    });
    expect(syncSubscriptionSeats).not.toHaveBeenCalled();
    expect(organizationUpdate).not.toHaveBeenCalled();
  });
});
