import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { DEFAULT_TRIAL_DAYS } from "@dubgrid/domain";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import {
  cancelSubscription,
  extendTrial,
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
    action: z.literal("extend_trial"),
    trialDays: z.number().int().min(1).optional(),
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
  }),
]);

function defaultTrialEndFrom(date: Date): string {
  return new Date(date.getTime() + DEFAULT_TRIAL_DAYS * 86_400_000).toISOString();
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

  const { limited, reset, misconfigured } = await checkRateLimit(
    apiLimiter,
    `gridmaster-subscription:${user.id}:${orgId}`,
  );
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil(((reset ?? Date.now()) - Date.now()) / 1000)),
          ),
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

    if (action === "extend_trial") {
      const days = parsed.data.trialDays ?? 14;
      // If extending starts a pending trial (no start recorded yet), stamp the
      // start now; otherwise preserve the existing start so the column stays
      // consistent with trial_ends_at. See trial activation in 002 migrations.
      const { data: orgRow } = await admin
        .from("organizations")
        .select("trial_started_at")
        .eq("id", orgId)
        .single();
      const startedAt = orgRow?.trial_started_at ?? new Date().toISOString();
      if (!sub?.stripe_subscription_id) {
        // No Stripe subscription — just update trial_ends_at on the org
        const newEnd = new Date(Date.now() + days * 86400000).toISOString();
        await admin
          .from("organizations")
          .update({
            trial_started_at: startedAt,
            trial_ends_at: newEnd,
            subscription_status: "trialing",
          })
          .eq("id", orgId);
      } else {
        const newEnd = new Date(Date.now() + days * 86400000);
        await extendTrial(sub.stripe_subscription_id, newEnd);
        await admin
          .from("organizations")
          .update({
            trial_started_at: startedAt,
            trial_ends_at: newEnd.toISOString(),
            subscription_status: "trialing",
          })
          .eq("id", orgId);
      }
      await writeGridmasterAuditLog({
        serviceClient: admin,
        actor: user,
        action: "billing.trial_extended",
        resourceType: "organization",
        resourceId: orgId,
        orgId,
        details: { days },
        request: req,
      });
      return NextResponse.json({ success: true });
    }

    if (action === "cancel") {
      if (sub?.stripe_subscription_id) {
        await cancelSubscription(sub.stripe_subscription_id);
      }
      await admin.from("organizations").update({ subscription_status: "canceled" }).eq("id", orgId);
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

      await admin
        .from("subscriptions")
        .update({
          status: scheduledSubscription.status,
          current_period_end: currentPeriodEnd,
          cancel_at: cancelAt,
          canceled_at: canceledAt,
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", orgId);
      await admin
        .from("organizations")
        .update({ subscription_status: scheduledSubscription.status })
        .eq("id", orgId);
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
      await admin
        .from("subscriptions")
        .update({ quantity: seats, updated_at: new Date().toISOString() })
        .eq("org_id", orgId);
      await admin.from("organizations").update({ subscription_seats: seats }).eq("id", orgId);
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
      const status = parsed.data.status;
      await admin
        .from("organizations")
        .update({
          subscription_status: status,
          ...(status === "trialing" ? { trial_ends_at: defaultTrialEndFrom(new Date()) } : {}),
        })
        .eq("id", orgId);
      await writeGridmasterAuditLog({
        serviceClient: admin,
        actor: user,
        action: "billing.status_overridden",
        resourceType: "organization",
        resourceId: orgId,
        orgId,
        details: { new_status: status },
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
