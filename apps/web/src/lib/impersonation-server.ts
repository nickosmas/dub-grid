// src/lib/impersonation-server.ts
// Server-side (Node + Edge compatible) cross-check for the impersonation
// cookie against the authoritative impersonation_sessions row.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface VerifiedImpersonation {
  targetUserId: string;
  targetOrgId: string;
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
): Promise<VerifiedImpersonation | null> {
  const { data } = await serviceClient
    .from("impersonation_sessions")
    .select("target_user_id, target_org_id")
    .eq("session_id", sessionId)
    .eq("gridmaster_id", gridmasterId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return null;

  const targetUserId = data.target_user_id as string | undefined;
  const targetOrgId = data.target_org_id as string | undefined;
  if (!targetUserId || !targetOrgId) return null;

  return { targetUserId, targetOrgId };
}
