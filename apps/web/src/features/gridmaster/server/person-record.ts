import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbEmployee, DbInvitation } from "@/lib/db/types";
import { rowToEmployee, rowToInvitation } from "@/lib/db/mappers";
import { readLoginLock } from "@/lib/rate-limit";
import type { Invitation, OrganizationRole } from "@/types";
import type {
  GridmasterMembership,
  GridmasterPersonOrganization,
  GridmasterPersonProfile,
  GridmasterPersonRecord,
  GridmasterStaffRecord,
} from "../person-record";

// Explicit lists: a `*` would carry any token column a later migration adds.
const PROFILE_COLUMNS =
  "platform_role, first_name, last_name, mfa_enabled, terms_version, terms_accepted_at, scheduled_deletion_at, deactivation_warned_at, deactivated_at, deactivated_by, terminated_at, terminated_by, terminated_reason, created_at, updated_at";
const MEMBERSHIP_COLUMNS =
  "id, org_id, org_role, admin_permissions, joined_at, schedule_last_viewed_at, archived_at, archived_by, department_ids, dept_admin_ids, phone, onboarding_completed_at, tooltip_tours_completed, updated_at";
const EMPLOYEE_COLUMNS =
  "id, org_id, employee_number, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version, created_at, created_by, updated_by, updated_at";
const INVITATION_COLUMNS =
  "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids";

type Row = Record<string, unknown>;
type EmployeeRow = DbEmployee & {
  created_by: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

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
    updatedAt: (row.updated_at as string | null) ?? null,
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

async function resolveActors(
  client: SupabaseClient,
  ids: Iterable<string | null>,
): Promise<Record<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  const entries = await Promise.all(
    unique.map(async (id) => {
      const { data } = await client.auth.admin.getUserById(id);
      return data?.user?.email ? ([id, data.user.email] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
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
  const orgs = unwrap(
    await client.from("organizations").select("id, name, slug").in("id", orgIds),
  ) as { id: string; name: string; slug: string | null }[];
  return orgs
    .map((org) => {
      const match = memberships.find((membership) => membership.orgId === org.id);
      let membership: GridmasterMembership | null = null;
      if (match) {
        const { orgId: _orgId, ...rest } = match;
        membership = rest;
      }
      return {
        org,
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
    await client.from("employees").select(EMPLOYEE_COLUMNS).eq("id", employeeId).maybeSingle(),
  ) as EmployeeRow | null;
  if (!row) return null;
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
    organizations: await groupByOrganization(client, [], [staff], invitations),
  };
  return { ...record, actors: await resolveActors(client, actorIds(record)) };
}
