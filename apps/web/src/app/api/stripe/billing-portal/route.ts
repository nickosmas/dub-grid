import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createBillingPortalSession,
  writeBillingPortalOpenedAuditLog,
} from "@/lib/stripe";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { forbidIfSandboxCookie } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { resolveBillingReturnUrl } from "@/features/billing/server";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  returnUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { orgId } = parsed.data;
    const returnUrl = resolveBillingReturnUrl(parsed.data.returnUrl, [
      req.headers.get("origin"),
      req.nextUrl.origin,
    ]);
    if (!returnUrl) {
      return NextResponse.json({ error: "Invalid return URL" }, { status: 400 });
    }

    const auth = await requireOrgPermissions(
      req,
      orgId,
      (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
      { allowLockedWorkspace: true },
    );
    if ("response" in auth) return auth.response;
    const supabase = auth.serviceClient;

    const { limited, reset, misconfigured } = await checkRateLimit(
      apiLimiter,
      `billing-portal:${auth.actor.id}:${orgId}`,
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

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", orgId)
      .single();

    if (orgError || !org?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found" }, { status: 404 });
    }

    const portalSession = await createBillingPortalSession(org.stripe_customer_id, returnUrl);
    await writeBillingPortalOpenedAuditLog(supabase, {
      orgId,
      actor: {
        id: auth.actor.id,
        email: auth.actor.email,
      },
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "billing-portal" } });
    logger.error({ error: err }, "Failed to create billing portal session");
    return NextResponse.json({ error: "Failed to open billing portal" }, { status: 500 });
  }
}
