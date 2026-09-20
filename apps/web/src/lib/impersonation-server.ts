// src/lib/impersonation-server.ts
// Server-side (Node + Edge compatible) cross-check for the impersonation
// cookie against the authoritative impersonation_sessions row.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface VerifiedImpersonation {
  targetUserId: string;
  targetOrgId: string;
  targetOrgRole: string;
  targetOrgSlug: string;
}

/**
 * The impersonation cookie (see impersonation.ts) is client-writable and is
 * populated mostly from client-held state, not the start_impersonation RPC's
 * return value. Every consumer must confirm a matching, active, non-expired
 * impersonation_sessions row actually exists — owned by this exact
 * gridmaster — before trusting the cookie's targetOrgId/targetUserId. This
 * mirrors the ownership re-verification already done for the Test Sandbox
 * cookie (three independent DB checks, none of which trust the cookie
 * alone).
 */
export async function verifyImpersonationSession(
  serviceClient: SupabaseClient<any, any, any>,
  sessionId: string,
  gridmasterId: string,
  authSessionId: string,
): Promise<VerifiedImpersonation | null> {
  const { data } = await serviceClient
    .from("impersonation_sessions")
    .select("target_user_id, target_org_id")
    .eq("session_id", sessionId)
    .eq("gridmaster_id", gridmasterId)
    .eq("auth_session_id", authSessionId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return null;

  const targetUserId = data.target_user_id as string | undefined;
  const targetOrgId = data.target_org_id as string | undefined;
  if (!targetUserId || !targetOrgId) return null;

  const [{ data: targetProfile }, { data: targetMembership }, { data: targetOrg }] =
    await Promise.all([
      serviceClient
        .from("profiles")
        .select("id")
        .eq("id", targetUserId)
        .is("deactivated_at", null)
        .is("scheduled_deletion_at", null)
        .maybeSingle(),
      serviceClient
        .from("organization_memberships")
        .select("org_role")
        .eq("user_id", targetUserId)
        .eq("org_id", targetOrgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient
        .from("organizations")
        .select("slug")
        .eq("id", targetOrgId)
        .is("archived_at", null)
        .is("suspended_at", null)
        .maybeSingle(),
    ]);

  const targetOrgRole = targetMembership?.org_role as string | undefined;
  const targetOrgSlug = targetOrg?.slug as string | undefined;
  if (!targetProfile || !targetOrgRole || !targetOrgSlug) return null;

  return { targetUserId, targetOrgId, targetOrgRole, targetOrgSlug };
}

/**
 * Ends the impersonation row when the gridmaster takes the /gridmaster escape.
 * Runs as the gridmaster (the RPC checks auth.uid()), and is best-effort: the
 * cookie is already cleared, so a failed end only leaves the row to expire.
 */
export async function endImpersonationOnEscape(
  userClient: SupabaseClient<any, any, any>,
  sessionId: string,
): Promise<boolean> {
  const { error } = await userClient.rpc("end_impersonation", {
    p_session_id: sessionId,
    p_reason: "navigation",
  });
  return !error;
}
