import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildPermissionContext } from "@dubgrid/authz";
import type { AdminPermissions, OrganizationRole } from "@/types";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";

type PermissionContext = ReturnType<typeof buildPermissionContext>;

export interface AuthorizedOrgRequest {
  actor: User;
  permissions: PermissionContext;
  serviceClient: ReturnType<typeof getServiceClient>;
}

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Insufficient permissions" },
    { status: 403 },
  );
}

export async function requireOrgPermissions(
  req: NextRequest,
  orgId: string,
  isAllowed: (permissions: PermissionContext) => boolean,
): Promise<AuthorizedOrgRequest | { response: NextResponse }> {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) {
    return { response: auth.response };
  }

  const serviceClient = getServiceClient();
  const [{ data: membership }, { data: profile }] = await Promise.all([
    serviceClient
      .from("organization_memberships")
      .select("org_role, admin_permissions")
      .eq("user_id", auth.user.id)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle(),
    serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", auth.user.id)
      .maybeSingle(),
  ]);

  const isGridmaster = profile?.platform_role === "gridmaster";
  if (!isGridmaster && !membership) {
    return { response: forbiddenResponse() };
  }

  const role = isGridmaster
    ? "gridmaster"
    : ((membership?.org_role as OrganizationRole | null) ?? "user");
  const permissions = buildPermissionContext(
    role,
    orgId,
    (membership?.admin_permissions as AdminPermissions | null) ?? null,
  );

  if (!isAllowed(permissions)) {
    return { response: forbiddenResponse() };
  }

  return {
    actor: auth.user,
    permissions,
    serviceClient,
  };
}
