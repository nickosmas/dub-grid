import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { syncSubscriptionToDb } from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";

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

  const { limited, reset, misconfigured } = await checkRateLimit(
    apiLimiter,
    `gridmaster-stripe-sync:${user.id}:${parsed.data.orgId}`,
  );
  if (misconfigured) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
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
    await syncSubscriptionToDb(parsed.data.orgId);

    // Audit
    try {
      const admin = getServiceClient();
      await writeGridmasterAuditLog({
        serviceClient: admin,
        actor: user,
        action: "billing.synced",
        resourceType: "organization",
        resourceId: parsed.data.orgId,
        orgId: parsed.data.orgId,
        request: req,
      });
    } catch (e) { logger.error({ err: e }, "Failed to audit billing sync"); }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-stripe-sync" } });
    logger.error({ err, path: "/api/gridmaster/stripe-sync" }, "Stripe sync failed");
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
