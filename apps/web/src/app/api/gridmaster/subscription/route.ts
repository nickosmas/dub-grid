import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { TRIAL_EXPIRED_STATUS, trialControls } from "@dubgrid/domain";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import {
  cancelSubscription,
  extendTrial,
  invalidateOrganizationBillingCache,
  scheduleSubscriptionCancellation,
  syncSubscriptionSeats,
} from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase-service";
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
]);

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

  // Each of these locks an organization or rewrites its billing outright.
  if (action === "expire_trial" || action === "cancel" || action === "override_status") {
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
      { error: "Too many requests" },
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
        .select("subscription_status, trial_started_at, trial_ends_at")
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
      const seats = Math.max(await countBillableAppUsers(admin, orgId), 1);
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
      await write(
        admin.from("organizations").update({ subscription_status: status }).eq("id", orgId),
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
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
