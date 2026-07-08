import { supabase, logAudit } from "./shared";
import type { ImpersonationHistoryEntry } from "@/types";

export async function fetchUserSessions() {
  const { data, error } = await supabase
    .from("user_sessions")
    .select(
      "id, user_id, org_id, supabase_session_id, platform, app_version, device_label, ip_address, last_active_at, created_at, refresh_token_hash",
    )
    .not("refresh_token_hash", "is", null)
    .order("last_active_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.user_id as string,
    orgId: (row.org_id as string | null) ?? null,
    supabaseSessionId: (row.supabase_session_id as string | null) ?? null,
    platform: isUserSessionPlatform(row.platform) ? row.platform : null,
    appVersion: (row.app_version as string | null) ?? null,
    deviceLabel: (row.device_label as string | null) ?? null,
    ipAddress: (row.ip_address as string | null) ?? null,
    lastActiveAt: row.last_active_at as string,
    createdAt: row.created_at as string,
    refreshTokenHash: row.refresh_token_hash as string,
  }));
}

export async function revokeUserSession(refreshTokenHash: string): Promise<void> {
  const { error } = await supabase
    .from("user_sessions")
    .delete()
    .eq("refresh_token_hash", refreshTokenHash);

  if (error) throw error;
}

function isUserSessionPlatform(value: unknown): value is "web" | "ios" | "android" {
  return value === "web" || value === "ios" || value === "android";
}

export async function startImpersonation(
  targetUserId: string,
  justification: string,
  ipAddress?: string,
  userAgent?: string,
  targetOrgId?: string,
) {
  const { data, error } = await supabase.rpc("start_impersonation", {
    p_target_user_id: targetUserId,
    p_justification: justification,
    p_ip_address: ipAddress ?? null,
    p_user_agent: userAgent ?? null,
    p_target_org_id: targetOrgId ?? null,
  });
  if (error) throw error;
  const result = data as { session_id: string; expires_at: string };
  void logAudit(
    "impersonation.started",
    "impersonation_session",
    result.session_id,
    { targetUserId, justification },
    targetOrgId,
  );
  return result;
}

export async function endImpersonation(
  sessionId: string,
  reason: string = "manual",
  targetOrgId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("end_impersonation", {
    p_session_id: sessionId,
    p_reason: reason,
  });
  if (error) throw error;
  void logAudit(
    "impersonation.ended",
    "impersonation_session",
    sessionId,
    { reason },
    targetOrgId ?? null,
  );
}

export async function fetchImpersonationHistory(options?: {
  limit?: number;
  offset?: number;
}): Promise<ImpersonationHistoryEntry[]> {
  const { data, error } = await supabase.rpc("get_impersonation_history", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    sessionId: row.session_id as string,
    gridmasterId: row.gridmaster_id as string,
    gridmasterEmail: row.gridmaster_email as string,
    targetUserId: row.target_user_id as string,
    targetEmail: row.target_email as string,
    targetOrgId: row.target_org_id as string,
    targetOrgName: (row.target_org_name as string | null) ?? null,
    justification: (row.justification as string) ?? "",
    ipAddress: (row.ip_address as string | null) ?? null,
    userAgent: (row.user_agent as string | null) ?? null,
    createdAt: row.created_at as string,
    endedAt: (row.ended_at as string | null) ?? null,
    endReason: (row.end_reason as string | null) ?? null,
    expiresAt: row.expires_at as string,
  }));
}
