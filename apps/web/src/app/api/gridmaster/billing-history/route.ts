import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import {
  summarizeBillingHistory,
  type InvoiceEventRow,
  type SeatHistoryRow,
} from "@/features/gridmaster/billing-history";
import logger from "@/lib/logger";

const orgIdSchema = z.string().uuid();
const REPORT_MONTHS = 12;
const ORG_SEAT_ROWS = 20;
// Seat history gains a row per change, so every row fits; the cap only
// guards against a runaway writer.
const SEAT_ROW_CAP = 10_000;

export async function GET(req: NextRequest) {
  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;

  try {
    const db = getServiceClient();
    const orgIdParam = req.nextUrl.searchParams.get("orgId");
    if (orgIdParam !== null) {
      const orgId = orgIdSchema.safeParse(orgIdParam);
      if (!orgId.success) {
        return NextResponse.json({ error: "Invalid organization." }, { status: 400 });
      }
      const { data, error } = await db
        .from("subscription_seat_history")
        .select("seats, billable_app_users, source, recorded_at")
        .eq("org_id", orgId.data)
        .order("recorded_at", { ascending: false })
        .limit(ORG_SEAT_ROWS);
      if (error) throw error;
      return NextResponse.json({ seats: data ?? [] });
    }

    const now = new Date();
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (REPORT_MONTHS - 1), 1),
    );
    const [invoices, firstInvoice, seats] = await Promise.all([
      db
        .from("billing_invoice_events")
        .select("org_id, kind, amount_cents, currency, occurred_at")
        .gte("occurred_at", windowStart.toISOString()),
      db
        .from("billing_invoice_events")
        .select("occurred_at")
        .order("occurred_at", { ascending: true })
        .limit(1),
      db
        .from("subscription_seat_history")
        .select("org_id, seats, recorded_at")
        .order("recorded_at", { ascending: true })
        .limit(SEAT_ROW_CAP),
    ]);
    for (const result of [invoices, firstInvoice, seats]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json(
      summarizeBillingHistory(
        (invoices.data ?? []) as InvoiceEventRow[],
        (seats.data ?? []) as SeatHistoryRow[],
        {
          now,
          months: REPORT_MONTHS,
          firstRecordedAt:
            (firstInvoice.data?.[0] as { occurred_at?: string } | undefined)?.occurred_at ?? null,
        },
      ),
    );
  } catch (error) {
    logger.error({ err: error, path: "/api/gridmaster/billing-history" }, "billing history failed");
    return NextResponse.json(
      { error: "We couldn't load the billing history. Refresh and try again." },
      { status: 500 },
    );
  }
}
