import { NextRequest, NextResponse } from "next/server";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// Runs daily via the vercel.json crons block. Two passes:
//   1. Trial ending in ~3 days → billing_trial_ending_soon
//   2. Trial already expired, no active subscription → billing_trial_expired
//
// Idempotency lives inside the dispatcher (hasBillingNotification): we dedupe
// on (org, type, metadata.periodKey | metadata.trialEndsAt) so re-running the
// cron the next day finds the prior row and skips.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject any
// request that doesn't carry it; the route is otherwise unauthenticated.

const ENDING_WINDOW_DAYS = 3;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("CRON_SECRET not configured — refusing to run trial-expiry");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const now = new Date();
  const startOfWindow = new Date(now);
  startOfWindow.setUTCHours(0, 0, 0, 0);
  const endingTarget = new Date(startOfWindow);
  endingTarget.setUTCDate(endingTarget.getUTCDate() + ENDING_WINDOW_DAYS);
  const endingTargetEnd = new Date(endingTarget);
  endingTargetEnd.setUTCDate(endingTargetEnd.getUTCDate() + 1);

  // ── Pass 1: trials ending in [today+3, today+4) UTC ────────────────────
  const { data: endingSoon, error: endingError } = await db
    .from("organizations")
    .select("id, trial_ends_at")
    .gte("trial_ends_at", endingTarget.toISOString())
    .lt("trial_ends_at", endingTargetEnd.toISOString())
    .is("archived_at", null)
    .is("suspended_at", null);
  if (endingError) {
    logger.error({ error: endingError }, "trial-expiry: ending-soon query failed");
  }

  const periodKey = endingTarget.toISOString().slice(0, 10); // YYYY-MM-DD bucket
  let endingDispatched = 0;
  for (const org of endingSoon ?? []) {
    const trialEndsAt = org.trial_ends_at as string | null;
    if (!trialEndsAt) continue;
    await dispatchNotificationEvent("trial-expiry-cron", {
      action: "billing_trial_ending_soon",
      orgId: org.id as string,
      trialEndsAt,
      periodKey,
    });
    endingDispatched += 1;
  }

  // ── Pass 2: trials expired, no paid status ─────────────────────────────
  // 'trialing' here means "trial hasn't been moved off trialing yet". Once a
  // user pays, Stripe flips subscription_status to 'active' and this row is
  // excluded. We re-dispatch each day for orgs that never pay; the dispatcher
  // dedupes on trialEndsAt so the same expiry only alerts once.
  const { data: expired, error: expiredError } = await db
    .from("organizations")
    .select("id, trial_ends_at, subscription_status")
    .lt("trial_ends_at", now.toISOString())
    .in("subscription_status", ["trialing", "trial_pending"])
    .is("archived_at", null)
    .is("suspended_at", null);
  if (expiredError) {
    logger.error({ error: expiredError }, "trial-expiry: expired query failed");
  }

  let expiredDispatched = 0;
  for (const org of expired ?? []) {
    const trialEndsAt = org.trial_ends_at as string | null;
    if (!trialEndsAt) continue;
    await dispatchNotificationEvent("trial-expiry-cron", {
      action: "billing_trial_expired",
      orgId: org.id as string,
      trialEndsAt,
    });
    expiredDispatched += 1;
  }

  return NextResponse.json({
    ok: true,
    endingSoonDispatched: endingDispatched,
    expiredDispatched,
  });
}
