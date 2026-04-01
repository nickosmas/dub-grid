import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createBillingPortalSession } from "@/lib/stripe";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", orgId)
      .single();

    if (orgError || !org?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found" }, { status: 404 });
    }

    const portalSession = await createBillingPortalSession(org.stripe_customer_id, returnUrl);
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    logger.error({ error: err }, "Failed to create billing portal session");
    return NextResponse.json({ error: "Failed to open billing portal" }, { status: 500 });
  }
}
