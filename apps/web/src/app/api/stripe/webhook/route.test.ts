import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructEvent = vi.fn();
const serviceFrom = vi.fn();
const subscriptionUpsert = vi.fn();
const subscriptionMaybeSingle = vi.fn();
const organizationMaybeSingle = vi.fn();
const organizationEq = vi.fn();
const organizationUpdate = vi.fn();
const auditInsert = vi.fn();
const dedupInsert = vi.fn();

vi.mock("@/lib/stripe", async () => ({
  ...(await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe")),
  getStripe: () => ({
    webhooks: {
      constructEvent,
    },
  }),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

import { POST } from "./route";

const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function makeRequest() {
  return new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: JSON.stringify({ id: "evt_123" }),
    headers: {
      "stripe-signature": "sig_123",
    },
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
    subscriptionUpsert.mockResolvedValue({ error: null });
    subscriptionMaybeSingle.mockResolvedValue({ data: null, error: null });
    organizationMaybeSingle.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111" },
      error: null,
    });
    organizationEq.mockResolvedValue({ error: null });
    organizationUpdate.mockReturnValue({ eq: organizationEq });
    auditInsert.mockResolvedValue({ error: null });
    // First-time event by default (no prior row) — the replay-dedup insert succeeds.
    dedupInsert.mockResolvedValue({ error: null });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "stripe_processed_events") {
        return { insert: dedupInsert };
      }
      if (table === "subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: subscriptionMaybeSingle,
            })),
          })),
          upsert: subscriptionUpsert,
        };
      }
      if (table === "organizations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: organizationMaybeSingle,
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

  afterEach(() => {
    vi.useRealTimers();
    process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
  });

  it("writes Stripe subscription state to the organization summary fields", async () => {
    constructEvent.mockReturnValue({
      id: "evt_123",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "trialing",
          metadata: { org_id: "11111111-1111-4111-8111-111111111111" },
          items: {
            data: [
              {
                price: { id: "price_123" },
                quantity: 9,
                current_period_start: 1_778_284_800,
                current_period_end: 1_780_876_800,
              },
            ],
          },
          cancel_at: null,
          canceled_at: null,
          trial_end: 1_777_766_400,
        },
      },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "11111111-1111-4111-8111-111111111111",
        stripe_subscription_id: "sub_123",
        stripe_customer_id: "cus_123",
        status: "trialing",
        price_id: "price_123",
        quantity: 9,
      }),
      { onConflict: "org_id" },
    );
    expect(organizationUpdate).toHaveBeenCalledWith({
      stripe_customer_id: "cus_123",
      subscription_status: "trialing",
      subscription_seats: 9,
      trial_ends_at: "2026-05-03T00:00:00.000Z",
    });
    expect(organizationEq).toHaveBeenCalledWith("id", "11111111-1111-4111-8111-111111111111");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "11111111-1111-4111-8111-111111111111",
        actor_email: "Stripe",
        action: "billing.subscription_created",
        resource_type: "billing",
        resource_id: "sub_123",
        details: expect.objectContaining({
          initiated_by: "stripe",
          stripe_event_id: "evt_123",
          stripe_event_type: "customer.subscription.updated",
          status: "trialing",
        }),
      }),
    );
  });

  it("keeps trialing webhook updates from clearing the trial end date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T00:00:00.000Z"));
    constructEvent.mockReturnValue({
      id: "evt_123",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "trialing",
          metadata: { org_id: "11111111-1111-4111-8111-111111111111" },
          items: {
            data: [
              {
                price: { id: "price_123" },
                quantity: 9,
                current_period_start: 1_778_284_800,
                current_period_end: 1_780_876_800,
              },
            ],
          },
          cancel_at: null,
          canceled_at: null,
          trial_end: null,
        },
      },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(organizationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_status: "trialing",
        trial_ends_at: "2026-05-16T00:00:00.000Z",
      }),
    );
  });

  it("records a canceled billing operation when Stripe cancels a subscription", async () => {
    subscriptionMaybeSingle.mockResolvedValueOnce({
      data: {
        stripe_subscription_id: "sub_123",
        status: "active",
        quantity: 9,
        current_period_end: "2026-06-01T00:00:00.000Z",
        cancel_at: null,
        canceled_at: null,
        trial_end: null,
      },
      error: null,
    });
    constructEvent.mockReturnValue({
      id: "evt_456",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "canceled",
          metadata: { org_id: "11111111-1111-4111-8111-111111111111" },
          items: {
            data: [
              {
                price: { id: "price_123" },
                quantity: 9,
                current_period_start: 1_778_284_800,
                current_period_end: 1_780_876_800,
              },
            ],
          },
          cancel_at: null,
          canceled_at: 1_778_284_800,
          trial_end: null,
        },
      },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.subscription_canceled",
        actor_email: "Stripe",
        details: expect.objectContaining({
          previous_status: "active",
          status: "canceled",
          stripe_event_id: "evt_456",
          stripe_event_type: "customer.subscription.deleted",
        }),
      }),
    );
  });

  it("resolves billing portal subscription activity by Stripe customer when subscription metadata is missing", async () => {
    subscriptionMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          stripe_subscription_id: "sub_123",
          status: "active",
          quantity: 9,
          current_period_end: "2026-06-01T00:00:00.000Z",
          cancel_at: null,
          canceled_at: null,
          trial_end: null,
        },
        error: null,
      });
    constructEvent.mockReturnValue({
      id: "evt_portal_cancel",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          metadata: {},
          items: {
            data: [
              {
                price: { id: "price_123" },
                quantity: 9,
                current_period_start: 1_778_284_800,
                current_period_end: 1_780_876_800,
              },
            ],
          },
          cancel_at: 1_780_876_800,
          canceled_at: null,
          trial_end: null,
        },
      },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "11111111-1111-4111-8111-111111111111",
        stripe_subscription_id: "sub_123",
      }),
      { onConflict: "org_id" },
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.subscription_cancel_scheduled",
        actor_email: "Stripe",
        details: expect.objectContaining({
          stripe_event_type: "customer.subscription.updated",
          previous_cancel_at: null,
        }),
      }),
    );
  });

  it("records Stripe customer billing details updates from the portal", async () => {
    constructEvent.mockReturnValue({
      id: "evt_customer_updated",
      type: "customer.updated",
      data: {
        object: {
          id: "cus_123",
        },
      },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "11111111-1111-4111-8111-111111111111",
        actor_email: "Stripe",
        action: "billing.billing_details_updated",
        resource_type: "billing",
        resource_id: "cus_123",
        details: expect.objectContaining({
          initiated_by: "stripe",
          stripe_event_type: "customer.updated",
          customer_id: "cus_123",
        }),
      }),
    );
  });

  it("records Stripe payment method removals from the portal", async () => {
    constructEvent.mockReturnValue({
      id: "evt_payment_method_detached",
      type: "payment_method.detached",
      data: {
        object: {
          id: "pm_123",
          customer: null,
          type: "card",
        },
        previous_attributes: {
          customer: "cus_123",
        },
      },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "11111111-1111-4111-8111-111111111111",
        actor_email: "Stripe",
        action: "billing.payment_method_updated",
        resource_type: "billing",
        resource_id: "pm_123",
        details: expect.objectContaining({
          initiated_by: "stripe",
          stripe_event_type: "payment_method.detached",
          customer_id: "cus_123",
          payment_method_type: "card",
        }),
      }),
    );
  });

  it("returns a retryable error when the subscription write fails", async () => {
    subscriptionUpsert.mockResolvedValueOnce({
      error: new Error("database unavailable"),
    });
    constructEvent.mockReturnValue({
      id: "evt_123",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          metadata: { org_id: "11111111-1111-4111-8111-111111111111" },
          items: {
            data: [
              {
                price: { id: "price_123" },
                quantity: 9,
                current_period_start: 1_778_284_800,
                current_period_end: 1_780_876_800,
              },
            ],
          },
          cancel_at: null,
          canceled_at: null,
          trial_end: null,
        },
      },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook processing failed",
    });
    expect(organizationUpdate).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("skips reprocessing a redelivered event (replay idempotency, M-4)", async () => {
    // The dedup ledger insert hits a unique-violation → event already processed.
    dedupInsert.mockResolvedValue({ error: { code: "23505" } });
    constructEvent.mockReturnValue({
      id: "evt_123",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          metadata: { org_id: "11111111-1111-4111-8111-111111111111" },
          items: { data: [] },
        },
      },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    // No side effects on a duplicate.
    expect(subscriptionUpsert).not.toHaveBeenCalled();
    expect(organizationUpdate).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });
});
