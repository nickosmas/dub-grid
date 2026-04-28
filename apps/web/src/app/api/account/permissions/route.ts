import { NextRequest, NextResponse } from "next/server";
import type { AdminPermissions, OrganizationRole } from "@/types";
import { buildPerms, extractJwtClaims } from "@/features/permissions/shared";
import { getImpersonationFromCookie } from "@/lib/impersonation";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }

    const serviceClient = getServiceClient();
    const impersonation = getImpersonationFromCookie(
      req.headers.get("cookie") ?? "",
    );

    if (impersonation && auth.claims.platform_role === "gridmaster") {
      const targetOrgId = impersonation.targetOrgId;
      const { data: targetMembership } = await serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", impersonation.targetUserId)
        .eq("org_id", targetOrgId)
        .single();
      const targetRole =
        (targetMembership?.org_role as OrganizationRole | null) ??
        (impersonation.targetOrgRole as OrganizationRole | null) ??
        "user";

      return NextResponse.json({
        permissions: buildPerms(
          targetRole,
          targetOrgId,
          false,
          (targetMembership?.admin_permissions as AdminPermissions | null) ?? null,
          true,
        ),
      });
    }

    const { effectiveRole, orgId } = extractJwtClaims(auth.session.access_token);

    if (effectiveRole === "gridmaster" || effectiveRole === "super_admin") {
      return NextResponse.json({
        permissions: buildPerms(effectiveRole, orgId, false),
      });
    }

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
        ),
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
        return NextResponse.json({
          permissions: buildPerms(
            membership.org_role as OrganizationRole,
            profile.org_id,
            false,
            (membership.admin_permissions as AdminPermissions | null) ?? null,
          ),
        });
      }
    }

    return NextResponse.json({
      permissions: buildPerms(effectiveRole, orgId, false),
    });
  } catch (error) {
    console.error("account permissions GET failed", error);
    return jsonError("Failed to load permissions");
  }
}
