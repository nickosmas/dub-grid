import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

type HistoryClient = Pick<SupabaseClient, "from">;

export type SeatHistorySource = "stripe" | "checkout" | "gridmaster" | "backfill";

function unixToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

// History never fails the billing change it records: the change has already
// happened, and a retry would find nothing new to record.
function reportHistoryError(error: unknown, context: Record<string, unknown>) {
  Sentry.captureException(error, { extra: { context: "billing-history", ...context } });
  logger.error({ err: error, ...context }, "Billing history write failed");
}

/** Adds a seat-history row; the table is append-only. */
export async function recordSeatChange(
  client: HistoryClient,
  input: {
    orgId: string;
    seats: number;
    billableAppUsers?: number | null;
    source: SeatHistorySource;
  },
): Promise<void> {
  try {
    const { error } = await client.from("subscription_seat_history").insert({
      org_id: input.orgId,
      seats: input.seats,
      billable_app_users: input.billableAppUsers ?? null,
      source: input.source,
    });
    if (error) throw error;
  } catch (error) {
    reportHistoryError(error, { orgId: input.orgId, table: "subscription_seat_history" });
  }
}

/** Adds a paid or failed invoice once; a redelivered webhook adds nothing. */
export async function recordInvoiceEvent(
  client: HistoryClient,
  input: {
    orgId: string;
    invoice: Stripe.Invoice;
    kind: "paid" | "failed";
    occurredAt: Date;
  },
): Promise<void> {
  const { invoice } = input;
  if (!invoice.id || !invoice.currency) return;
  try {
    const { error } = await client.from("billing_invoice_events").upsert(
      {
        org_id: input.orgId,
        stripe_invoice_id: invoice.id,
        kind: input.kind,
        amount_cents: (input.kind === "paid" ? invoice.amount_paid : invoice.amount_due) ?? 0,
        currency: invoice.currency,
        period_start: unixToIso(invoice.period_start),
        period_end: unixToIso(invoice.period_end),
        occurred_at: input.occurredAt.toISOString(),
      },
      // Insert-or-nothing: the service role may add rows but never change them.
      { onConflict: "stripe_invoice_id,kind", ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (error) {
    reportHistoryError(error, { orgId: input.orgId, invoiceId: invoice.id });
  }
}
