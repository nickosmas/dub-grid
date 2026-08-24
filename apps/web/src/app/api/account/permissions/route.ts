import { NextRequest, NextResponse } from "next/server";
import { Timer, withTiming } from "@/lib/server-timing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isManagementUser, isOnSchedule } from "@dubgrid/domain";
import type { AdminPermissions, OrganizationRole } from "@/types";
import { buildPerms } from "@/features/permissions/shared";
import { getImpersonationFromCookie } from "@/lib/impersonation";
import { verifyImpersonationSession } from "@/lib/impersonation-server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { isCallerInactive } from "@/app/api/shared/permissions";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

interface SelfEmploymentFlags {
  // True when the caller's own employees row (in the effective org) has a
  // scheduled focus area — i.e. they appear on the schedule grid.
  isOnSchedule: boolean;
  // True when the caller's own employees row has management department
  // access. Combined with isOnSchedule, this is how the web nav (Header.tsx)
  // detects "management-only, non-admin" accounts that should only see
  // Schedule + People, never Dashboard. Matches the naming already used by
  // ProfilePage.tsx's isOnSchedule and DirectoryPerson.isManagementUser.
  isManagementUser: boolean;
}

const NO_SELF_EMPLOYMENT_FLAGS: SelfEmploymentFlags = {
  isOnSchedule: false,
  isManagementUser: false,
};

// Roles nagged to enroll in MFA. Advisory only — see RBAC_SYSTEM_DESIGN.md
// §13.1: a dismissible in-app nag, not a hard block, to avoid locking out
// existing admin/gridmaster accounts that haven't enrolled yet.
const MFA_NAGGED_ROLES = new Set(["admin", "super_admin", "gridmaster"]);

function hasVerifiedTotpFactor(user: {
  factors?: { factor_type: string; status: string }[] | null;
}) {
  return (user.factors ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
}

async function getSelfEmploymentFlags(
  serviceClient: SupabaseClient,
  userId: string,
  orgId: string | null,
): Promise<SelfEmploymentFlags> {
  if (!orgId) return NO_SELF_EMPLOYMENT_FLAGS;
  const { data } = await serviceClient
    .from("employees")
    .select("focus_area_ids, department_ids")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  const focusAreaIds = (data?.focus_area_ids as number[] | null) ?? [];
  const departmentIds = (data?.department_ids as number[] | null) ?? [];
  return {
    isOnSchedule: isOnSchedule(focusAreaIds),
    isManagementUser: isManagementUser(departmentIds),
  };
}

async function handleGET(req: NextRequest, timer: Timer) {
  try {
    const auth = await timer.time("auth", () => requireAuthenticatedUserWithClaims(req));
    if ("response" in auth) {
      return auth.response;
    }

    const serviceClient = getServiceClient();
    const impersonation = getImpersonationFromCookie(req.headers.get("cookie") ?? "");

    // effectiveRole/orgId reflect the actual authenticated caller, not an
    // impersonation target — an impersonating gridmaster should still get
    // nagged about their own MFA status, not the target user's.
    //
    // Derived from auth.claims (already sandbox-rewritten by
    // requireAuthenticatedUserWithClaims: org_id -> sandbox org, org_role ->
    // "super_admin") rather than re-decoding the raw access token — the raw
    // token never reflects sandbox mode, which previously caused this route
    // (and therefore usePermissions() everywhere it's consumed) to report the
    // real org while the user was banner-confirmed to be sandboxed.
    const claimOrgId = typeof auth.claims.org_id === "string" ? auth.claims.org_id : null;
    const claimOrgRole = (auth.claims.org_role as string) || "user";
    const effectiveRole = auth.claims.platform_role === "gridmaster" ? "gridmaster" : claimOrgRole;
    const orgId = claimOrgId;
    const mfaNagRequired = MFA_NAGGED_ROLES.has(effectiveRole) && !hasVerifiedTotpFactor(auth.user);

    if (impersonation && auth.claims.platform_role === "gridmaster") {
      // The cookie is client-writable — cross-check its sessionId against
      // the authoritative impersonation_sessions row before trusting
      // targetOrgId/targetUserId, rather than the cookie's own copies.
      const verified = await verifyImpersonationSession(
        serviceClient,
        impersonation.sessionId,
        auth.user.id,
      );

      if (verified) {
        const { data: targetMembership } = await serviceClient
          .from("organization_memberships")
          .select("org_role, admin_permissions")
          .eq("user_id", verified.targetUserId)
          .eq("org_id", verified.targetOrgId)
          .single();
        const targetRole =
          (targetMembership?.org_role as OrganizationRole | null) ??
          (impersonation.targetOrgRole as OrganizationRole | null) ??
          "user";

        return NextResponse.json({
          permissions: buildPerms(
            targetRole,
            verified.targetOrgId,
            false,
            (targetMembership?.admin_permissions as AdminPermissions | null) ?? null,
            true,
          ),
          mfaNagRequired,
        });
      }
      // No matching active session — fall through and report the caller's
      // own (real) permissions instead of trusting the stale/forged cookie.
    }

    // Gridmasters always have full access — they don't have an employees row in
    // the org they're viewing.
    if (effectiveRole === "gridmaster") {
      return NextResponse.json({
        permissions: buildPerms(effectiveRole, orgId, false),
        mfaNagRequired,
      });
    }

    // Super_admins bypass the inactive check (they're the ones who'd be doing
    // the deactivating, and the people page UI already prevents deactivating
    // admin/super_admin roles) but still need employment flags — a super_admin
    // can have a management-only employees row, and dashboard widgets like
    // MyScheduleRow need isOnSchedule/isManagementUser to gate accordingly.
    if (effectiveRole === "super_admin") {
      return NextResponse.json({
        permissions: buildPerms(effectiveRole, orgId, false),
        ...(await getSelfEmploymentFlags(serviceClient, auth.user.id, orgId)),
        mfaNagRequired,
      });
    }

    const [inactive, employmentFlags] = await Promise.all([
      orgId ? isCallerInactive(serviceClient, auth.user.id, orgId) : Promise.resolve(false),
      getSelfEmploymentFlags(serviceClient, auth.user.id, orgId),
    ]);

    if (effectiveRole === "admin" && orgId) {
      const { data } = await serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", auth.user.id)
        .eq("org_id", orgId)
        .single();

      const dbRole = (data?.org_role as OrganizationRole | null) ?? "user";
      return NextResponse.json({
        permissions: buildPerms(
          dbRole,
          orgId,
          false,
          (data?.admin_permissions as AdminPermissions | null) ?? null,
          false,
          inactive,
        ),
        ...employmentFlags,
        mfaNagRequired,
      });
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("org_id, platform_role")
      .eq("id", auth.user.id)
      .single();

    if (profile?.platform_role === "gridmaster") {
      return NextResponse.json({
        permissions: buildPerms("gridmaster", profile.org_id ?? null, false),
        mfaNagRequired,
      });
    }

    if (profile?.org_id) {
      const { data: membership } = await serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", auth.user.id)
        .eq("org_id", profile.org_id)
        .single();

      if (membership) {
        const [profileInactive, profileEmploymentFlags] =
          profile.org_id === orgId
            ? [inactive, employmentFlags]
            : await Promise.all([
                isCallerInactive(serviceClient, auth.user.id, profile.org_id),
                getSelfEmploymentFlags(serviceClient, auth.user.id, profile.org_id),
              ]);
        return NextResponse.json({
          permissions: buildPerms(
            membership.org_role as OrganizationRole,
            profile.org_id,
            false,
            (membership.admin_permissions as AdminPermissions | null) ?? null,
            false,
            profileInactive,
          ),
          ...profileEmploymentFlags,
          mfaNagRequired,
        });
      }
    }

    return NextResponse.json({
      permissions: buildPerms(effectiveRole, orgId, false, null, false, inactive),
      ...employmentFlags,
      mfaNagRequired,
    });
  } catch (error) {
    logger.error({ error }, "account permissions GET failed");
    return jsonError("Failed to load permissions");
  }
}

export const GET = withTiming(handleGET);
