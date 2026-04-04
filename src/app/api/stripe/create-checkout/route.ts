import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { createServerClient } from "@supabase/ssr";
import { createStripeCustomer, createCheckoutSession } from "@/lib/stripe";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

function getUserClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } },
  );
}

export async function POST(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    // Auth check
    const userClient = getUserClient(req);
    const { data: { session } } = await userClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { orgId, returnUrl } = await req.json();
    if (!orgId || !returnUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate returnUrl against allowed site URL to prevent open redirects
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl || !returnUrl.startsWith(siteUrl)) {
      return NextResponse.json({ error: "Invalid return URL" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Verify user belongs to this org with admin+ role
    const [{ data: membership }, { data: profile }] = await Promise.all([
      supabase
        .from("organization_memberships")
        .select("org_role")
        .eq("user_id", session.user.id)
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("platform_role")
        .eq("id", session.user.id)
        .single(),
    ]);

    const isGridmaster = profile?.platform_role === "gridmaster";
    const isAdminPlus = membership?.org_role && ["super_admin", "admin"].includes(membership.org_role);

    if (!isGridmaster && !isAdminPlus) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get org details
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Get or create Stripe customer
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      // Get super_admin email for the customer
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("org_role", "super_admin")
        .limit(1)
        .single();

      let email = "billing@example.com";
      if (membership?.user_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(membership.user_id);
        if (authUser?.user?.email) email = authUser.user.email;
      }

      const customer = await createStripeCustomer(orgId, org.name, email);
      customerId = customer.id;

      await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", orgId);
    }

    // Count current seats (org members)
    const { count } = await supabase
      .from("organization_memberships")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    const seats = Math.max(count ?? 1, 1);

    // Create checkout session
    const checkoutSession = await createCheckoutSession(customerId, orgId, seats, returnUrl);

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "create-checkout" } });
    logger.error({ error: err }, "Failed to create checkout session");
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
