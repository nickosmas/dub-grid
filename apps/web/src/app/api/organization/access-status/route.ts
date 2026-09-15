import { NextResponse, type NextRequest } from "next/server";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { CacheKey, cacheSet, TTL } from "@/lib/cache";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

// Same columns and cache key as the org-access read in proxy.ts. Unlike normal
// navigation, this recovery check deliberately reads the source of truth and
// replaces the cached answer before telling the browser to try the gate again.
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
  let canViewAccessDetails = false;
  try {
    const serviceClient = getServiceClient();
    const [membershipResult, profileResult] = await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role")
        .eq("user_id", auth.user.id)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient
        .from("profiles")
        .select("platform_role, deactivated_at, scheduled_deletion_at")
        .eq("id", auth.user.id)
        .maybeSingle(),
    ]);
    if (membershipResult.error) throw membershipResult.error;
    if (profileResult.error) throw profileResult.error;

    const liveGridmaster =
      profileResult.data?.platform_role === "gridmaster" &&
      profileResult.data.deactivated_at == null &&
      profileResult.data.scheduled_deletion_at == null;
    if (!liveGridmaster && !membershipResult.data) {
      return NextResponse.json({ available: false, state: "unavailable" });
    }
    canViewAccessDetails = liveGridmaster || membershipResult.data?.org_role === "super_admin";

    const { data, error } = await serviceClient
      .from("organizations")
      .select("suspended_at, archived_at, subscription_status, trial_ends_at")
      .eq("id", orgId)
      .maybeSingle();
    if (error) throw error;
    org = (data as OrgAccessRow) ?? null;
    await cacheSet(CacheKey.mwOrgAccess(orgId), org, TTL.MIDDLEWARE);
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "organization-access-status" } });
    // A cache or database blip must never read as "your organization is open" —
    // that would send the caller into a reload the gate immediately undoes.
    return NextResponse.json({
      available: false,
      state: canViewAccessDetails ? "unknown" : "unavailable",
    });
  }

  if (org?.archived_at) {
    return NextResponse.json({
      available: false,
      state: canViewAccessDetails ? "archived" : "unavailable",
    });
  }

  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: org?.suspended_at ?? null,
    subscriptionStatus: org?.subscription_status ?? null,
    trialEndsAt: org?.trial_ends_at ?? null,
  });

  // Mirrors the proxy: a super admin can recover billing themselves, so it
  // never parks them on the gate page while the trial clock is unstarted.
  const canRecoverBilling = canViewAccessDetails;
  const available =
    !billingAccess.isLocked && (billingAccess.state !== "trial_pending" || canRecoverBilling);

  return NextResponse.json({
    available,
    state: canViewAccessDetails ? billingAccess.state : available ? "active" : "unavailable",
  });
}
