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
    .eq("user_id", userId)
    // Filter partial rows created by switch_org before track-session fills in
    // refresh_token_hash. These are non-revokable transient rows.
    .not("refresh_token_hash", "is", null);

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

type UserSessionPlatformGroup = "web" | "mobile";

function toPlatformGroup(platform: UserSessionPlatform | null): UserSessionPlatformGroup {
  return platform === "web" ? "web" : "mobile";
}

export interface UserSessionOverview {
  active: UserSessionRecord[];
  stale: UserSessionRecord[];
}

const STALE_SESSIONS_LIMIT = 5;

/**
 * Self-service session list: the active session per platform (web/mobile -
 * only the single most recent one per platform counts, so two browser tabs
 * both pinged in the last few minutes don't each show as "active"), plus
 * the 5 most recently used sessions that have since gone quiet.
 */
export async function fetchUserSessionOverviewForUser(
  userId: string,
  now: Date = new Date(),
): Promise<UserSessionOverview> {
  const cutoffMs = now.getTime() - USER_SESSION_ACTIVE_WINDOW_MS;
  // Sort explicitly rather than trust the caller's ordering, since every
  // grouping decision below (most-recent-per-platform, most-recent-overall)
  // depends on it.
  const sessions = (await fetchUserSessionsForUser(userId)).sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );

  const byGroup = new Map<UserSessionPlatformGroup, UserSessionRecord[]>();
  for (const session of sessions) {
    const group = toPlatformGroup(session.platform);
    const list = byGroup.get(group) ?? [];
    list.push(session);
    byGroup.set(group, list);
  }

  const active: UserSessionRecord[] = [];
  const activeIds = new Set<string>();
  for (const group of byGroup.values()) {
    const mostRecent = group[0];
    if (mostRecent && new Date(mostRecent.lastActiveAt).getTime() >= cutoffMs) {
      active.push(mostRecent);
      activeIds.add(mostRecent.id);
    }
  }
  active.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());

  // 5 most recently used sessions among whatever wasn't picked as active.
  const stale = sessions.filter((s) => !activeIds.has(s.id)).slice(0, STALE_SESSIONS_LIMIT);

  return { active, stale };
}

export async function trackUserSessionForUser(input: TrackUserSessionInput): Promise<void> {
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
  return createHash("sha256").update(`supabase-session:${sessionId}`).digest("hex");
}

function isUserSessionPlatform(value: unknown): value is UserSessionPlatform {
  return value === "web" || value === "ios" || value === "android";
}
