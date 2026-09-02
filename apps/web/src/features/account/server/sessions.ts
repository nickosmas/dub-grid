import "server-only";

import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { revokeSession } from "@/lib/auth/revocation";

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
  browserName: string | null;
  browserVersion: string | null;
  ipAddress: string | null;
  locationCity: string | null;
  locationCountry: string | null;
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
  browserName?: string | null;
  browserVersion?: string | null;
  ipAddress?: string | null;
  locationCity?: string | null;
  locationCountry?: string | null;
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
      "id, user_id, org_id, supabase_session_id, platform, app_version, device_label, browser_name, browser_version, ip_address, location_city, location_country, last_active_at, created_at, refresh_token_hash",
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
    browserName: (row.browser_name as string | null) ?? null,
    browserVersion: (row.browser_version as string | null) ?? null,
    ipAddress: (row.ip_address as string | null) ?? null,
    locationCity: (row.location_city as string | null) ?? null,
    locationCountry: (row.location_country as string | null) ?? null,
    lastActiveAt: row.last_active_at as string,
    createdAt: row.created_at as string,
    refreshTokenHash: row.refresh_token_hash as string,
  }));
}

export interface UserSessionOverview {
  active: UserSessionRecord[];
  stale: UserSessionRecord[];
}

const STALE_SESSIONS_LIMIT = 5;

interface FetchUserSessionOverviewOptions {
  now?: Date;
  currentSupabaseSessionId?: string | null;
}

export async function fetchUserSessionOverviewForUser(
  userId: string,
  options: FetchUserSessionOverviewOptions = {},
): Promise<UserSessionOverview> {
  const now = options.now ?? new Date();
  const cutoffMs = now.getTime() - USER_SESSION_ACTIVE_WINDOW_MS;
  const sessions = (await fetchUserSessionsForUser(userId)).sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );

  const active = sessions.filter(
    (session) =>
      (options.currentSupabaseSessionId != null &&
        session.supabaseSessionId === options.currentSupabaseSessionId) ||
      new Date(session.lastActiveAt).getTime() >= cutoffMs,
  );
  const activeIds = new Set(active.map((session) => session.id));
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
        browser_name: input.browserName ?? null,
        browser_version: input.browserVersion ?? null,
        ip_address: input.ipAddress ?? null,
        location_city: input.locationCity ?? null,
        location_country: input.locationCountry ?? null,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "supabase_session_id" },
    );

  if (error) {
    throw error;
  }
}

/**
 * Revokes one of the user's device sessions.
 *
 * Deleting the `user_sessions` row on its own only removes the device from the
 * "your sessions" list — it does nothing to the access token that device is
 * holding, which stays valid until it expires. Writing the revocation marker
 * first is what actually cuts that device off, so it must happen even if the
 * row is already gone.
 */
export async function revokeUserSessionForUser(
  userId: string,
  refreshTokenHash: string,
): Promise<void> {
  const client = getServiceClient();

  const { data: row } = await client
    .from("user_sessions")
    .select("supabase_session_id")
    .eq("user_id", userId)
    .eq("refresh_token_hash", refreshTokenHash)
    .maybeSingle();

  if (row?.supabase_session_id) {
    await revokeSession(row.supabase_session_id);
  }

  const { error } = await client
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
