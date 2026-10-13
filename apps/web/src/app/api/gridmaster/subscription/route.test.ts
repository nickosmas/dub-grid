import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const serviceFrom = vi.fn();
const subscriptionSingle = vi.fn();
const subscriptionUpdateEq = vi.fn();
const subscriptionUpdate = vi.fn();
const employeeEq = vi.fn();
const membershipIs = vi.fn();
const organizationEq = vi.fn();
const organizationUpdate = vi.fn();
const organizationSingle = vi.fn();
const auditInsert = vi.fn();
const scheduleSubscriptionCancellation = vi.fn();
const syncSubscriptionSeats = vi.fn();
const extendTrial = vi.fn();
const invalidateCache = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
  }),
}));

vi.mock("@/lib/stripe", () => ({
  cancelSubscription: vi.fn(),
  extendTrial: (...args: unknown[]) => extendTrial(...args),
  invalidateOrganizationBillingCache: (orgId: string) => invalidateCache(orgId),
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
    invalidateCache.mockResolvedValue(undefined);
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: "gridmaster-user" } });
    subscriptionSingle.mockResolvedValue({ data: null, error: null });
    subscriptionUpdateEq.mockResolvedValue({ error: null });
    subscriptionUpdate.mockReturnValue({ eq: subscriptionUpdateEq });
    employeeEq.mockResolvedValue({
      data: [
        { id: 1, status: "active", archived_at: null, user_id: "linked-user" },
        { id: 2, status: "active", archived_at: null, user_id: null },
        { id: 3, status: "active", archived_at: null, user_id: null },
        { id: 4, status: "active", archived_at: null, user_id: null },
        { id: 5, status: "active", archived_at: null, user_id: null },
        { id: 6, status: "active", archived_at: null, user_id: null },
        { id: 7, status: "active", archived_at: null, user_id: null },
        { id: 8, status: "active", archived_at: null, user_id: null },
        { id: 9, status: "inactive", archived_at: null, user_id: null },
      ],
      error: null,
    });
    membershipIs.mockResolvedValue({
      data: [{ user_id: "linked-user" }, { user_id: "management-only-user" }],
      error: null,
    });
    organizationEq.mockResolvedValue({ error: null });
    organizationUpdate.mockReturnValue({ eq: organizationEq });
    organizationSingle.mockResolvedValue({
      data: { subscription_status: "trialing", trial_started_at: null, trial_ends_at: null },
      error: null,
    });
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
            eq: employeeEq,
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

  it("sets the days left on a trial, beyond one year if asked", async () => {
    const before = Date.now();
    const response = await POST(
      makeRequest({ orgId: ORG_ID, action: "set_trial_days", trialDays: 5000 }),
    );

    expect(response.status).toBe(200);
    const update = organizationUpdate.mock.calls[0]?.[0] as Record<string, string>;
    expect(update).toMatchObject({
      subscription_status: "trialing",
      // A pending trial gets its start stamped with the change.
      trial_started_at: expect.any(String),
    });
    expect(Date.parse(update.trial_ends_at) - before).toBeGreaterThanOrEqual(5000 * 86_400_000);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "gridmaster-user",
        action: "billing.trial_changed",
        details: expect.objectContaining({ days: 5000, previous_trial_ends_at: null }),
      }),
    );
  });

  it("shortens a trial as readily as it lengthens one", async () => {
    organizationSingle.mockResolvedValueOnce({
      data: {
        subscription_status: "trialing",
        trial_started_at: "2026-10-01T00:00:00Z",
        trial_ends_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
      },
      error: null,
    });

    const response = await POST(
      makeRequest({ orgId: ORG_ID, action: "set_trial_days", trialDays: 2 }),
    );

    expect(response.status).toBe(200);
    const update = organizationUpdate.mock.calls[0]?.[0] as Record<string, string>;
    expect(update.trial_started_at).toBe("2026-10-01T00:00:00Z");
    expect(Date.parse(update.trial_ends_at) - Date.now()).toBeLessThan(3 * 86_400_000);
  });

  it("reopens an expired trial", async () => {
    organizationSingle.mockResolvedValueOnce({
      data: {
        subscription_status: "trial_expired",
        trial_started_at: "2026-09-01T00:00:00Z",
        trial_ends_at: "2026-09-15T00:00:00Z",
      },
      error: null,
    });

    const response = await POST(
      makeRequest({ orgId: ORG_ID, action: "set_trial_days", trialDays: 7 }),
    );

    expect(response.status).toBe(200);
    expect(organizationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: "trialing" }),
    );
  });

  it("refuses to put a paying organization back on a trial", async () => {
    organizationSingle.mockResolvedValueOnce({
      data: { subscription_status: "active", trial_started_at: null, trial_ends_at: null },
      error: null,
    });

    const response = await POST(
      makeRequest({ orgId: ORG_ID, action: "set_trial_days", trialDays: 7 }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This organization isn't on a trial.",
    });
    expect(organizationUpdate).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("ends a running trial now, leaving the grace period", async () => {
    organizationSingle.mockResolvedValueOnce({
      data: {
        subscription_status: "trialing",
        trial_started_at: "2026-10-01T00:00:00Z",
        trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      },
      error: null,
    });

    const response = await POST(makeRequest({ orgId: ORG_ID, action: "end_trial" }));

    expect(response.status).toBe(200);
    const update = organizationUpdate.mock.calls[0]?.[0] as Record<string, string>;
    expect(update.subscription_status).toBe("trialing");
    expect(Math.abs(Date.parse(update.trial_ends_at) - Date.now())).toBeLessThan(60_000);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "billing.trial_ended" }),
    );
  });

  it("expires a trial with fresh proof, keeping a past end date", async () => {
    organizationSingle.mockResolvedValueOnce({
      data: {
        subscription_status: "trialing",
        trial_started_at: "2026-09-25T00:00:00Z",
        trial_ends_at: "2026-10-09T00:00:00Z",
      },
      error: null,
    });

    const response = await POST(makeRequest({ orgId: ORG_ID, action: "expire_trial" }));

    expect(response.status).toBe(200);
    expect(requireSensitiveActionAuth).toHaveBeenCalled();
    expect(organizationUpdate).toHaveBeenCalledWith({
      trial_started_at: "2026-09-25T00:00:00Z",
      trial_ends_at: "2026-10-09T00:00:00Z",
      subscription_status: "trial_expired",
    });
    expect(invalidateCache).toHaveBeenCalledWith(ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "billing.trial_expired" }),
    );
  });

  it("asks for fresh proof before expiring a trial", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });

    const response = await POST(makeRequest({ orgId: ORG_ID, action: "expire_trial" }));

    expect(response.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("leaves ending a Stripe-billed trial to Stripe", async () => {
    subscriptionSingle.mockResolvedValueOnce({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });

    const response = await POST(makeRequest({ orgId: ORG_ID, action: "end_trial" }));

    expect(response.status).toBe(409);
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it("reports a failed trial write instead of auditing it", async () => {
    organizationEq.mockResolvedValueOnce({ error: { message: "boom" } });

    const response = await POST(
      makeRequest({ orgId: ORG_ID, action: "set_trial_days", trialDays: 7 }),
    );

    expect(response.status).toBe(500);
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("refuses an immediate cancel when there is no subscription", async () => {
    const response = await POST(makeRequest({ orgId: ORG_ID, action: "cancel" }));

    expect(response.status).toBe(409);
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it("cancels an organization subscription status and audits the action", async () => {
    subscriptionSingle.mockResolvedValueOnce({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });
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

  it("leaves the trial's dates alone when overriding back to trialing", async () => {
    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        action: "override_status",
        status: "trialing",
        reason: "Restoring after a mistaken cancel",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(organizationUpdate).toHaveBeenCalledWith({ subscription_status: "trialing" });
    expect(invalidateCache).toHaveBeenCalledWith(ORG_ID);
  });

  it("records the previous status and the reason for an override", async () => {
    const response = await POST(
      makeRequest({
        orgId: ORG_ID,
        action: "override_status",
        status: "active",
        reason: "  Comped for the pilot  ",
      }),
    );

    expect(response.status).toBe(200);
    expect(invalidateCache).toHaveBeenCalledWith(ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.status_overridden",
        details: expect.objectContaining({
          previous_status: "trialing",
          new_status: "active",
          reason: "Comped for the pilot",
        }),
      }),
    );
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["too long", "x".repeat(501)],
  ])("refuses an override with a %s reason", async (_name, reason) => {
    const response = await POST(
      makeRequest({ orgId: ORG_ID, action: "override_status", status: "active", reason }),
    );

    expect(response.status).toBe(400);
    expect(organizationUpdate).not.toHaveBeenCalled();
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

  it("refreshes cached access after truing up seats", async () => {
    subscriptionSingle.mockResolvedValueOnce({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });

    const response = await POST(makeRequest({ orgId: ORG_ID, action: "sync_seats" }));

    expect(response.status).toBe(200);
    expect(invalidateCache).toHaveBeenCalledWith(ORG_ID);
  });

  it.each([
    ["cancel", { action: "cancel" }],
    ["cancel_at_period_end", { action: "cancel_at_period_end" }],
    ["sync_seats", { action: "sync_seats" }],
    ["override_status", { action: "override_status", status: "active", reason: "Test" }],
  ])("reports a failed %s write instead of auditing it", async (_name, body) => {
    subscriptionSingle.mockResolvedValueOnce({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });
    organizationEq.mockResolvedValue({ error: { message: "write failed" } });
    subscriptionUpdateEq.mockResolvedValue({ error: { message: "write failed" } });

    const response = await POST(makeRequest({ orgId: ORG_ID, ...body }));

    expect(response.status).toBe(500);
    expect(auditInsert).not.toHaveBeenCalled();
  });
});
