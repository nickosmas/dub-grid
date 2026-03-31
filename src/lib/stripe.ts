import Stripe from "stripe";
import logger from "@/lib/logger";

if (!process.env.STRIPE_SECRET_KEY) {
  logger.warn("STRIPE_SECRET_KEY not configured — billing features disabled");
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" })
  : null;

/**
 * Create a Stripe customer for an organization.
 */
export async function createStripeCustomer(orgId: string, orgName: string, email: string) {
  if (!stripe) throw new Error("Stripe not configured");
  return stripe.customers.create({
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
  if (!stripe) throw new Error("Stripe not configured");
  const priceId = process.env.STRIPE_PRICE_ID_MONTHLY;
  if (!priceId) throw new Error("STRIPE_PRICE_ID_MONTHLY not configured");

  return stripe.checkout.sessions.create({
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
  if (!stripe) throw new Error("Stripe not configured");
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${returnUrl}/settings`,
  });
}

/**
 * Update subscription quantity (seat sync).
 */
export async function syncSubscriptionSeats(subscriptionId: string, seats: number) {
  if (!stripe) throw new Error("Stripe not configured");
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (!sub.items.data[0]) return;
  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: sub.items.data[0].id, quantity: seats }],
    proration_behavior: "create_prorations",
  });
}
