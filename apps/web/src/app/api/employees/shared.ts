import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { BILLING_ACCESS_SELECT, evaluateOrgBillingAccess } from "@/lib/billing-policy";
import { createNameMismatchResponseBody } from "@/lib/account-linking";
import { getServiceClient } from "@/lib/supabase-service";
import type { NameMismatchDetails } from "@/types";
import { canGrantOrgRole } from "@dubgrid/domain";

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

/**
 * Whether this person may give `role` through an invitation (F-238): only a
 * Super Admin or Gridmaster gives an elevated tier. Creation, editing,
 * redirecting and replacement of an invitation all apply it, since raising or
 * moving a pending invitation is the same grant as creating it.
 */
export async function canAssignOrgRole(
  serviceClient: ServiceClient,
  actorId: string,
  orgId: string,
  role: string,
): Promise<boolean> {
  if (role === "user") return true;
  const elevated = await isOrgSuperAdminOrGridmaster(serviceClient, actorId, orgId);
  return canGrantOrgRole({ isSuperAdmin: elevated, isGridmaster: false }, role);
}

/**
 * False when this request is for another organization than its session's, or
 * the caller is suspended from `orgId`. A live membership proves neither (F-194).
 * The claims already name the sandbox for a caller inside one.
 */
export async function isActingInSessionOrg(
  req: NextRequest,
  serviceClient: ServiceClient,
  actorId: string,
  orgId: string,
): Promise<boolean> {
  if (await isGridmasterActor(serviceClient, actorId)) return true;

  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth || auth.user.id !== actorId) return false;
  const { org_id: sessionOrgId, in_sandbox: inSandbox } = auth.claims;
  if (typeof sessionOrgId === "string" && sessionOrgId && sessionOrgId !== orgId) return false;

  const [{ data: employee, error }, { data: organization, error: organizationError }] =
    await Promise.all([
      serviceClient
        .from("employees")
        .select("suspended_at")
        .eq("user_id", actorId)
        .eq("org_id", orgId)
        .maybeSingle(),
      serviceClient.from("organizations").select("workspace_kind").eq("id", orgId).maybeSingle(),
    ]);
  if (error) throw error;
  if (organizationError) throw organizationError;
  // A sandbox membership outlives the access it was entered with, so a sandbox
  // opens only through the cookie that re-checks that access (F-198).
  if (organization?.workspace_kind === "sandbox" && inSandbox !== true) return false;
  return employee?.suspended_at == null;
}

export async function canManageEmployees(
  req: NextRequest,
  serviceClient: ServiceClient,
  actorId: string,
  orgId: string,
): Promise<boolean> {
  if (!(await isActingInSessionOrg(req, serviceClient, actorId, orgId))) return false;

  const [{ data: membership }, { data: profile }, { data: organization }] = await Promise.all([
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
      .select(`suspended_at, subscription_status, trial_ends_at, ${BILLING_ACCESS_SELECT}`)
      .eq("id", orgId)
      .is("archived_at", null)
      .maybeSingle(),
  ]);

  const isGridmaster = profile?.platform_role === "gridmaster";
  const isSuperAdmin = membership?.org_role === "super_admin";
  const isAdmin = membership?.org_role === "admin";
  if (!organization && !isGridmaster) {
    return false;
  }
  const billingAccess = await evaluateOrgBillingAccess(serviceClient, organization);
  // A Super Admin keeps managing staff through a billing lock (to bring seats
  // down, say), but not once a Gridmaster has suspended the organization (F-225).
  const superAdminPassesLock = isSuperAdmin && billingAccess.reason !== "suspended";
  if (billingAccess.isLocked && !isGridmaster && !superAdminPassesLock) {
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
