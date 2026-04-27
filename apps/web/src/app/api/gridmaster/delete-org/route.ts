import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { cancelSubscription } from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  confirmName: z.string().min(1),
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

  const { orgId, confirmName } = parsed.data;
  const admin = getServiceClient();

  try {
    // Verify org exists and name matches
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", orgId)
      .single();
    if (orgErr || !org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    if (org.name !== confirmName) return NextResponse.json({ error: "Organization name does not match" }, { status: 400 });

    // Audit BEFORE deletion (entries will be deleted)
    await admin.from("audit_log").insert({
      org_id: null, // null because org is being deleted
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: "org.deleted",
      resource_type: "organization",
      resource_id: orgId,
      details: { org_name: org.name, initiated_by: "gridmaster", permanent: true },
    });

    // Cancel Stripe subscription first
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("org_id", orgId)
      .single();
    if (sub?.stripe_subscription_id) {
      try { await cancelSubscription(sub.stripe_subscription_id); } catch (e) { logger.warn({ err: e }, "Failed to cancel Stripe subscription during org deletion"); }
    }

    // Cascading delete in dependency order (most dependent first)
    const tables = [
      "schedule_notes",
      "shifts",
      "recurring_shifts",
      "shift_series",
      "coverage_requirements",
      "shift_categories",
      "absence_types",
      "focus_areas",
      "certifications",
      "organization_roles",
      "indicator_types",
      "employees",
      "invitations",
      "notifications",
      "schedule_draft_sessions",
      "publish_history",
      "organization_memberships",
      "subscriptions",
      "shift_requests",
    ];

    for (const table of tables) {
      const { error: delErr } = await admin.from(table).delete().eq("org_id", orgId);
      if (delErr) logger.warn({ err: delErr, table }, `Failed to delete from ${table} for org ${orgId}`);
    }

    // Delete audit_log entries for this org
    await admin.from("audit_log").delete().eq("org_id", orgId);

    // Delete the organization itself
    const { error: orgDelErr } = await admin.from("organizations").delete().eq("id", orgId);
    if (orgDelErr) throw orgDelErr;

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-delete-org" } });
    logger.error({ err, path: "/api/gridmaster/delete-org" }, "Org deletion failed");
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}
