import { NextResponse } from "next/server";
import Stripe from "stripe";
import { DEFAULT_TRIAL_DAYS } from "@dubgrid/domain";
import logger from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/supabase-keys";
import { serverEnv } from "@/lib/env.server";

let _stripe: Stripe | null | undefined;

/**
 * Kill-switch check for all /api/stripe/* routes. Call at the top of each
 * route handler; a non-null return is the 503 to send back immediately.
 */
export async function requireStripeEnabled(): Promise<NextResponse | null> {
  if (await isFeatureEnabled("stripe")) return null;
  return NextResponse.json(
    { error: "Billing is unavailable right now. Try again in a moment." },
    { status: 503 },
  );
}

type BillingSyncClient = Pick<SupabaseClient, "from">;

type StripeSubscriptionSyncOptions = {
  audit?: {
    source: "stripe_webhook" | "checkout_sync" | "gridmaster_sync";
    actor?: {
      id: string;
      email?: string | null;
    };
    stripeEventId?: string;
    stripeEventType?: string;
  };
};

type PreviousSubscriptionRow = {
  org_id?: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  quantity: number | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  trial_end: string | null;
};

type StripeCustomerActivityAction =
  | "billing.billing_details_updated"
  | "billing.payment_method_updated"
  | "billing.portal_opened"
  | "billing.payment_succeeded";

function withBillingResult(returnUrl: string, result: "success" | "canceled") {
  const url = new URL(returnUrl);
  url.searchParams.set("billing", result);
  return url.toString();
}

function withCheckoutSessionPlaceholder(returnUrl: string) {
  const successUrl = withBillingResult(returnUrl, "success");
  const separator = successUrl.includes("?") ? "&" : "?";
  return `${successUrl}${separator}stripe_checkout_session_id={CHECKOUT_SESSION_ID}`;
}

function defaultTrialEndFrom(date: Date): string {
  return new Date(date.getTime() + DEFAULT_TRIAL_DAYS * 86_400_000).toISOString();
}

function resolveStripeTrialEnd(sub: Stripe.Subscription): string | null {
  if (sub.trial_end) {
    return new Date(sub.trial_end * 1000).toISOString();
  }
  return sub.status === "trialing" ? defaultTrialEndFrom(new Date()) : null;
}

function stripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  if (!serverEnv?.STRIPE_SECRET_KEY) {
    logger.warn("STRIPE_SECRET_KEY not configured — billing features disabled");
    _stripe = null;
    return null;
  }
  _stripe = new Stripe(serverEnv?.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
  return _stripe;
}

/** Lazily-initialized Stripe instance. Returns null if STRIPE_SECRET_KEY is not set. */
export { getStripe };

/**
 * Get or create a Stripe customer for an organization. Idempotent by `org_id` metadata:
 * if the persist of `stripe_customer_id` ever failed on a prior attempt (leaving a customer
 * in Stripe the org row doesn't know about), we reuse that customer instead of creating a
 * duplicate. Callers guard on a null local `stripe_customer_id`, so without this an
 * unpersisted customer would silently orphan and the next attempt would create another.
 */
export async function createStripeCustomer(orgId: string, orgName: string, email: string) {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");

  const existing = await s.customers.search({
    query: `metadata['org_id']:'${orgId}'`,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0];

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
  const priceId = serverEnv?.STRIPE_PRICE_ID_MONTHLY;
  if (!priceId) throw new Error("STRIPE_PRICE_ID_MONTHLY not configured");

  return s.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: seats }],
    subscription_data: {
      // No trial_period_days: the in-app 14-day trial (started on the first
      // super_admin sign-in) is the only trial. Subscribing goes straight to
      // active so we don't grant a second free period on top of it.
      metadata: { org_id: orgId },
    },
    success_url: withCheckoutSessionPlaceholder(returnUrl),
    cancel_url: withBillingResult(returnUrl, "canceled"),
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
    return_url: returnUrl,
  });
}

export async function writeBillingPortalOpenedAuditLog(
  serviceClient: BillingSyncClient,
  input: {
    orgId: string;
    actor: { id: string; email?: string | null };
  },
): Promise<void> {
  try {
    const { error } = await serviceClient.from("audit_log").insert({
      org_id: input.orgId,
      actor_id: input.actor.id,
      actor_email: input.actor.email ?? null,
      action: "billing.portal_opened",
      resource_type: "billing",
      resource_id: input.orgId,
      details: {
        initiated_by: "customer_portal",
      },
    });
    if (error) {
      logger.warn({ error, orgId: input.orgId }, "Billing portal audit log write failed");
    }
  } catch (error) {
    logger.warn({ error, orgId: input.orgId }, "Billing portal audit log write failed");
  }
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
 * Cancel a Stripe subscription at the end of the current billing period.
 */
export async function scheduleSubscriptionCancellation(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");
  return s.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Extend a subscription's trial period.
 */
export async function extendTrial(
  subscriptionId: string,
  newTrialEnd: Date,
): Promise<Stripe.Subscription> {
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

export async function upsertStripeSubscriptionToDb(
  serviceClient: BillingSyncClient,
  sub: Stripe.Subscription,
  options: StripeSubscriptionSyncOptions = {},
): Promise<void> {
  const customerId = stripeCustomerId(sub.customer);
  if (!customerId) {
    logger.warn({ subscriptionId: sub.id }, "Subscription missing customer ID");
    return;
  }
  const orgId =
    sub.metadata?.org_id ??
    (await resolveStripeSubscriptionOrgId(serviceClient, {
      subscriptionId: sub.id,
      customerId,
    }));
  if (!orgId) {
    logger.warn(
      { subscriptionId: sub.id, customerId },
      "Subscription could not be resolved to an organization",
    );
    return;
  }
  const item = sub.items.data[0];
  const trialEnd = resolveStripeTrialEnd(sub);
  const currentPeriodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  const cancelAt = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null;
  const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null;
  const previous = await loadPreviousSubscriptionForAudit(serviceClient, orgId);

  const { error: subError } = await serviceClient.from("subscriptions").upsert(
    {
      org_id: orgId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      status: sub.status,
      price_id: item?.price?.id ?? null,
      quantity: item?.quantity ?? 1,
      current_period_start: item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : null,
      current_period_end: currentPeriodEnd,
      cancel_at: cancelAt,
      canceled_at: canceledAt,
      trial_end: trialEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" },
  );
  if (subError) throw subError;

  const { error: orgError } = await serviceClient
    .from("organizations")
    .update({
      stripe_customer_id: customerId,
      subscription_status: sub.status,
      subscription_seats: item?.quantity ?? null,
      trial_ends_at: trialEnd,
    })
    .eq("id", orgId);
  if (orgError) throw orgError;

  await writeStripeSubscriptionAuditLog(serviceClient, {
    orgId,
    previous,
    next: {
      stripe_subscription_id: sub.id,
      status: sub.status,
      quantity: item?.quantity ?? 1,
      current_period_end: currentPeriodEnd,
      cancel_at: cancelAt,
      canceled_at: canceledAt,
      trial_end: trialEnd,
    },
    source: options.audit?.source ?? "stripe_webhook",
    actor: options.audit?.actor,
    stripeEventId: options.audit?.stripeEventId,
    stripeEventType: options.audit?.stripeEventType,
  });
}

export async function syncCheckoutSessionToDb(
  serviceClient: BillingSyncClient,
  sessionId: string,
  expectedOrgId: string,
  options: {
    actor?: {
      id: string;
      email?: string | null;
    };
  } = {},
): Promise<void> {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");

  const session = await s.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  if (session.mode !== "subscription" || session.status !== "complete") {
    throw new Error("Checkout session is not complete");
  }

  const subscription =
    typeof session.subscription === "string"
      ? await s.subscriptions.retrieve(session.subscription)
      : session.subscription;
  if (!subscription) {
    throw new Error("Checkout session has no subscription");
  }

  const orgId = session.metadata?.org_id ?? subscription.metadata?.org_id;
  if (orgId !== expectedOrgId) {
    throw new Error("Checkout session organization mismatch");
  }

  await upsertStripeSubscriptionToDb(serviceClient, subscription, {
    audit: {
      source: "checkout_sync",
      actor: options.actor,
    },
  });
}

/**
 * Force re-sync an organization's Stripe subscription state to the local DB.
 * Fetches the customer's active subscriptions from Stripe and updates both
 * the subscriptions table and the organizations table.
 */
export async function syncSubscriptionToDb(orgId: string): Promise<void> {
  const s = getStripe();
  if (!s) throw new Error("Stripe not configured");

  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getSupabaseSecretKey();
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
    // No subscription found — keep the org summary aligned with the local subscription record.
    const { error: subUpdateError } = await adminClient
      .from("subscriptions")
      .update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId);
    if (subUpdateError) throw subUpdateError;

    const { error: orgUpdateError } = await adminClient
      .from("organizations")
      .update({
        subscription_status: "canceled",
        subscription_seats: null,
        trial_ends_at: null,
      })
      .eq("id", orgId);
    if (orgUpdateError) throw orgUpdateError;
    return;
  }

  await upsertStripeSubscriptionToDb(
    adminClient,
    {
      ...sub,
      metadata: { ...sub.metadata, org_id: orgId },
    },
    {
      audit: { source: "gridmaster_sync" },
    },
  );
}

async function loadPreviousSubscriptionForAudit(
  serviceClient: BillingSyncClient,
  orgId: string,
): Promise<PreviousSubscriptionRow | null> {
  try {
    const { data, error } = await serviceClient
      .from("subscriptions")
      .select(
        "stripe_subscription_id, status, quantity, current_period_end, cancel_at, canceled_at, trial_end",
      )
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      logger.warn({ error, orgId }, "Could not load previous subscription state for audit");
      return null;
    }
    return (data as PreviousSubscriptionRow | null) ?? null;
  } catch (error) {
    logger.warn({ error, orgId }, "Could not load previous subscription state for audit");
    return null;
  }
}

async function resolveStripeSubscriptionOrgId(
  serviceClient: BillingSyncClient,
  input: { subscriptionId: string; customerId: string | null },
): Promise<string | null> {
  try {
    const { data: subscription, error: subscriptionError } = await serviceClient
      .from("subscriptions")
      .select("org_id")
      .eq("stripe_subscription_id", input.subscriptionId)
      .maybeSingle();
    if (subscriptionError) {
      logger.warn(
        { error: subscriptionError, subscriptionId: input.subscriptionId },
        "Could not resolve subscription organization from local subscription row",
      );
    }
    const subscriptionOrgId = (subscription as { org_id?: string | null } | null)?.org_id;
    if (subscriptionOrgId) return subscriptionOrgId;

    if (!input.customerId) return null;
    return await resolveStripeCustomerOrgId(serviceClient, input.customerId);
  } catch (error) {
    logger.warn(
      { error, subscriptionId: input.subscriptionId, customerId: input.customerId },
      "Could not resolve subscription organization",
    );
    return null;
  }
}

async function resolveStripeCustomerOrgId(
  serviceClient: BillingSyncClient,
  customerId: string,
): Promise<string | null> {
  try {
    const { data: org, error } = await serviceClient
      .from("organizations")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) {
      logger.warn({ error, customerId }, "Could not resolve Stripe customer to an organization");
      return null;
    }
    return (org as { id?: string | null } | null)?.id ?? null;
  } catch (error) {
    logger.warn({ error, customerId }, "Could not resolve Stripe customer to an organization");
    return null;
  }
}

function changed<T>(previous: T | null | undefined, next: T | null | undefined) {
  return (previous ?? null) !== (next ?? null);
}

function billingAuditAction(input: {
  previous: PreviousSubscriptionRow | null;
  next: PreviousSubscriptionRow;
}): string | null {
  const { previous, next } = input;
  if (!previous?.stripe_subscription_id) return "billing.subscription_created";
  if (next.status === "canceled" && previous.status !== "canceled") {
    return "billing.subscription_canceled";
  }
  if (next.canceled_at && changed(previous.canceled_at, next.canceled_at)) {
    return "billing.subscription_canceled";
  }
  if (next.cancel_at && changed(previous.cancel_at, next.cancel_at)) {
    return "billing.subscription_cancel_scheduled";
  }

  const meaningfulChange =
    changed(previous.status, next.status) ||
    changed(previous.quantity, next.quantity) ||
    changed(previous.current_period_end, next.current_period_end) ||
    changed(previous.trial_end, next.trial_end) ||
    changed(previous.cancel_at, next.cancel_at) ||
    changed(previous.canceled_at, next.canceled_at);

  return meaningfulChange ? "billing.subscription_updated" : null;
}

async function writeStripeSubscriptionAuditLog(
  serviceClient: BillingSyncClient,
  input: {
    orgId: string;
    previous: PreviousSubscriptionRow | null;
    next: PreviousSubscriptionRow;
    source: "stripe_webhook" | "checkout_sync" | "gridmaster_sync";
    actor?: {
      id: string;
      email?: string | null;
    };
    stripeEventId?: string;
    stripeEventType?: string;
  },
): Promise<void> {
  const action = billingAuditAction(input);
  if (!action) return;

  try {
    const { error } = await serviceClient.from("audit_log").insert({
      org_id: input.orgId,
      actor_id: input.actor?.id ?? null,
      actor_email: input.actor?.email ?? (input.source === "stripe_webhook" ? "Stripe" : null),
      action,
      resource_type: "billing",
      resource_id: input.next.stripe_subscription_id,
      details: {
        initiated_by: input.source === "stripe_webhook" ? "stripe" : input.source,
        stripe_event_id: input.stripeEventId,
        stripe_event_type: input.stripeEventType,
        status: input.next.status,
        previous_status: input.previous?.status ?? null,
        quantity: input.next.quantity,
        previous_quantity: input.previous?.quantity ?? null,
        cancel_at: input.next.cancel_at,
        previous_cancel_at: input.previous?.cancel_at ?? null,
        canceled_at: input.next.canceled_at,
        current_period_end: input.next.current_period_end,
        trial_end: input.next.trial_end,
      },
    });
    if (error) {
      logger.warn({ error, orgId: input.orgId, action }, "Billing audit log write failed");
    }
  } catch (error) {
    logger.warn({ error, orgId: input.orgId, action }, "Billing audit log write failed");
  }
}

export async function writeStripePaymentFailedAuditLog(
  serviceClient: BillingSyncClient,
  invoice: Stripe.Invoice,
  options: { stripeEventId?: string; stripeEventType?: string } = {},
): Promise<{ orgId: string } | null> {
  const customerId = stripeCustomerId(invoice.customer ?? null);
  if (!customerId) return null;

  try {
    const { data, error: orgError } = await serviceClient
      .from("organizations")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (orgError || !data?.id) {
      logger.warn(
        { error: orgError, customerId, invoiceId: invoice.id },
        "Could not resolve Stripe invoice payment failure to an organization",
      );
      return null;
    }

    const { error } = await serviceClient.from("audit_log").insert({
      org_id: data.id,
      actor_id: null,
      actor_email: "Stripe",
      action: "billing.payment_failed",
      resource_type: "billing",
      resource_id: invoice.id,
      details: {
        initiated_by: "stripe",
        stripe_event_id: options.stripeEventId,
        stripe_event_type: options.stripeEventType,
        invoice_id: invoice.id,
        customer_id: customerId,
        amount_due: invoice.amount_due ?? null,
        currency: invoice.currency ?? null,
      },
    });
    if (error) {
      logger.warn(
        { error, orgId: data.id, invoiceId: invoice.id },
        "Billing audit log write failed",
      );
    }
    return { orgId: data.id as string };
  } catch (error) {
    logger.warn({ error, customerId, invoiceId: invoice.id }, "Billing audit log write failed");
    return null;
  }
}

export async function writeStripePaymentSucceededAuditLog(
  serviceClient: BillingSyncClient,
  invoice: Stripe.Invoice,
  options: { stripeEventId?: string; stripeEventType?: string } = {},
): Promise<void> {
  const customerId = stripeCustomerId(invoice.customer ?? null);
  if (!customerId) return;

  await writeStripeCustomerBillingActivityLog(serviceClient, {
    customerId,
    action: "billing.payment_succeeded",
    resourceId: invoice.id,
    details: {
      invoice_id: invoice.id,
      amount_paid: invoice.amount_paid ?? null,
      currency: invoice.currency ?? null,
    },
    stripeEventId: options.stripeEventId,
    stripeEventType: options.stripeEventType,
  });
}

export async function writeStripeCustomerBillingActivityLog(
  serviceClient: BillingSyncClient,
  input: {
    customerId: string;
    action: StripeCustomerActivityAction;
    resourceId?: string | null;
    details?: Record<string, unknown>;
    stripeEventId?: string;
    stripeEventType?: string;
  },
): Promise<void> {
  const orgId = await resolveStripeCustomerOrgId(serviceClient, input.customerId);
  if (!orgId) {
    logger.warn(
      { customerId: input.customerId, action: input.action },
      "Could not resolve Stripe customer activity to an organization",
    );
    return;
  }

  try {
    const { error } = await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: null,
      actor_email: "Stripe",
      action: input.action,
      resource_type: "billing",
      resource_id: input.resourceId ?? input.customerId,
      details: {
        initiated_by: "stripe",
        stripe_event_id: input.stripeEventId,
        stripe_event_type: input.stripeEventType,
        customer_id: input.customerId,
        ...input.details,
      },
    });
    if (error) {
      logger.warn({ error, orgId, action: input.action }, "Billing audit log write failed");
    }
  } catch (error) {
    logger.warn({ error, orgId, action: input.action }, "Billing audit log write failed");
  }
}
