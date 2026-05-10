import "server-only";

import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";

export type UserSessionPlatform = "web" | "ios" | "android";

export const USER_SESSION_ACTIVE_WINDOW_MS = 8 * 60 * 60 * 1000;

export interface UserSessionRecord {
  id: string;
  userId: string;
  orgId: string | null;
  supabaseSessionId: string | null;
  platform: UserSessionPlatform | null;
  appVersion: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  refreshTokenHash: string;
}

export interface TrackUserSessionInput {
  userId: string;
  orgId?: string | null;
  supabaseSessionId: string;
  platform: UserSessionPlatform;
  deviceLabel: string;
  appVersion?: string | null;
  ipAddress?: string | null;
}

interface FetchUserSessionsOptions {
  activeSince?: string;
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
  options: FetchUserSessionsOptions = {},
): Promise<UserSessionRecord[]> {
  let query = getServiceClient()
    .from("user_sessions")
    .select(
      "id, user_id, org_id, supabase_session_id, platform, app_version, device_label, ip_address, last_active_at, created_at, refresh_token_hash",
    )
    .eq("user_id", userId);

  if (options.activeSince) {
    query = query.gte("last_active_at", options.activeSince);
  }

  const { data, error } = await query.order("last_active_at", {
    ascending: false,
  });

  if (error) {
    throw error;
  }

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

export async function fetchActiveUserSessionsForUser(
  userId: string,
  now: Date = new Date(),
): Promise<UserSessionRecord[]> {
  return fetchUserSessionsForUser(userId, {
    activeSince: getActiveUserSessionCutoff(now),
  });
}

export function getActiveUserSessionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - USER_SESSION_ACTIVE_WINDOW_MS).toISOString();
}

export async function trackUserSessionForUser(
  input: TrackUserSessionInput,
): Promise<void> {
  const { error } = await getServiceClient()
    .from("user_sessions")
    .upsert(
      {
        user_id: input.userId,
        org_id: input.orgId ?? null,
        supabase_session_id: input.supabaseSessionId,
        refresh_token_hash: hashSupabaseSessionId(input.supabaseSessionId),
        platform: input.platform,
        app_version: input.appVersion ?? null,
        device_label: input.deviceLabel,
        ip_address: input.ipAddress ?? null,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "supabase_session_id" },
    );

  if (error) {
    throw error;
  }
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

function hashSupabaseSessionId(sessionId: string): string {
  return createHash("sha256")
    .update(`supabase-session:${sessionId}`)
    .digest("hex");
}

function isUserSessionPlatform(value: unknown): value is UserSessionPlatform {
  return value === "web" || value === "ios" || value === "android";
}
