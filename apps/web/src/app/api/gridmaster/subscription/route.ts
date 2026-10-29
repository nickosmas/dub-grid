import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  BILLING_POLICY_LIMITS,
  BILLING_POLICY_OVERRIDE_SELECT,
  TRIAL_EXPIRED_STATUS,
  billingHoldControls,
  isLiveSubscriptionStatus,
  resumedTrialEndsAt,
  trialControls,
} from "@dubgrid/domain";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import {
  cancelSubscription,
  extendTrial,
  invalidateOrganizationBillingCache,
  pauseSubscriptionCollection,
  resumeSubscriptionCollection,
  scheduleSubscriptionCancellation,
  syncSubscriptionSeats,
} from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase-service";
import { getOrgBillingPolicy } from "@/lib/billing-policy";
import { recordSeatChange } from "@/lib/billing-history";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { countBillableAppUsers } from "@/features/billing/server";

const orgIdSchema = z.string().uuid();
const billingStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
]);

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    orgId: orgIdSchema,
    action: z.literal("set_trial_days"),
    trialDays: z.number().int().min(1),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("end_trial"),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("expire_trial"),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("cancel"),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("cancel_at_period_end"),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("sync_seats"),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("override_status"),
    status: billingStatusSchema,
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("pause_billing"),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("resume_billing"),
  }),
  z.object({
    orgId: orgIdSchema,
    action: z.literal("extend_grace"),
    days: z.number().int().min(1).max(BILLING_POLICY_LIMITS.trialGraceDays.max),
    reason: z.string().trim().min(1).max(500),
  }),
]);

const HOLD_SELECT = `subscription_status, trial_started_at, trial_ends_at, suspended_at, billing_paused_at, payment_grace_started_at, ${BILLING_POLICY_OVERRIDE_SELECT}`;

/** Runs a database write and fails the action, before any audit row, if it failed. */
async function write(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query;
  if (error) throw error;
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // Input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });

  const { orgId, action } = parsed.data;
  const admin = getServiceClient();

  // Each of these locks an organization, rewrites its billing outright, or
  // keeps it open without payment.
  if (
    action === "expire_trial" ||
    action === "cancel" ||
    action === "override_status" ||
    action === "pause_billing" ||
    action === "extend_grace"
  ) {
    const assurance = await requireSensitiveActionAuth(req);
    if ("response" in assurance) return assurance.response;
  }

  const { limited, reset, misconfigured } = await checkRateLimit(
    apiLimiter,
    `gridmaster-subscription:${user.id}:${orgId}`,
  );
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: API_ERRORS.RATE_LIMITED },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds(reset)),
        },
      },
    );
  }

  try {
    // Get org's subscription
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("org_id", orgId)
      .single();

    if (action === "set_trial_days" || action === "end_trial" || action === "expire_trial") {
      const { data: orgRow, error: orgError } = await admin
        .from("organizations")
        .select("subscription_status, trial_started_at, trial_ends_at, billing_paused_at")
        .eq("id", orgId)
        .single();
      if (orgError || !orgRow) {
        return NextResponse.json({ error: "Organization not found." }, { status: 404 });
      }
      const previousTrialEndsAt = (orgRow.trial_ends_at as string | null) ?? null;
      const controls = trialControls({
        status: orgRow.subscription_status as string | null,
        trialEndsAt: previousTrialEndsAt,
        hasStripeSubscription: Boolean(sub?.stripe_subscription_id),
        billingPausedAt: (orgRow.billing_paused_at as string | null) ?? null,
      });
      const allowed =
        action === "set_trial_days"
          ? controls.change
          : action === "end_trial"
            ? controls.end
            : controls.expire;
      if (!allowed) {
        return NextResponse.json(
          { error: controls.reason ?? "That trial change doesn't apply to this organization." },
          { status: 409 },
        );
      }

      const now = new Date();
      // A trial that never started gets its start stamped with the change.
      const trialStartedAt = (orgRow.trial_started_at as string | null) ?? now.toISOString();
      let trialEndsAt: string;
      let status: string;
      if (action === "set_trial_days") {
        const newEnd = new Date(now.getTime() + parsed.data.trialDays * 86_400_000);
        if (sub?.stripe_subscription_id) await extendTrial(sub.stripe_subscription_id, newEnd);
        trialEndsAt = newEnd.toISOString();
        status = "trialing";
      } else if (action === "end_trial") {
        trialEndsAt = now.toISOString();
        status = "trialing";
      } else {
        // Keep a past end date: the trial really ended then.
        trialEndsAt =
          previousTrialEndsAt && Date.parse(previousTrialEndsAt) < now.getTime()
            ? previousTrialEndsAt
            : now.toISOString();
        status = TRIAL_EXPIRED_STATUS;
      }

      await write(
        admin
          .from("organizations")
          .update({
            trial_started_at: trialStartedAt,
            trial_ends_at: trialEndsAt,
            subscription_status: status,
          })
          .eq("id", orgId),
      );
      await invalidateOrganizationBillingCache(orgId);
      await writeGridmasterAuditLog({
        serviceClient: admin,
        actor: user,
        action:
          action === "set_trial_days"
            ? "billing.trial_changed"
            : action === "end_trial"
              ? "billing.trial_ended"
              : "billing.trial_expired",
        resourceType: "organization",
        resourceId: orgId,
        orgId,
        details: {
          previous_trial_ends_at: previousTrialEndsAt,
          trial_ends_at: trialEndsAt,
          ...(action === "set_trial_days" ? { days: parsed.data.trialDays } : {}),
        },
        request: req,
      });
      return NextResponse.json({ success: true, trialEndsAt });
    }

    if (action === "pause_billing" || action === "resume_billing" || action === "extend_grace") {
      return await holdAction(req, parsed.data, {
        admin,
        user,
        stripeSubscriptionId: sub?.stripe_subscription_id ?? null,
      });
    }

    if (action === "cancel") {
      if (!sub?.stripe_subscription_id) {
        return NextResponse.json(
          { error: "There's no subscription to cancel. Expire the trial instead." },
          { status: 409 },
        );
      }
      await cancelSubscription(sub.stripe_subscription_id);
      await write(
        admin.from("organizations").update({ subscription_status: "canceled" }).eq("id", orgId),
      );
      await invalidateOrganizationBillingCache(orgId);
      await writeGridmasterAuditLog({
        serviceClient: admin,
        actor: user,
        action: "billing.subscription_canceled",
        resourceType: "organization",
        resourceId: orgId,
        orgId,
        request: req,
      });
      return NextResponse.json({ success: true });
    }

    if (action === "cancel_at_period_end") {
      if (!sub?.stripe_subscription_id) {
        return NextResponse.json({ error: "Stripe subscription required" }, { status: 400 });
      }
      const scheduledSubscription = await scheduleSubscriptionCancellation(
        sub.stripe_subscription_id,
      );
      const item = scheduledSubscription.items.data[0];
      const cancelAt = scheduledSubscription.cancel_at
        ? new Date(scheduledSubscription.cancel_at * 1000).toISOString()
        : item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null;
      const canceledAt = scheduledSubscription.canceled_at
        ? new Date(scheduledSubscription.canceled_at * 1000).toISOString()
        : null;
      const currentPeriodEnd = item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null;

      await write(
        admin
          .from("subscriptions")
          .update({
            status: scheduledSubscription.status,
            current_period_end: currentPeriodEnd,
            cancel_at: cancelAt,
            canceled_at: canceledAt,
            updated_at: new Date().toISOString(),
          })
          .eq("org_id", orgId),
      );
      await write(
        admin
          .from("organizations")
          .update({ subscription_status: scheduledSubscription.status })
          .eq("id", orgId),
      );
      await invalidateOrganizationBillingCache(orgId);
      await writeGridmasterAuditLog({
        serviceClient: admin,
        actor: user,
        action: "billing.subscription_cancel_scheduled",
        resourceType: "organization",
        resourceId: orgId,
        orgId,
        details: { cancel_at: cancelAt },
        request: req,
      });
      return NextResponse.json({ success: true });
    }

    if (action === "sync_seats") {
      if (!sub?.stripe_subscription_id) {
        return NextResponse.json({ error: "Stripe subscription required" }, { status: 400 });
      }
      const billableAppUsers = await countBillableAppUsers(admin, orgId);
      const seats = Math.max(billableAppUsers, 1);
      await syncSubscriptionSeats(sub.stripe_subscription_id, seats);
      await write(
        admin
          .from("subscriptions")
          .update({ quantity: seats, updated_at: new Date().toISOString() })
          .eq("org_id", orgId),
      );
      await write(
        admin.from("organizations").update({ subscription_seats: seats }).eq("id", orgId),
      );
      await recordSeatChange(admin, { orgId, seats, billableAppUsers, source: "gridmaster" });
      // Seats feed the access check's cached organization like any billing field.
      await invalidateOrganizationBillingCache(orgId);
      await writeGridmasterAuditLog({
        serviceClient: admin,
        actor: user,
        action: "billing.seats_synced",
        resourceType: "organization",
        resourceId: orgId,
        orgId,
        details: { seats },
        request: req,
      });
      return NextResponse.json({ success: true });
    }

    if (action === "override_status") {
      const { status, reason } = parsed.data;
      const { data: orgRow, error: orgError } = await admin
        .from("organizations")
        .select("subscription_status")
        .eq("id", orgId)
        .single();
      if (orgError || !orgRow) {
        return NextResponse.json({ error: "Organization not found." }, { status: 404 });
      }
      // Only the status changes; the trial keeps its own dates, which Change
      // trial sets.
      // A manual status never starts a payment deadline; the next Stripe event
      // for a subscription that needs payment does.
      await write(
        admin
          .from("organizations")
          .update({ subscription_status: status, payment_grace_started_at: null })
          .eq("id", orgId),
      );
      await invalidateOrganizationBillingCache(orgId);
      await writeGridmasterAuditLog({
        serviceClient: admin,
        actor: user,
        action: "billing.status_overridden",
        resourceType: "organization",
        resourceId: orgId,
        orgId,
        details: {
          previous_status: (orgRow.subscription_status as string | null) ?? null,
          new_status: status,
          reason,
        },
        request: req,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-subscription" } });
    logger.error({ err, path: "/api/gridmaster/subscription" }, "Subscription action failed");
    return NextResponse.json(
      { error: "We couldn't complete that billing action. Try again." },
      { status: 500 },
    );
  }
}

type HoldBody = Extract<
  z.infer<typeof bodySchema>,
  { action: "pause_billing" | "resume_billing" | "extend_grace" }
>;

async function holdAction(
  req: NextRequest,
  body: HoldBody,
  context: {
    admin: ReturnType<typeof getServiceClient>;
    user: { id: string; email?: string | null };
    stripeSubscriptionId: string | null;
  },
): Promise<NextResponse> {
  const { admin, user, stripeSubscriptionId } = context;
  const { orgId } = body;
  const { data, error: orgError } = await admin
    .from("organizations")
    .select(HOLD_SELECT)
    .eq("id", orgId)
    .single();
  if (orgError || !data) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  const org = data as unknown as Record<string, string | number | null>;
  const status = (org.subscription_status as string | null) ?? null;
  const pausedAt = (org.billing_paused_at as string | null) ?? null;
  const policy = await getOrgBillingPolicy(admin, org);
  const controls = billingHoldControls({
    status,
    trialEndsAt: org.trial_ends_at as string | null,
    suspendedAt: org.suspended_at as string | null,
    billingPausedAt: pausedAt,
    paymentGraceStartedAt: org.payment_grace_started_at as string | null,
    trialGraceDays: policy.values.trialGraceDays,
    paymentGraceDays: policy.values.paymentGraceDays,
  });
  const gate =
    body.action === "pause_billing"
      ? controls.pause
      : body.action === "resume_billing"
        ? controls.resume
        : controls.extendGrace;
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason }, { status: 409 });
  }
  const billsThroughStripe = Boolean(stripeSubscriptionId) && isLiveSubscriptionStatus(status);
  const now = new Date();

  if (body.action === "pause_billing") {
    if (billsThroughStripe) await pauseSubscriptionCollection(stripeSubscriptionId as string);
    await write(
      admin
        .from("organizations")
        .update({
          billing_paused_at: now.toISOString(),
          billing_paused_reason: body.reason,
          billing_paused_by: user.id,
        })
        .eq("id", orgId),
    );
    await invalidateOrganizationBillingCache(orgId);
    await writeGridmasterAuditLog({
      serviceClient: admin,
      actor: user,
      action: "billing.paused",
      resourceType: "organization",
      resourceId: orgId,
      orgId,
      details: { reason: body.reason },
      request: req,
    });
    return NextResponse.json({ success: true });
  }

  if (body.action === "resume_billing") {
    const previousTrialEndsAt = (org.trial_ends_at as string | null) ?? null;
    const trialEndsAt = resumedTrialEndsAt({
      status,
      trialEndsAt: previousTrialEndsAt,
      trialStartedAt: org.trial_started_at as string | null,
      billingPausedAt: pausedAt as string,
      now,
    });
    if (billsThroughStripe) {
      // Stripe only takes a trial end in the future; a trial that ran out
      // before the pause has nothing left there to move.
      if (status === "trialing" && trialEndsAt && Date.parse(trialEndsAt) > now.getTime()) {
        await extendTrial(stripeSubscriptionId as string, new Date(trialEndsAt));
      }
      await resumeSubscriptionCollection(stripeSubscriptionId as string);
    }
    await write(
      admin
        .from("organizations")
        .update({
          billing_paused_at: null,
          billing_paused_reason: null,
          billing_paused_by: null,
          ...(trialEndsAt ? { trial_ends_at: trialEndsAt } : {}),
        })
        .eq("id", orgId),
    );
    await invalidateOrganizationBillingCache(orgId);
    await writeGridmasterAuditLog({
      serviceClient: admin,
      actor: user,
      action: "billing.resumed",
      resourceType: "organization",
      resourceId: orgId,
      orgId,
      details: {
        paused_at: pausedAt,
        ...(trialEndsAt
          ? { previous_trial_ends_at: previousTrialEndsAt, trial_ends_at: trialEndsAt }
          : {}),
      },
      request: req,
    });
    return NextResponse.json({ success: true, trialEndsAt });
  }

  const previousGraceDays = policy.values.trialGraceDays;
  const graceDays = previousGraceDays + body.days;
  const maxGrace = BILLING_POLICY_LIMITS.trialGraceDays.max;
  if (graceDays > maxGrace) {
    return NextResponse.json(
      {
        error: `Grace can be at most ${maxGrace} days in total; it's ${previousGraceDays} now. Change the trial instead.`,
      },
      { status: 400 },
    );
  }
  await write(
    admin.from("organizations").update({ trial_grace_days_override: graceDays }).eq("id", orgId),
  );
  await invalidateOrganizationBillingCache(orgId);
  await writeGridmasterAuditLog({
    serviceClient: admin,
    actor: user,
    action: "billing.grace_extended",
    resourceType: "organization",
    resourceId: orgId,
    orgId,
    details: {
      previous_grace_days: previousGraceDays,
      grace_days: graceDays,
      days: body.days,
      reason: body.reason,
    },
    request: req,
  });
  return NextResponse.json({ success: true, graceDays });
}
