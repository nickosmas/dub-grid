import {
  BILLING_POLICY_LIMITS,
  PAYMENT_ATTENTION_STATUSES,
  billingPolicyOverridesFromRow,
  resolveBillingPolicy,
} from "@dubgrid/domain";
import { BILLING_POLICY_OVERRIDE_SELECT, getPlatformBillingPolicy } from "@/lib/billing-policy";
import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { serverEnv } from "@/lib/env.server";
import { bearerMatchesSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
// The cron runs daily, so a lock is alerted on the first run after it; the
// window covers a missed run without alerting organizations locked long ago.
const LOCK_ALERT_WINDOW_DAYS = 3;

function lockedRecently(lockedAt: number, now: Date): boolean {
  return lockedAt <= now.getTime() && lockedAt > now.getTime() - LOCK_ALERT_WINDOW_DAYS * DAY_MS;
}

// Runs daily via the vercel.json crons block. Three passes:
//   1. Trial entering its reminder window → billing_trial_ending_soon
//   2. Trial already expired, no active subscription → billing_trial_expired,
//      and billing_access_locked once its grace has run out
//   3. Payment grace run out → billing_access_locked
//
// Idempotency lives inside the dispatcher (hasExistingNotification): we dedupe
// on (org, type, metadata.periodKey | trialEndsAt | lockedAt) so re-running
// the cron the next day finds the prior row and skips.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject any
// request that doesn't carry it; the route is otherwise unauthenticated.

export async function GET(req: NextRequest) {
  const secret = serverEnv?.CRON_SECRET;
  if (!secret) {
    logger.error("CRON_SECRET not configured — refusing to run trial-expiry");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!bearerMatchesSecret(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: API_ERRORS.UNAUTHORIZED }, { status: 401 });
  }
  if (!(await isFeatureEnabled("cron_trial_expiry"))) {
    // 200, not 503 — this is an intentional gridmaster kill-switch flip, not a
    // misconfiguration, and a status-code-only monitor shouldn't treat it as one.
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const db = getServiceClient();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const latestWindowEnd = new Date(startOfToday);
  latestWindowEnd.setUTCDate(
    latestWindowEnd.getUTCDate() + BILLING_POLICY_LIMITS.trialReminderDays.max + 1,
  );

  // ── Pass 1: trials entering their reminder window today (UTC) ──────────
  // Each organization's window is its own (the platform default or its
  // override), the same window the Settings reminder uses, so fetch every
  // trial that could be in one and pick per organization.
  const { data: endingSoon, error: endingError } = await db
    .from("organizations")
    .select(`id, trial_ends_at, ${BILLING_POLICY_OVERRIDE_SELECT}`)
    .gte("trial_ends_at", startOfToday.toISOString())
    .lt("trial_ends_at", latestWindowEnd.toISOString())
    // An organization moved off its trial keeps the old end date; it is not
    // ending anything.
    .eq("subscription_status", "trialing")
    .is("archived_at", null)
    .is("suspended_at", null)
    // A paused trial isn't counting down.
    .is("billing_paused_at", null);
  if (endingError) {
    logger.error({ error: endingError }, "trial-expiry: ending-soon query failed");
  }

  const platformPolicy = await getPlatformBillingPolicy(db);
  let endingDispatched = 0;
  for (const org of (endingSoon ?? []) as Array<Record<string, unknown>>) {
    const trialEndsAt = org.trial_ends_at as string | null;
    if (!trialEndsAt) continue;
    const { values } = resolveBillingPolicy(platformPolicy, billingPolicyOverridesFromRow(org));
    const windowStart = new Date(startOfToday);
    windowStart.setUTCDate(windowStart.getUTCDate() + values.trialReminderDays);
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    const endsAt = Date.parse(trialEndsAt);
    if (endsAt < windowStart.getTime() || endsAt >= windowEnd.getTime()) continue;
    await dispatchNotificationEvent("trial-expiry-cron", {
      action: "billing_trial_ending_soon",
      orgId: org.id as string,
      trialEndsAt,
      periodKey: windowStart.toISOString().slice(0, 10), // YYYY-MM-DD bucket
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
    .select(`id, trial_ends_at, subscription_status, ${BILLING_POLICY_OVERRIDE_SELECT}`)
    .lt("trial_ends_at", now.toISOString())
    .in("subscription_status", ["trialing", "trial_pending"])
    .is("archived_at", null)
    .is("suspended_at", null)
    .is("billing_paused_at", null);
  if (expiredError) {
    logger.error({ error: expiredError }, "trial-expiry: expired query failed");
  }

  let expiredDispatched = 0;
  let lockedDispatched = 0;
  for (const org of (expired ?? []) as Array<Record<string, unknown>>) {
    const trialEndsAt = org.trial_ends_at as string | null;
    if (!trialEndsAt) continue;
    await dispatchNotificationEvent("trial-expiry-cron", {
      action: "billing_trial_expired",
      orgId: org.id as string,
      trialEndsAt,
    });
    expiredDispatched += 1;
    const { values } = resolveBillingPolicy(platformPolicy, billingPolicyOverridesFromRow(org));
    const lockedAt = Date.parse(trialEndsAt) + values.trialGraceDays * DAY_MS;
    if (lockedRecently(lockedAt, now)) {
      await dispatchNotificationEvent("trial-expiry-cron", {
        action: "billing_access_locked",
        orgId: org.id as string,
        reason: "trial",
        lockedAt: new Date(lockedAt).toISOString(),
      });
      lockedDispatched += 1;
    }
  }

  // ── Pass 3: payment grace run out ──────────────────────────────────────
  // A start older than the longest grace plus the alert window can't have
  // locked recently, so it isn't fetched.
  const oldestStart = new Date(
    now.getTime() - (BILLING_POLICY_LIMITS.paymentGraceDays.max + LOCK_ALERT_WINDOW_DAYS) * DAY_MS,
  );
  const { data: overdue, error: overdueError } = await db
    .from("organizations")
    .select(`id, payment_grace_started_at, ${BILLING_POLICY_OVERRIDE_SELECT}`)
    .gte("payment_grace_started_at", oldestStart.toISOString())
    .in("subscription_status", [...PAYMENT_ATTENTION_STATUSES])
    .is("archived_at", null)
    .is("suspended_at", null)
    .is("billing_paused_at", null);
  if (overdueError) {
    logger.error({ error: overdueError }, "trial-expiry: payment grace query failed");
  }
  for (const org of (overdue ?? []) as Array<Record<string, unknown>>) {
    const startedAt = org.payment_grace_started_at as string | null;
    if (!startedAt) continue;
    const { values } = resolveBillingPolicy(platformPolicy, billingPolicyOverridesFromRow(org));
    const lockedAt = Date.parse(startedAt) + values.paymentGraceDays * DAY_MS;
    if (!lockedRecently(lockedAt, now)) continue;
    await dispatchNotificationEvent("trial-expiry-cron", {
      action: "billing_access_locked",
      orgId: org.id as string,
      reason: "payment",
      lockedAt: new Date(lockedAt).toISOString(),
    });
    lockedDispatched += 1;
  }

  return NextResponse.json({
    ok: true,
    endingSoonDispatched: endingDispatched,
    expiredDispatched,
    lockedDispatched,
  });
}
