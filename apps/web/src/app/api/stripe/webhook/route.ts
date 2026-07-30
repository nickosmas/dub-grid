import { NextRequest, NextResponse } from "next/server";
import {
  getStripe,
  upsertStripeSubscriptionToDb,
  writeStripeCustomerBillingActivityLog,
  writeStripePaymentFailedAuditLog,
  writeStripePaymentSucceededAuditLog,
  requireStripeEnabled,
} from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

function stripeObjectId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function upsertSubscription(sub: Stripe.Subscription, event: Stripe.Event) {
  const supabase = getServiceClient();
  await upsertStripeSubscriptionToDb(supabase, sub, {
    audit: {
      source: "stripe_webhook",
      stripeEventId: event.id,
      stripeEventType: event.type,
    },
  });
}

export async function POST(req: NextRequest) {
  // 503 so Stripe retries the event later rather than dropping it.
  const stripeDisabled = await requireStripeEnabled();
  if (stripeDisabled) return stripeDisabled;

  const stripe = getStripe();
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

  // Replay idempotency (M-4): Stripe redelivers events. Claim the event id
  // first; a unique-violation means we already processed it → ack and skip so
  // we don't write duplicate audit/activity rows. Fail open if the ledger table
  // isn't present yet (pre-migration) so the webhook keeps working.
  {
    const { error: claimError } = await getServiceClient()
      .from("stripe_processed_events")
      .insert({ event_id: event.id });
    if (claimError) {
      if (claimError.code === "23505") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      logger.warn(
        { error: claimError, id: event.id },
        "Stripe event dedup ledger unavailable — processing without replay guard",
      );
    }
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub, event);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // The audit-log helper resolves the customer to an org and returns it.
        // We piggyback off that lookup to fan out a billing_payment_failed
        // alert to the org's super_admins. The dispatcher dedupes on
        // stripeInvoiceId so Stripe retries don't multiply rows. A separate
        // `customer.subscription.updated` event will follow when Stripe flips
        // the subscription to past_due; that path also writes a notification
        // via the notify_gridmasters_of_org_event DB trigger, but only on the
        // *first* transition (past_due/unpaid guard), so the two paths don't
        // double up.
        const result = await writeStripePaymentFailedAuditLog(getServiceClient(), invoice, {
          stripeEventId: event.id,
          stripeEventType: event.type,
        });
        logger.warn(
          { customerId: invoice.customer, invoiceId: invoice.id },
          "Invoice payment failed",
        );
        if (result?.orgId && invoice.id) {
          void dispatchNotificationEvent("stripe-webhook", {
            action: "billing_payment_failed",
            orgId: result.orgId,
            stripeInvoiceId: invoice.id,
            amountDue: invoice.amount_due ?? null,
            currency: invoice.currency ?? null,
          });
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await writeStripePaymentSucceededAuditLog(getServiceClient(), invoice, {
          stripeEventId: event.id,
          stripeEventType: event.type,
        });
        break;
      }
      case "customer.updated": {
        const customer = event.data.object as Stripe.Customer;
        await writeStripeCustomerBillingActivityLog(getServiceClient(), {
          customerId: customer.id,
          action: "billing.billing_details_updated",
          resourceId: customer.id,
          stripeEventId: event.id,
          stripeEventType: event.type,
        });
        break;
      }
      case "payment_method.attached":
      case "payment_method.detached":
      case "payment_method.updated": {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        const previous = event.data.previous_attributes as
          Partial<Stripe.PaymentMethod> | undefined;
        const customerId =
          stripeObjectId(paymentMethod.customer) ?? stripeObjectId(previous?.customer);
        if (customerId) {
          await writeStripeCustomerBillingActivityLog(getServiceClient(), {
            customerId,
            action: "billing.payment_method_updated",
            resourceId: paymentMethod.id,
            details: {
              payment_method_type: paymentMethod.type,
            },
            stripeEventId: event.id,
            stripeEventType: event.type,
          });
        }
        break;
      }
      default:
        logger.info({ type: event.type }, "Unhandled Stripe event type");
    }
  } catch (err) {
    Sentry.captureException(err, { extra: { eventType: event.type, eventId: event.id } });
    logger.error({ error: err, type: event.type }, "Error processing Stripe webhook");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
