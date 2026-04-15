import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { syncSubscriptionToDb } from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  orgId: z.string().uuid(),
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

  try {
    await syncSubscriptionToDb(parsed.data.orgId);

    // Audit
    try {
      const admin = getServiceClient();
      await admin.from("audit_log").insert({
        org_id: parsed.data.orgId,
        actor_id: user.id,
        actor_email: user.email ?? null,
        action: "billing.synced",
        resource_type: "organization",
        resource_id: parsed.data.orgId,
        details: { initiated_by: "gridmaster" },
      });
    } catch (e) { logger.error({ err: e }, "Failed to audit billing sync"); }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-stripe-sync" } });
    logger.error({ err, path: "/api/gridmaster/stripe-sync" }, "Stripe sync failed");
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
