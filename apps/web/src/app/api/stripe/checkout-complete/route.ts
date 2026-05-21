import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { syncCheckoutSessionToDb } from "@/lib/stripe";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  sessionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

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

    const auth = await requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
      { allowLockedOrganization: true },
    );
    if ("response" in auth) return auth.response;

    const { limited, reset, misconfigured } = await checkRateLimit(
      apiLimiter,
      `billing-checkout-complete:${auth.actor.id}:${parsed.data.orgId}`,
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

    await syncCheckoutSessionToDb(
      auth.serviceClient,
      parsed.data.sessionId,
      parsed.data.orgId,
      {
        actor: {
          id: auth.actor.id,
          email: auth.actor.email,
        },
      },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "checkout-complete" } });
    logger.error({ error }, "Failed to complete checkout billing sync");
    return NextResponse.json(
      { error: "Failed to sync checkout" },
      { status: 500 },
    );
  }
}
