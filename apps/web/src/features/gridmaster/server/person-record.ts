import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbEmployee, DbInvitation, DbOrganization } from "@/lib/db/types";
import { rowToEmployee, rowToInvitation, rowToOrganizationTerminology } from "@/lib/db/mappers";
import { readLoginLock } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import type { Invitation, OrganizationRole } from "@/types";
import type {
  GridmasterFactor,
  GridmasterMembership,
  GridmasterPersonSecurity,
  GridmasterPersonSessions,
  GridmasterPersonOrganization,
  GridmasterPersonProfile,
  GridmasterPersonRecord,
  GridmasterStaffRecord,
} from "../person-record";

// Explicit lists: a `*` would carry any token column a later migration adds.
const PROFILE_COLUMNS =
  "platform_role, first_name, last_name, mfa_enabled, mfa_reenroll_required_at, terms_version, terms_accepted_at, scheduled_deletion_at, deactivation_warned_at, deactivated_at, deactivated_by, terminated_at, terminated_by, terminated_reason, created_at, updated_at";
const MEMBERSHIP_COLUMNS =
  "id, org_id, org_role, admin_permissions, joined_at, schedule_last_viewed_at, archived_at, archived_by, department_ids, dept_admin_ids, phone, onboarding_completed_at, tooltip_tours_completed, updated_at";
const EMPLOYEE_COLUMNS =
  "id, org_id, employee_number, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version, created_at, created_by, updated_by, updated_at";
const INVITATION_COLUMNS =
  "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids";

type Row = Record<string, unknown>;
type OrganizationLabelRow = Pick<
  DbOrganization,
  "focus_area_label" | "certification_label" | "role_label" | "department_label"
>;
type EmployeeRow = DbEmployee & {
  created_by: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

/** A missing account is an answer; any other Auth failure is not "no account". */
export function throwUnlessNotFound(error: unknown): void {
  if (!error) return;
  if ((error as { status?: number }).status === 404) return;
  throw error;
}

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

function mapProfile(row: Row): GridmasterPersonProfile {
  return {
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    platformRole: row.platform_role as string,
    mfaEnabled: Boolean(row.mfa_enabled),
    termsVersion: (row.terms_version as string | null) ?? null,
    termsAcceptedAt: (row.terms_accepted_at as string | null) ?? null,
    scheduledDeletionAt: (row.scheduled_deletion_at as string | null) ?? null,
    deactivationWarnedAt: (row.deactivation_warned_at as string | null) ?? null,
    deactivatedAt: (row.deactivated_at as string | null) ?? null,
    deactivatedBy: (row.deactivated_by as string | null) ?? null,
    terminatedAt: (row.terminated_at as string | null) ?? null,
    terminatedBy: (row.terminated_by as string | null) ?? null,
    terminatedReason: (row.terminated_reason as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapMembership(row: Row): GridmasterMembership {
  return {
    id: row.id as string,
    orgRole: row.org_role as OrganizationRole,
    adminPermissions: (row.admin_permissions as GridmasterMembership["adminPermissions"]) ?? null,
    joinedAt: row.joined_at as string,
    scheduleLastViewedAt: (row.schedule_last_viewed_at as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    archivedBy: (row.archived_by as string | null) ?? null,
    departmentIds: (row.department_ids as number[] | null) ?? [],
    deptAdminIds: (row.dept_admin_ids as number[] | null) ?? [],
    phone: (row.phone as string | null) ?? null,
    onboardingCompletedAt: (row.onboarding_completed_at as string | null) ?? null,
    tooltipToursCompleted: (row.tooltip_tours_completed as Record<string, unknown> | null) ?? {},
    updatedAt: row.updated_at as string,
  };
}

function mapStaff(row: EmployeeRow): GridmasterStaffRecord {
  return {
    ...rowToEmployee(row),
    orgId: row.org_id,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function fetchInvitations(
  client: SupabaseClient,
  email: string | null,
  employeeIds: string[],
): Promise<Invitation[]> {
  const queries: PromiseLike<{ data: unknown; error: unknown }>[] = [];
  // send_invitation stores the address lowercased, so an exact match holds.
  if (email) {
    queries.push(
      client.from("invitations").select(INVITATION_COLUMNS).eq("email", email.toLowerCase()),
    );
  }
  if (employeeIds.length > 0) {
    queries.push(
      client.from("invitations").select(INVITATION_COLUMNS).in("employee_id", employeeIds),
    );
  }
  const byId = new Map<string, Invitation>();
  for (const result of await Promise.all(queries)) {
    for (const row of unwrap(result as { data: DbInvitation[] | null; error: unknown }) ?? []) {
      byId.set(row.id, rowToInvitation(row));
    }
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function resolveActors(
  client: SupabaseClient,
  ids: Iterable<string | null>,
): Promise<Record<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {};
  // One query for every actor (migration 066), not an Auth call each (F-92).
  const { data, error } = await client.rpc("gridmaster_user_emails", { p_user_ids: unique });
  if (error) {
    // Names are a courtesy; the record still loads without them.
    logger.warn({ error }, "gridmaster actor emails unavailable");
    return {};
  }
  const rows = (data ?? []) as Array<{ id: string; email: string | null }>;
  return Object.fromEntries(
    rows.filter((row) => row.email).map((row) => [row.id, row.email as string]),
  );
}

async function groupByOrganization(
  client: SupabaseClient,
  memberships: (GridmasterMembership & { orgId: string })[],
  employees: GridmasterStaffRecord[],
  invitations: Invitation[],
): Promise<GridmasterPersonOrganization[]> {
  const orgIds = [
    ...new Set([
      ...memberships.map((membership) => membership.orgId),
      ...employees.map((employee) => employee.orgId),
      ...invitations.map((invitation) => invitation.orgId),
    ]),
  ];
  if (orgIds.length === 0) return [];
  const [orgRows, departments, focusAreas, roles, certifications] = await Promise.all([
    client
      .from("organizations")
      .select("id, name, slug, department_label, focus_area_label, role_label, certification_label")
      .in("id", orgIds),
    client.from("departments").select("id, org_id, name").in("org_id", orgIds),
    client.from("focus_areas").select("id, org_id, name").in("org_id", orgIds),
    client.from("organization_roles").select("id, org_id, name").in("org_id", orgIds),
    client.from("certifications").select("id, org_id, name").in("org_id", orgIds),
  ]);
  const namesFor = (result: { data: unknown; error: unknown }, orgId: string) =>
    Object.fromEntries(
      (unwrap(result) as { id: number; org_id: string; name: string }[])
        .filter((row) => row.org_id === orgId)
        .map((row) => [row.id, row.name]),
    );
  return (unwrap(orgRows) as Row[])
    .map((row) => {
      const org = {
        id: row.id as string,
        name: row.name as string,
        slug: (row.slug as string | null) ?? null,
      };
      const match = memberships.find((membership) => membership.orgId === org.id);
      let membership: GridmasterMembership | null = null;
      if (match) {
        const { orgId: _orgId, ...rest } = match;
        membership = rest;
      }
      return {
        org,
        terminology: rowToOrganizationTerminology(row as OrganizationLabelRow),
        names: {
          departments: namesFor(departments, org.id),
          focusAreas: namesFor(focusAreas, org.id),
          roles: namesFor(roles, org.id),
          certifications: namesFor(certifications, org.id),
        },
        membership,
        employees: employees.filter((employee) => employee.orgId === org.id),
        invitations: invitations.filter((invitation) => invitation.orgId === org.id),
      };
    })
    .sort((a, b) => a.org.name.localeCompare(b.org.name));
}

function actorIds(record: Omit<GridmasterPersonRecord, "actors">): (string | null)[] {
  return [
    record.profile?.deactivatedBy ?? null,
    record.profile?.terminatedBy ?? null,
    record.liveImpersonation?.gridmasterId ?? null,
    ...record.organizations.flatMap((organization) => [
      organization.membership?.archivedBy ?? null,
      ...organization.employees.flatMap((employee) => [employee.createdBy, employee.updatedBy]),
      ...organization.invitations.map((invitation) => invitation.invitedBy),
    ]),
  ];
}

interface AuthFactor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
  created_at: string;
  last_challenged_at?: string;
}

// Explicit columns: device hashes, push and calendar tokens, refresh token
// hashes and IP addresses stay out.
async function loadSecurityAndSessions(
  client: SupabaseClient,
  userId: string,
  factors: AuthFactor[],
  profile: Row | null,
): Promise<{ security: GridmasterPersonSecurity; sessions: GridmasterPersonSessions }> {
  const [devices, sessionRows, pushRows, feedRows] = await Promise.all([
    client
      .from("user_known_devices")
      .select("id, platform, first_seen_at, last_seen_at")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false }),
    client
      .from("user_sessions")
      .select(
        "id, org_id, platform, device_label, browser_name, browser_version, app_version, location_city, location_country, created_at, last_active_at",
      )
      .eq("user_id", userId)
      .order("last_active_at", { ascending: false }),
    client
      .from("mobile_device_tokens")
      .select("id, org_id, platform, last_seen_at, disabled_at, created_at")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false }),
    client
      .from("calendar_feed_tokens")
      .select("id, org_id, issued_at, revoked_at")
      .eq("user_id", userId)
      .order("issued_at", { ascending: false }),
  ]);

  const mappedFactors: GridmasterFactor[] = factors.map((factor) => ({
    id: factor.id,
    type: factor.factor_type,
    name: factor.friendly_name || null,
    status: factor.status,
    createdAt: factor.created_at,
    lastUsedAt: factor.last_challenged_at ?? null,
  }));

  return {
    security: {
      twoFactor: {
        enabled: Boolean(profile?.mfa_enabled),
        reenrollRequiredAt: (profile?.mfa_reenroll_required_at as string | null) ?? null,
        factors: mappedFactors,
      },
      knownDevices: (unwrap(devices) as Row[]).map((row) => ({
        id: row.id as string,
        platform: (row.platform as string | null) ?? null,
        firstSeenAt: row.first_seen_at as string,
        lastSeenAt: row.last_seen_at as string,
      })),
    },
    sessions: {
      sessions: (unwrap(sessionRows) as Row[]).map((row) => {
        const browser = [row.browser_name, row.browser_version].filter(Boolean).join(" ");
        const location = [row.location_city, row.location_country].filter(Boolean).join(", ");
        return {
          id: row.id as string,
          orgId: (row.org_id as string | null) ?? null,
          platform: (row.platform as string | null) ?? null,
          deviceLabel: (row.device_label as string | null) ?? null,
          browser: browser || null,
          appVersion: (row.app_version as string | null) ?? null,
          location: location || null,
          createdAt: row.created_at as string,
          lastActiveAt: (row.last_active_at as string | null) ?? null,
        };
      }),
      pushDevices: (unwrap(pushRows) as Row[]).map((row) => ({
        id: row.id as string,
        orgId: (row.org_id as string | null) ?? null,
        platform: row.platform as string,
        lastSeenAt: (row.last_seen_at as string | null) ?? null,
        disabledAt: (row.disabled_at as string | null) ?? null,
        createdAt: row.created_at as string,
      })),
      calendarFeeds: (unwrap(feedRows) as Row[]).map((row) => ({
        id: row.id as string,
        orgId: row.org_id as string,
        issuedAt: row.issued_at as string,
        revokedAt: (row.revoked_at as string | null) ?? null,
      })),
    },
  };
}

/**
 * The whole record for an account. Null when there is no such account, or
 * when it belongs to a Gridmaster: those are managed on Gridmaster Accounts.
 */
export async function buildPersonRecordForUser(
  client: SupabaseClient,
  userId: string,
): Promise<GridmasterPersonRecord | null> {
  const [profileRow, authResult] = await Promise.all([
    client.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle(),
    client.auth.admin.getUserById(userId),
  ]);
  const profile = unwrap(profileRow) as Row | null;
  if (profile?.platform_role === "gridmaster") return null;
  throwUnlessNotFound(authResult.error);
  const authUser = authResult.data?.user ?? null;
  if (!authUser && !profile) return null;

  const email = authUser?.email ?? null;
  const nowIso = new Date().toISOString();
  const [terms, consents, impersonation, membershipRows, employeeRows, loginLock] =
    await Promise.all([
      client
        .from("terms_acceptances")
        .select("terms_version, accepted_at, user_agent")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false }),
      client
        .from("cookie_consents")
        .select("consent_version, consent, created_at, user_agent")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      client
        .from("impersonation_sessions")
        .select("gridmaster_id, target_org_id, created_at, expires_at")
        .eq("target_user_id", userId)
        .is("ended_at", null)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1),
      client.from("organization_memberships").select(MEMBERSHIP_COLUMNS).eq("user_id", userId),
      client.from("employees").select(EMPLOYEE_COLUMNS).eq("user_id", userId),
      email ? readLoginLock(email) : Promise.resolve(null),
    ]);

  const employees = (unwrap(employeeRows) as EmployeeRow[]).map(mapStaff);
  const memberships = (unwrap(membershipRows) as Row[]).map((row) => ({
    ...mapMembership(row),
    orgId: row.org_id as string,
  }));
  const invitations = await fetchInvitations(
    client,
    email,
    employees.map((employee) => employee.id),
  );
  const liveRow = (unwrap(impersonation) as Row[])[0];
  const { security, sessions } = await loadSecurityAndSessions(
    client,
    userId,
    (authUser?.factors ?? []) as AuthFactor[],
    profile,
  );

  const record: Omit<GridmasterPersonRecord, "actors"> = {
    account: authUser
      ? {
          userId: authUser.id,
          email: authUser.email ?? "",
          createdAt: authUser.created_at,
          lastSignInAt: authUser.last_sign_in_at ?? null,
          emailConfirmedAt: authUser.email_confirmed_at ?? null,
        }
      : null,
    profile: profile ? mapProfile(profile) : null,
    termsAcceptances: (unwrap(terms) as Row[]).map((row) => ({
      version: row.terms_version as string,
      acceptedAt: row.accepted_at as string,
      userAgent: (row.user_agent as string | null) ?? null,
    })),
    cookieConsents: (unwrap(consents) as Row[]).map((row) => ({
      version: (row.consent_version as string | null) ?? null,
      consent: (row.consent as Record<string, boolean> | null) ?? {},
      createdAt: row.created_at as string,
      userAgent: (row.user_agent as string | null) ?? null,
    })),
    liveImpersonation: liveRow
      ? {
          gridmasterId: liveRow.gridmaster_id as string,
          orgId: liveRow.target_org_id as string,
          startedAt: liveRow.created_at as string,
          expiresAt: liveRow.expires_at as string,
        }
      : null,
    loginLock,
    security,
    sessions,
    organizations: await groupByOrganization(client, memberships, employees, invitations),
  };
  return { ...record, actors: await resolveActors(client, actorIds(record)) };
}

/**
 * The record for a staff row. A linked row resolves to its account's full
 * record; an unlinked one carries the row and the invitations sent for it.
 */
export async function buildPersonRecordForStaff(
  client: SupabaseClient,
  employeeId: string,
): Promise<GridmasterPersonRecord | null> {
  const row = unwrap(
    await client
      .from("employees")
      .select(`${EMPLOYEE_COLUMNS}, organizations!inner(workspace_kind)`)
      .eq("id", employeeId)
      .maybeSingle(),
  ) as (EmployeeRow & { organizations: { workspace_kind: string } | null }) | null;
  // A Test Sandbox's staff are clones, not people.
  if (!row || row.organizations?.workspace_kind !== "real") return null;
  if (row.user_id) return buildPersonRecordForUser(client, row.user_id);

  const staff = mapStaff(row);
  const invitations = await fetchInvitations(client, staff.email.trim() || null, [staff.id]);
  const record: Omit<GridmasterPersonRecord, "actors"> = {
    account: null,
    profile: null,
    termsAcceptances: [],
    cookieConsents: [],
    liveImpersonation: null,
    loginLock: null,
    security: null,
    sessions: null,
    organizations: await groupByOrganization(client, [], [staff], invitations),
  };
  return { ...record, actors: await resolveActors(client, actorIds(record)) };
}
