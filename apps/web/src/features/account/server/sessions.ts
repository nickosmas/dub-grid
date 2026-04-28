import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

export interface UserSessionRecord {
  id: string;
  userId: string;
  deviceLabel: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  refreshTokenHash: string;
}

export async function clearImpersonationSessionsForGridmaster(
  gridmasterUserId: string,
): Promise<void> {
  const { error } = await getServiceClient()
    .from("impersonation_sessions")
    .delete()
    .eq("gridmaster_id", gridmasterUserId);

  if (error) {
    throw error;
  }
}

export async function fetchUserSessionsForUser(
  userId: string,
): Promise<UserSessionRecord[]> {
  const { data, error } = await getServiceClient()
    .from("user_sessions")
    .select(
      "id, user_id, device_label, ip_address, last_active_at, created_at, refresh_token_hash",
    )
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.user_id as string,
    deviceLabel: (row.device_label as string | null) ?? null,
    ipAddress: (row.ip_address as string | null) ?? null,
    lastActiveAt: row.last_active_at as string,
    createdAt: row.created_at as string,
    refreshTokenHash: row.refresh_token_hash as string,
  }));
}

export async function revokeUserSessionForUser(
  userId: string,
  refreshTokenHash: string,
): Promise<void> {
  const { error } = await getServiceClient()
    .from("user_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("refresh_token_hash", refreshTokenHash);

  if (error) {
    throw error;
  }
}
