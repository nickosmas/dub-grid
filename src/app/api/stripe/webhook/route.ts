import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import logger from "@/lib/logger";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function upsertSubscription(sub: Stripe.Subscription) {
  const supabase = getServiceClient();
  const orgId = sub.metadata?.org_id;
  if (!orgId) {
    logger.warn({ subscriptionId: sub.id }, "Subscription missing org_id metadata");
    return;
  }

  // Update subscriptions table
  const { error: subError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        org_id: orgId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.toString(),
        status: sub.status,
        price_id: sub.items.data[0]?.price?.id ?? null,
        quantity: sub.items.data[0]?.quantity ?? 1,
        current_period_start: sub.items.data[0]?.current_period_start
          ? new Date(sub.items.data[0].current_period_start * 1000).toISOString()
          : null,
        current_period_end: sub.items.data[0]?.current_period_end
          ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
          : null,
        cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
        canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
        trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
  if (subError) logger.error({ error: subError }, "Failed to upsert subscription");

  // Sync status to organizations table
  const { error: orgError } = await supabase
    .from("organizations")
    .update({
      subscription_status: sub.status,
      subscription_seats: sub.items.data[0]?.quantity ?? null,
    })
    .eq("id", orgId);
  if (orgError) logger.error({ error: orgError }, "Failed to update org subscription status");
}

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    logger.warn({ error: err }, "Stripe webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  logger.info({ type: event.type, id: event.id }, "Stripe webhook received");

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.warn(
          { customerId: invoice.customer, invoiceId: invoice.id },
          "Invoice payment failed",
        );
        break;
      }
      default:
        logger.info({ type: event.type }, "Unhandled Stripe event type");
    }
  } catch (err) {
    logger.error({ error: err, type: event.type }, "Error processing Stripe webhook");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
