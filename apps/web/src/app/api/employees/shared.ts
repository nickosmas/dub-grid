import { NextResponse } from "next/server";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import { createNameMismatchResponseBody } from "@/lib/account-linking";
import { getServiceClient } from "@/lib/supabase-service";
import { isCallerInactive } from "@/app/api/shared/permissions";
import type { NameMismatchDetails } from "@/types";

export type ServiceClient = ReturnType<typeof getServiceClient>;

export async function isOrgSuperAdminOrGridmaster(
  serviceClient: ServiceClient,
  actorId: string,
  orgId: string,
): Promise<boolean> {
  const [{ data: membership }, { data: profile }] = await Promise.all([
    serviceClient
      .from("organization_memberships")
      .select("org_role")
      .eq("user_id", actorId)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle(),
    serviceClient.from("profiles").select("platform_role").eq("id", actorId).maybeSingle(),
  ]);

  return profile?.platform_role === "gridmaster" || membership?.org_role === "super_admin";
}

/**
 * A Gridmaster can grant any role in any organization, so the invitations it
 * sends or changes need fresh proof, as its direct role grants do (F-16, F-59).
 */
export async function isGridmasterActor(
  serviceClient: ServiceClient,
  actorId: string,
): Promise<boolean> {
  const { data: profile, error } = await serviceClient
    .from("profiles")
    .select("platform_role")
    .eq("id", actorId)
    .maybeSingle();
  // Failing open would skip the fresh-proof gate on a read error.
  if (error) throw error;
  return profile?.platform_role === "gridmaster";
}

// The super_admin tier is handed out only by a super admin of that
// organization or a gridmaster. Creation, editing and replacement of an
// invitation all apply it, so the rule lives in one place: a pending
// invitation raised to super_admin after the fact is the same escalation as
// one created that way.
export async function canAssignOrgRole(
  serviceClient: ServiceClient,
  actorId: string,
  orgId: string,
  role: string,
): Promise<boolean> {
  if (role !== "super_admin") return true;
  return isOrgSuperAdminOrGridmaster(serviceClient, actorId, orgId);
}

export async function canManageEmployees(
  serviceClient: ServiceClient,
  actorId: string,
  orgId: string,
): Promise<boolean> {
  const [{ data: membership }, { data: profile }, { data: organization }, inactive] =
    await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", actorId)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient.from("profiles").select("platform_role").eq("id", actorId).single(),
      serviceClient
        .from("organizations")
        .select("suspended_at, subscription_status, trial_ends_at")
        .eq("id", orgId)
        .is("archived_at", null)
        .maybeSingle(),
      isCallerInactive(serviceClient, actorId, orgId),
    ]);

  const isGridmaster = profile?.platform_role === "gridmaster";
  const isSuperAdmin = membership?.org_role === "super_admin";
  const isAdmin = membership?.org_role === "admin";
  if (!organization && !isGridmaster) {
    return false;
  }
  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: organization?.suspended_at ?? null,
    subscriptionStatus: organization?.subscription_status ?? null,
    trialEndsAt: organization?.trial_ends_at ?? null,
  });
  if (billingAccess.isLocked && !isGridmaster && !isSuperAdmin) {
    return false;
  }

  // Inactive employees keep their session but lose every manage capability —
  // mirrors requireOrgPermissions / resolveMobileAuthContext. Gridmaster/super_admin
  // bypass: those tiers aren't meant to be sidelined by a stale employees.status row.
  if (inactive && !isGridmaster && !isSuperAdmin) {
    return false;
  }

  const adminPerms = membership?.admin_permissions as Record<string, boolean> | null;
  return isGridmaster || isSuperAdmin || (isAdmin && adminPerms?.canManageEmployees === true);
}

export async function fetchProfileName(
  serviceClient: ServiceClient,
  userId: string,
): Promise<{ firstName: string | null; lastName: string | null }> {
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  return {
    firstName: (profile?.first_name as string | null) ?? null,
    lastName: (profile?.last_name as string | null) ?? null,
  };
}

export function nameMismatchResponse(details: NameMismatchDetails, error?: string): NextResponse {
  return NextResponse.json(createNameMismatchResponseBody(details, error), { status: 409 });
}
