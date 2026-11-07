import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A Test Sandbox clones staff records and makes its owner a Super Admin there,
 * so it needs what those records already need in the source organization.
 */
export async function canUseTestSandbox(
  serviceClient: SupabaseClient,
  userId: string,
  sourceOrgId: string,
): Promise<boolean> {
  const [{ data: membership }, { data: profile }, { data: organization }, employee] =
    await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", userId)
        .eq("org_id", sourceOrgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient.from("profiles").select("platform_role").eq("id", userId).maybeSingle(),
      serviceClient
        .from("organizations")
        .select("archived_at, suspended_at")
        .eq("id", sourceOrgId)
        .maybeSingle(),
      serviceClient
        .from("employees")
        .select("suspended_at")
        .eq("user_id", userId)
        .eq("org_id", sourceOrgId)
        .maybeSingle(),
    ]);
  if (profile?.platform_role === "gridmaster") return true;
  if (!organization || organization.archived_at != null || organization.suspended_at != null) {
    return false;
  }
  if (employee.error || employee.data?.suspended_at != null) return false;
  if (membership?.org_role === "super_admin") return true;
  const permissions = membership?.admin_permissions as Record<string, boolean> | null | undefined;
  return membership?.org_role === "admin" && permissions?.canManageEmployees === true;
}

/**
 * The sandbox this session owns, if its owner may still use one. A demotion
 * takes effect on the next request rather than when the sandbox expires.
 */
export async function findUsableSandbox(
  serviceClient: SupabaseClient,
  input: { sandboxOrgId: string; userId: string; sessionId: string },
): Promise<{ id: string } | null> {
  const { data: sandbox } = await serviceClient
    .from("organizations")
    .select("id, sandbox_source_org_id")
    .eq("id", input.sandboxOrgId)
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", input.userId)
    .eq("sandbox_owner_session_id", input.sessionId)
    .is("archived_at", null)
    .maybeSingle();
  if (!sandbox?.sandbox_source_org_id) return null;

  const allowed = await canUseTestSandbox(
    serviceClient,
    input.userId,
    sandbox.sandbox_source_org_id as string,
  );
  return allowed ? { id: sandbox.id as string } : null;
}
