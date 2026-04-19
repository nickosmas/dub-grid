import Stripe from "stripe";
import logger from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";

let _stripe: Stripe | null | undefined;

function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.warn("STRIPE_SECRET_KEY not configured — billing features disabled");
    _stripe = null;
    return null;
  }
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
  return _stripe;
}

/** Lazily-initialized Stripe instance. Returns null if STRIPE_SECRET_KEY is not set. */
export { getStripe };

/**
 * Create a Stripe customer for an organization.
 */
export async function createStripeCustomer(orgId: string, orgName: string, email: string) {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");
  return s.customers.create({
    metadata: { org_id: orgId },
    name: orgName,
    email,
  });
}

/**
 * Create a Stripe Checkout Session for a new subscription.
 */
export async function createCheckoutSession(
  customerId: string,
  orgId: string,
  seats: number,
  returnUrl: string,
) {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");
  const priceId = process.env.STRIPE_PRICE_ID_MONTHLY;
  if (!priceId) throw new Error("STRIPE_PRICE_ID_MONTHLY not configured");

  return s.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: seats }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { org_id: orgId },
    },
    success_url: `${returnUrl}/settings?billing=success`,
    cancel_url: `${returnUrl}/settings?billing=canceled`,
    metadata: { org_id: orgId },
  });
}

/**
 * Create a Stripe Billing Portal session.
 */
export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");
  return s.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${returnUrl}/settings`,
  });
}

/**
 * Update subscription quantity (seat sync).
 */
export async function syncSubscriptionSeats(subscriptionId: string, seats: number) {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");
  const sub = await s.subscriptions.retrieve(subscriptionId);
  if (!sub.items.data[0]) return;
  await s.subscriptions.update(subscriptionId, {
    items: [{ id: sub.items.data[0].id, quantity: seats }],
    proration_behavior: "create_prorations",
  });
}

/**
 * Cancel a Stripe subscription immediately.
 */
export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");
  return s.subscriptions.cancel(subscriptionId);
}

/**
 * Extend a subscription's trial period.
 */
export async function extendTrial(subscriptionId: string, newTrialEnd: Date): Promise<Stripe.Subscription> {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");
  return s.subscriptions.update(subscriptionId, {
    trial_end: Math.floor(newTrialEnd.getTime() / 1000),
  });
}

/**
 * Retrieve a Stripe subscription by ID.
 */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");
  return s.subscriptions.retrieve(subscriptionId);
}

/**
 * Force re-sync an organization's Stripe subscription state to the local DB.
 * Fetches the customer's active subscriptions from Stripe and updates both
 * the subscriptions table and the organizations table.
 */
export async function syncSubscriptionToDb(orgId: string): Promise<void> {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role credentials not configured");
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Get the org's Stripe customer ID
  const { data: org, error: orgError } = await adminClient
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .single();
  if (orgError) throw orgError;
  if (!org?.stripe_customer_id) {
    throw new Error(`Organization ${orgId} has no Stripe customer ID`);
  }

  // Fetch active subscriptions from Stripe
  const subscriptions = await s.subscriptions.list({
    customer: org.stripe_customer_id,
    status: "all",
    limit: 1,
  });

  const sub = subscriptions.data[0];
  if (!sub) {
    // No subscription found — update local status
    await adminClient
      .from("subscriptions")
      .update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId);
    return;
  }

  // In the Stripe dahlia API, period dates are on the subscription item
  const item = sub.items.data[0];

  // Update the subscriptions table
  await adminClient
    .from("subscriptions")
    .upsert(
      {
        org_id: orgId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: org.stripe_customer_id,
        status: sub.status,
        price_id: item?.price?.id ?? null,
        quantity: item?.quantity ?? 1,
        current_period_start: item?.current_period_start
          ? new Date(item.current_period_start * 1000).toISOString()
          : null,
        current_period_end: item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null,
        cancel_at: sub.cancel_at
          ? new Date(sub.cancel_at * 1000).toISOString()
          : null,
        canceled_at: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null,
        trial_end: sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
}
