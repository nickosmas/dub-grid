import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import type { OrganizationRole, PlatformRole } from "@dubgrid/domain";
import { createRequestSupabaseClient, requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { USER_SESSION_ACTIVE_WINDOW_MS } from "@/features/account/server";
import type { GridmasterUserSession, GridmasterUserSessionOrg } from "@/types";

type Row = Record<string, unknown>;

interface UserLookup {
  name: string | null;
  email: string | null;
  platformRole: PlatformRole | null;
}

interface OrgLookup {
  name: string;
  slug: string | null;
}

const SESSION_SELECT =
  "id, user_id, org_id, supabase_session_id, platform, app_version, device_label, ip_address, last_active_at, created_at";
const MEMBERSHIP_SELECT = "user_id, org_id, org_role, archived_at";
const ORG_SELECT = "id, name, slug";
const PROFILE_SELECT = "id, first_name, last_name";
const RECENT_SESSION_WINDOW_MS = 30 * 86_400_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
  platform: z.enum(["web", "ios", "android", "unknown"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? undefined,
      platform: req.nextUrl.searchParams.get("platform") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE;
    const offset = parsed.data.offset ?? 0;

    const requestClient = createRequestSupabaseClient(req);
    const serviceClient = getServiceClient();

    let sessionsQuery = serviceClient
      .from("user_sessions")
      .select(SESSION_SELECT)
      // Skip transient rows inserted by the JWT hook / switch_org before
      // track-session fills in device + org. Matches the filter used by
      // fetchUserSessionsForUser.
      .not("refresh_token_hash", "is", null)
      .order("last_active_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (parsed.data.orgId) {
      sessionsQuery = sessionsQuery.eq("org_id", parsed.data.orgId);
    }
    if (parsed.data.platform === "unknown") {
      sessionsQuery = sessionsQuery.is("platform", null);
    } else if (parsed.data.platform) {
      sessionsQuery = sessionsQuery.eq("platform", parsed.data.platform);
    }

    const [
      usersResult,
      gridmasterAccountsResult,
      sessionsResult,
      membershipsResult,
      orgsResult,
      profilesResult,
    ] = await Promise.all([
      requestClient.rpc("get_all_users_with_profiles"),
      requestClient.rpc("get_gridmaster_accounts"),
      sessionsQuery,
      serviceClient
        .from("organization_memberships")
        .select(MEMBERSHIP_SELECT)
        .is("archived_at", null),
      serviceClient.from("organizations").select(ORG_SELECT),
      serviceClient.from("profiles").select(PROFILE_SELECT),
    ]);

    for (const result of [
      usersResult,
      gridmasterAccountsResult,
      sessionsResult,
      membershipsResult,
      orgsResult,
      profilesResult,
    ]) {
      if (result.error) {
        throw result.error;
      }
    }

    // Platform-account sessions are few (a handful of gridmaster operators),
    // so they're fetched separately and in full rather than paginated - the
    // "Gridmaster sessions" panel should never look truncated.
    const gridmasterUserIds = ((gridmasterAccountsResult.data ?? []) as Row[])
      .map((row) => stringOrNull(row.id))
      .filter((id): id is string => Boolean(id));

    let gridmasterSessionRows: Row[] = [];
    if (gridmasterUserIds.length > 0) {
      const { data, error } = await serviceClient
        .from("user_sessions")
        .select(SESSION_SELECT)
        .not("refresh_token_hash", "is", null)
        .in("user_id", gridmasterUserIds)
        .order("last_active_at", { ascending: false });
      if (error) {
        throw error;
      }
      gridmasterSessionRows = (data ?? []) as Row[];
    }

    const mapArgs = {
      users: (usersResult.data ?? []) as Row[],
      gridmasterAccounts: (gridmasterAccountsResult.data ?? []) as Row[],
      memberships: (membershipsResult.data ?? []) as Row[],
      organizations: (orgsResult.data ?? []) as Row[],
      profiles: (profilesResult.data ?? []) as Row[],
      now: new Date(),
    };

    const sessions = mapSessions({ sessions: (sessionsResult.data ?? []) as Row[], ...mapArgs });
    const gridmasterSessions = mapSessions({ sessions: gridmasterSessionRows, ...mapArgs });

    return NextResponse.json({
      sessions: sessions.filter((session) => session.userPlatformRole !== "gridmaster"),
      gridmasterSessions,
    });
  } catch (error) {
    logger.error({ error }, "gridmaster security sessions GET failed");
    return NextResponse.json(
      { error: "We couldn't load your devices. Refresh and try again." },
      { status: 500 },
    );
  }
}

function mapSessions(input: {
  sessions: Row[];
  users: Row[];
  gridmasterAccounts: Row[];
  memberships: Row[];
  organizations: Row[];
  profiles: Row[];
  now: Date;
}): GridmasterUserSession[] {
  const namesByUserId = new Map<string, string>();
  for (const row of input.profiles) {
    const id = stringOrNull(row.id);
    const name = fullName(row.first_name, row.last_name);
    if (!id || !name) continue;
    namesByUserId.set(id, name);
  }

  const usersById = new Map<string, UserLookup>();
  for (const row of input.users) {
    const id = stringOrNull(row.id);
    if (!id) continue;
    usersById.set(id, {
      name: namesByUserId.get(id) ?? null,
      email: stringOrNull(row.email),
      platformRole: platformRoleOrNull(row.platform_role),
    });
  }

  for (const row of input.gridmasterAccounts) {
    const id = stringOrNull(row.id);
    if (!id) continue;
    usersById.set(id, {
      name: fullName(row.first_name, row.last_name) ?? namesByUserId.get(id) ?? null,
      email: stringOrNull(row.email),
      platformRole: "gridmaster",
    });
  }

  const orgsById = new Map<string, OrgLookup>();
  for (const row of input.organizations) {
    const id = stringOrNull(row.id);
    const name = stringOrNull(row.name);
    if (!id || !name) continue;
    orgsById.set(id, {
      name,
      slug: stringOrNull(row.slug),
    });
  }

  const orgsByUserAndOrg = new Map<string, GridmasterUserSessionOrg>();
  for (const row of input.memberships) {
    const userId = stringOrNull(row.user_id);
    const orgId = stringOrNull(row.org_id);
    if (!userId || !orgId) continue;
    const org = orgsById.get(orgId);
    orgsByUserAndOrg.set(`${userId}:${orgId}`, {
      orgId,
      orgName: org?.name ?? orgId,
      orgSlug: org?.slug ?? null,
      orgRole: organizationRoleOrNull(row.org_role),
    });
  }

  const nowMs = input.now.getTime();
  return input.sessions.map((row) => {
    const userId = stringOrNull(row.user_id) ?? "";
    const orgId = stringOrNull(row.org_id);
    const user = usersById.get(userId);
    return {
      id: stringOrNull(row.id) ?? "",
      userId,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      userPlatformRole: user?.platformRole ?? null,
      org: getSessionOrg(userId, orgId, orgsById, orgsByUserAndOrg),
      supabaseSessionId: stringOrNull(row.supabase_session_id),
      platform: userSessionPlatformOrNull(row.platform),
      appVersion: stringOrNull(row.app_version),
      deviceLabel: stringOrNull(row.device_label),
      ipAddress: stringOrNull(row.ip_address),
      lastActiveAt: String(row.last_active_at ?? ""),
      createdAt: String(row.created_at ?? ""),
      status: getSessionStatus(String(row.last_active_at ?? ""), nowMs),
    };
  });
}

function getSessionOrg(
  userId: string,
  orgId: string | null,
  orgsById: Map<string, OrgLookup>,
  orgsByUserAndOrg: Map<string, GridmasterUserSessionOrg>,
): GridmasterUserSessionOrg | null {
  if (!orgId) return null;
  const membershipOrg = orgsByUserAndOrg.get(`${userId}:${orgId}`);
  if (membershipOrg) return membershipOrg;
  const org = orgsById.get(orgId);
  return {
    orgId,
    orgName: org?.name ?? orgId,
    orgSlug: org?.slug ?? null,
    orgRole: null,
  };
}

function getSessionStatus(lastActiveAt: string, nowMs: number): GridmasterUserSession["status"] {
  const lastActiveMs = Date.parse(lastActiveAt);
  if (!Number.isFinite(lastActiveMs)) {
    return "stale";
  }
  const ageMs = nowMs - lastActiveMs;
  if (ageMs <= USER_SESSION_ACTIVE_WINDOW_MS) {
    return "active";
  }
  if (ageMs <= RECENT_SESSION_WINDOW_MS) {
    return "recent";
  }
  return "stale";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function fullName(firstName: unknown, lastName: unknown): string | null {
  const name = [stringOrNull(firstName), stringOrNull(lastName)].filter(Boolean).join(" ").trim();
  return name || null;
}

function userSessionPlatformOrNull(value: unknown): GridmasterUserSession["platform"] {
  return value === "web" || value === "ios" || value === "android" ? value : null;
}

function organizationRoleOrNull(value: unknown): OrganizationRole | null {
  return typeof value === "string" && value.trim() ? (value as OrganizationRole) : null;
}

function platformRoleOrNull(value: unknown): PlatformRole | null {
  return typeof value === "string" && value.trim() ? (value as PlatformRole) : null;
}
