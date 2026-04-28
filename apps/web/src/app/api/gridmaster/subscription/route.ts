import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { cancelSubscription, extendTrial } from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  action: z.enum(["extend_trial", "cancel", "override_status"]),
  trialDays: z.number().min(1).max(365).optional(),
  status: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // Input
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { orgId, action } = parsed.data;
  const admin = getServiceClient();

  try {
    // Get org's subscription
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("org_id", orgId)
      .single();

    if (action === "extend_trial") {
      const days = parsed.data.trialDays ?? 14;
      if (!sub?.stripe_subscription_id) {
        // No Stripe subscription — just update trial_ends_at on the org
        const newEnd = new Date(Date.now() + days * 86400000).toISOString();
        await admin.from("organizations").update({ trial_ends_at: newEnd, subscription_status: "trialing" }).eq("id", orgId);
      } else {
        const newEnd = new Date(Date.now() + days * 86400000);
        await extendTrial(sub.stripe_subscription_id, newEnd);
        await admin.from("organizations").update({ trial_ends_at: newEnd.toISOString(), subscription_status: "trialing" }).eq("id", orgId);
      }
      await admin.from("audit_log").insert({
        org_id: orgId, actor_id: user.id, actor_email: user.email ?? null,
        action: "billing.trial_extended", resource_type: "organization", resource_id: orgId,
        details: { days, initiated_by: "gridmaster" },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "cancel") {
      if (sub?.stripe_subscription_id) {
        await cancelSubscription(sub.stripe_subscription_id);
      }
      await admin.from("organizations").update({ subscription_status: "canceled" }).eq("id", orgId);
      await admin.from("audit_log").insert({
        org_id: orgId, actor_id: user.id, actor_email: user.email ?? null,
        action: "billing.subscription_canceled", resource_type: "organization", resource_id: orgId,
        details: { initiated_by: "gridmaster" },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "override_status") {
      const status = parsed.data.status;
      if (!status) return NextResponse.json({ error: "Status required" }, { status: 400 });
      await admin.from("organizations").update({ subscription_status: status }).eq("id", orgId);
      await admin.from("audit_log").insert({
        org_id: orgId, actor_id: user.id, actor_email: user.email ?? null,
        action: "billing.status_overridden", resource_type: "organization", resource_id: orgId,
        details: { new_status: status, initiated_by: "gridmaster" },
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
