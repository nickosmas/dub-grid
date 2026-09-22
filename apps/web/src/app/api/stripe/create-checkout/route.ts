import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createStripeCustomer, createCheckoutSession, requireStripeEnabled } from "@/lib/stripe";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { forbidIfSandboxCookie } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { countBillableAppUsers, resolveBillingReturnUrl } from "@/features/billing/server";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

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
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }
    const { orgId: requestedOrgId } = parsed.data;
    const returnUrl = resolveBillingReturnUrl(parsed.data.returnUrl, [
      req.headers.get("origin"),
      req.nextUrl.origin,
    ]);
    if (!returnUrl) {
      return NextResponse.json(
        { error: "That link looks wrong. Start again from your billing settings." },
        { status: 400 },
      );
    }

    const auth = await requireOrgPermissions(
      req,
      requestedOrgId,
      (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
      { allowLockedOrganization: true },
    );
    if ("response" in auth) return auth.response;
    const supabase = auth.serviceClient;
    // Sandbox cookies were refused above, so this equals the requested id;
    // every route still binds the organization from authorization alone.
    const orgId = auth.orgId;

    const { limited, reset, misconfigured } = await checkRateLimit(
      apiLimiter,
      `billing-checkout:${auth.actor.id}:${orgId}`,
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

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("org_role", "super_admin")
        .is("archived_at", null)
        .limit(1)
        .maybeSingle();

      let email = auth.actor.email ?? null;
      if (membership?.user_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(membership.user_id);
        if (authUser?.user?.email) email = authUser.user.email;
      }
      if (!email) {
        return NextResponse.json({ error: "Billing contact email required" }, { status: 400 });
      }

      const customer = await createStripeCustomer(orgId, org.name, email);
      customerId = customer.id;

      const { error: persistError } = await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", orgId);
      if (persistError) {
        // The Stripe customer exists but we couldn't record its id. Surface it — retries are
        // safe now that createStripeCustomer reuses the existing customer by org_id metadata
        // rather than creating a duplicate, but a persistently unpersisted id is worth seeing.
        Sentry.captureException(persistError, {
          extra: { context: "create-checkout-persist-customer", orgId },
        });
        logger.error(
          { error: persistError, orgId },
          "Failed to persist stripe_customer_id after customer creation",
        );
      }
    }

    const seats = Math.max(await countBillableAppUsers(supabase, orgId), 1);

    // Create checkout session
    const checkoutSession = await createCheckoutSession(customerId, orgId, seats, returnUrl);

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "create-checkout" } });
    logger.error({ error: err }, "Failed to create checkout session");
    return NextResponse.json({ error: "We couldn't start checkout. Try again." }, { status: 500 });
  }
}
