import { NextResponse, type NextRequest } from "next/server";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { CacheKey, cacheThrough, TTL } from "@/lib/cache";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

// Same columns, same cache key and TTL as the org-access read in proxy.ts. The
// gate that holds a user on /billing-required lives there, so answering from
// anywhere else would let this route say "open" while the very next navigation
// bounced off a gate still reading the older row.
type OrgAccessRow = {
  suspended_at: string | null;
  archived_at: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
} | null;

/**
 * Reports whether the organization gate would still hold this caller.
 *
 * Deliberately outside requireOrgPermissions: that helper answers a locked
 * organization with a canned 403 and nothing else, which is exactly the state
 * this route exists to describe. It returns no organization data beyond the
 * gate the caller is already looking at.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;

  const orgId = typeof auth.claims.org_id === "string" ? auth.claims.org_id : null;
  // No org claim means the proxy skips the gate entirely for this caller.
  if (!orgId) return NextResponse.json({ available: true, state: "active" });

  let org: OrgAccessRow;
  try {
    org = await cacheThrough(CacheKey.mwOrgAccess(orgId), TTL.MIDDLEWARE, async () => {
      const { data } = await getServiceClient()
        .from("organizations")
        .select("suspended_at, archived_at, subscription_status, trial_ends_at")
        .eq("id", orgId)
        .maybeSingle();
      return (data as OrgAccessRow) ?? null;
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "organization-access-status" } });
    // A cache or database blip must never read as "your organization is open" —
    // that would send the caller into a reload the gate immediately undoes.
    return NextResponse.json({ available: false, state: "unknown" });
  }

  if (org?.archived_at) {
    return NextResponse.json({ available: false, state: "archived" });
  }

  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: org?.suspended_at ?? null,
    subscriptionStatus: org?.subscription_status ?? null,
    trialEndsAt: org?.trial_ends_at ?? null,
  });

  // Mirrors the proxy: a super admin can recover billing themselves, so it
  // never parks them on the gate page while the trial clock is unstarted.
  const canRecoverBilling =
    auth.claims.org_role === "super_admin" || auth.claims.platform_role === "gridmaster";
  const available =
    !billingAccess.isLocked && (billingAccess.state !== "trial_pending" || canRecoverBilling);

  return NextResponse.json({ available, state: billingAccess.state });
}
