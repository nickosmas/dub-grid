import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { forbidIfSandboxCookie } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { syncCheckoutSessionToDb, requireStripeEnabled } from "@/lib/stripe";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  sessionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // Same refusal create-checkout and billing-portal give. Without it a
  // sandboxed caller reached syncCheckoutSessionToDb and got its generic
  // organization-mismatch error instead.
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const auth = await requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
      { allowLockedOrganization: true },
    );
    if ("response" in auth) return auth.response;

    const { limited, reset, misconfigured } = await checkRateLimit(
      apiLimiter,
      `billing-checkout-complete:${auth.actor.id}:${auth.orgId}`,
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
            "Retry-After": String(
              Math.max(1, Math.ceil(((reset ?? Date.now()) - Date.now()) / 1000)),
            ),
          },
        },
      );
    }

    // Checked after auth + rate-limiting (not before) so a disabled flag can't be
    // used to probe this route for free, unauthenticated and unrate-limited.
    const stripeDisabled = await requireStripeEnabled();
    if (stripeDisabled) return stripeDisabled;

    await syncCheckoutSessionToDb(auth.serviceClient, parsed.data.sessionId, auth.orgId, {
      actor: {
        id: auth.actor.id,
        email: auth.actor.email,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "checkout-complete" } });
    logger.error({ error }, "Failed to complete checkout billing sync");
    return NextResponse.json(
      { error: "We couldn't confirm that payment. Try again." },
      { status: 500 },
    );
  }
}
