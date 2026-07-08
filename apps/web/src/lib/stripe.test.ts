import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeConstructor = vi.fn();
const createClient = vi.fn();
const checkoutSessionsCreate = vi.fn();
const checkoutSessionsRetrieve = vi.fn();
const subscriptionsList = vi.fn();
const subscriptionsRetrieve = vi.fn();
const subscriptionsUpdate = vi.fn();
const serviceFrom = vi.fn();
const organizationSingle = vi.fn();
const organizationEq = vi.fn();
const organizationUpdate = vi.fn();
const subscriptionEq = vi.fn();
const subscriptionUpdate = vi.fn();
const subscriptionUpsert = vi.fn();
const subscriptionMaybeSingle = vi.fn();
const auditInsert = vi.fn();

vi.mock("stripe", () => ({
  default: stripeConstructor,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ORIGINAL_STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_STRIPE_PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY;
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("syncSubscriptionToDb", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    stripeConstructor.mockImplementation(() => ({
      checkout: {
        sessions: {
          create: checkoutSessionsCreate,
          retrieve: checkoutSessionsRetrieve,
        },
      },
      subscriptions: {
        list: subscriptionsList,
        retrieve: subscriptionsRetrieve,
        update: subscriptionsUpdate,
      },
    }));
    createClient.mockReturnValue({ from: serviceFrom });
    organizationSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_123" },
      error: null,
    });
    organizationEq.mockResolvedValue({ error: null });
    organizationUpdate.mockReturnValue({ eq: organizationEq });
    subscriptionEq.mockResolvedValue({ error: null });
    subscriptionUpdate.mockReturnValue({ eq: subscriptionEq });
    subscriptionUpsert.mockResolvedValue({ error: null });
    subscriptionMaybeSingle.mockResolvedValue({ data: null, error: null });
    auditInsert.mockResolvedValue({ error: null });
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
      if (table === "subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: subscriptionMaybeSingle,
            })),
          })),
          update: subscriptionUpdate,
          upsert: subscriptionUpsert,
        };
      }
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_SECRET_KEY;
    process.env.STRIPE_PRICE_ID_MONTHLY = ORIGINAL_STRIPE_PRICE_ID_MONTHLY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE_KEY;
  });

  it("syncs Stripe subscription state into subscriptions and organizations", async () => {
    subscriptionsList.mockResolvedValue({
      data: [
        {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          items: {
            data: [
              {
                price: { id: "price_123" },
                quantity: 7,
                current_period_start: 1_778_284_800,
                current_period_end: 1_780_876_800,
              },
            ],
          },
          cancel_at: null,
          canceled_at: null,
          trial_end: 1_777_766_400,
        },
      ],
    });
    const { syncSubscriptionToDb } = await import("./stripe");

    await syncSubscriptionToDb(ORG_ID);

    expect(subscriptionsList).toHaveBeenCalledWith({
      customer: "cus_123",
      status: "all",
      limit: 1,
    });
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        stripe_subscription_id: "sub_123",
        stripe_customer_id: "cus_123",
        status: "active",
        price_id: "price_123",
        quantity: 7,
      }),
      { onConflict: "org_id" },
    );
    expect(organizationUpdate).toHaveBeenCalledWith({
      stripe_customer_id: "cus_123",
      subscription_status: "active",
      subscription_seats: 7,
      trial_ends_at: "2026-05-03T00:00:00.000Z",
    });
    expect(organizationEq).toHaveBeenCalledWith("id", ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        action: "billing.subscription_created",
        resource_type: "billing",
        resource_id: "sub_123",
        details: expect.objectContaining({
          initiated_by: "gridmaster_sync",
          status: "active",
          quantity: 7,
        }),
      }),
    );
  });

  it("adds the checkout session placeholder to successful subscription checkout redirects", async () => {
    process.env.STRIPE_PRICE_ID_MONTHLY = "price_123";
    checkoutSessionsCreate.mockResolvedValue({ id: "cs_test_123" });
    const { createCheckoutSession } = await import("./stripe");

    await createCheckoutSession(
      "cus_123",
      ORG_ID,
      9,
      "http://localhost:3000/settings?section=org-billing",
    );

    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        mode: "subscription",
        line_items: [{ price: "price_123", quantity: 9 }],
        success_url:
          "http://localhost:3000/settings?section=org-billing&billing=success&stripe_checkout_session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "http://localhost:3000/settings?section=org-billing&billing=canceled",
      }),
    );
  });

  it("syncs a completed Checkout Session without a webhook", async () => {
    checkoutSessionsRetrieve.mockResolvedValue({
      id: "cs_test_123",
      mode: "subscription",
      status: "complete",
      metadata: { org_id: ORG_ID },
      subscription: {
        id: "sub_123",
        customer: "cus_123",
        status: "trialing",
        metadata: { org_id: ORG_ID },
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
    });
    const { syncCheckoutSessionToDb } = await import("./stripe");

    await syncCheckoutSessionToDb({ from: serviceFrom }, "cs_test_123", ORG_ID, {
      actor: {
        id: "user-1",
        email: "owner@example.com",
      },
    });

    expect(checkoutSessionsRetrieve).toHaveBeenCalledWith("cs_test_123", {
      expand: ["subscription"],
    });
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        stripe_subscription_id: "sub_123",
        stripe_customer_id: "cus_123",
        status: "trialing",
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
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.subscription_created",
        actor_id: "user-1",
        actor_email: "owner@example.com",
        details: expect.objectContaining({ initiated_by: "checkout_sync" }),
      }),
    );
  });

  it("marks the organization canceled when Stripe has no subscriptions", async () => {
    subscriptionsList.mockResolvedValue({ data: [] });
    const { syncSubscriptionToDb } = await import("./stripe");

    await syncSubscriptionToDb(ORG_ID);

    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "canceled",
      }),
    );
    expect(subscriptionEq).toHaveBeenCalledWith("org_id", ORG_ID);
    expect(organizationUpdate).toHaveBeenCalledWith({
      subscription_status: "canceled",
      subscription_seats: null,
      trial_ends_at: null,
    });
    expect(organizationEq).toHaveBeenCalledWith("id", ORG_ID);
  });

  it("schedules a subscription cancellation at period end", async () => {
    subscriptionsUpdate.mockResolvedValue({ id: "sub_123" });
    const { scheduleSubscriptionCancellation } = await import("./stripe");

    await scheduleSubscriptionCancellation("sub_123");

    expect(subscriptionsUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: true,
    });
  });
});
