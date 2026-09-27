import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRow } from "./enrich";
import { AUDIT_ACTIONS, PERSON_ACTIVITY_CATEGORIES } from "./registry";
import { diffPermissions } from "@/lib/permission-labels";

export { diffPermissions };

export interface RoleChangeLogRow {
  id: string;
  org_id: string | null;
  target_user_id: string;
  changed_by_id: string | null;
  from_role: string;
  to_role: string;
  change_type: string;
  permissions_before: Record<string, unknown> | null;
  permissions_after: Record<string, unknown> | null;
  created_at: string;
}

export interface EmployeeInvitationRow {
  id: string;
  org_id: string;
  invited_by: string | null;
  email: string;
  role_to_assign: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface EmployeeActivitySubject {
  id: string;
  org_id: string;
  user_id: string | null;
  created_at: string | null;
  created_by: string | null;
}

export interface EmployeeActivitySources {
  employee: EmployeeActivitySubject;
  auditRows: AuditRow[];
  roleChanges: RoleChangeLogRow[];
  invitations: EmployeeInvitationRow[];
  now?: Date;
}

/**
 * The app writes an audit row and the database writes a ledger row for the
 * same role edit, a few hundred milliseconds apart. Anything closer than this
 * is treated as one event.
 */
export const ACCESS_DEDUPE_WINDOW_MS = 15_000;

const ACCESS_AUDIT_PREFIXES = ["role.", "permissions.", "organization_access.", "membership."];

/**
 * Merges everything the organization has recorded about one person into a
 * single audit-row-shaped list: app-written `audit_log` rows, the database's
 * `role_change_log` ledger (which catches role and permission edits the app
 * never logged), and the invitation lifecycle (sent, accepted, revoked,
 * expired), which the web invitation flow does not audit at all. Newest first.
 */
export function buildEmployeeActivityRows(sources: EmployeeActivitySources): AuditRow[] {
  const now = sources.now ?? new Date();
  const rows: AuditRow[] = [...sources.auditRows];

  for (const change of sources.roleChanges) {
    const converted = roleChangeToAuditRow(change);
    if (!isAlreadyAudited(sources.auditRows, converted)) rows.push(converted);
  }

  for (const invitation of sources.invitations) {
    for (const event of invitationLifecycleRows(invitation, sources.employee, now)) {
      if (!isAlreadyAudited(sources.auditRows, event)) rows.push(event);
    }
  }

  const added = employeeAddedRow(sources.employee);
  if (added && !isAlreadyAudited(sources.auditRows, added)) rows.push(added);

  return rows.sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at));
}

function roleChangeToAuditRow(change: RoleChangeLogRow): AuditRow {
  const base = {
    id: `role-change-${change.id}`,
    org_id: change.org_id,
    actor_id: change.changed_by_id,
    actor_email: null,
    resource_type: "organization_membership",
    resource_id: change.target_user_id,
    created_at: change.created_at,
  };

  if (change.change_type === "permission_change") {
    return {
      ...base,
      action: "permissions.updated",
      details: {
        permissions: diffPermissions(change.permissions_before, change.permissions_after),
      },
    };
  }

  // force_logout_user writes a ledger row with placeholder roles.
  if (change.from_role === "n/a" && change.to_role === "n/a") {
    return { ...base, action: "user.force_logout", details: {} };
  }

  return {
    ...base,
    action: "role.changed",
    details: { fromRole: change.from_role, toRole: change.to_role },
  };
}

function invitationLifecycleRows(
  invitation: EmployeeInvitationRow,
  employee: EmployeeActivitySubject,
  now: Date,
): AuditRow[] {
  const base = {
    org_id: invitation.org_id,
    actor_email: null,
    resource_type: "invitation",
    resource_id: invitation.id,
  };
  const details = { email: invitation.email };

  const rows: AuditRow[] = [
    {
      ...base,
      id: `invitation-sent-${invitation.id}`,
      actor_id: invitation.invited_by,
      action: "invitation.sent",
      details: { ...details, role: invitation.role_to_assign },
      created_at: invitation.created_at,
    },
  ];

  if (invitation.accepted_at) {
    rows.push({
      ...base,
      id: `invitation-accepted-${invitation.id}`,
      actor_id: employee.user_id,
      action: "invitation.accepted",
      details,
      created_at: invitation.accepted_at,
    });
  } else if (invitation.revoked_at) {
    rows.push({
      ...base,
      id: `invitation-revoked-${invitation.id}`,
      actor_id: null,
      action: "invitation.revoked",
      details,
      created_at: invitation.revoked_at,
    });
  } else if (timestamp(invitation.expires_at) < now.getTime()) {
    rows.push({
      ...base,
      id: `invitation-expired-${invitation.id}`,
      actor_id: null,
      action: "invitation.expired",
      details,
      created_at: invitation.expires_at,
    });
  }

  return rows;
}

function employeeAddedRow(employee: EmployeeActivitySubject): AuditRow | null {
  if (!employee.created_at) return null;
  return {
    id: `employee-added-${employee.id}`,
    org_id: employee.org_id,
    actor_id: employee.created_by,
    actor_email: null,
    action: "employee.created",
    resource_type: "employee",
    resource_id: employee.id,
    details: {},
    created_at: employee.created_at,
  };
}

/**
 * Whether an app-written audit row already describes a synthesized event.
 * Invitation and creation events match on the exact record; access events
 * match on the target within the dedupe window, because one access edit can
 * produce a differently named audit row and up to two ledger rows.
 */
function isAlreadyAudited(auditRows: AuditRow[], candidate: AuditRow): boolean {
  const action = String(candidate.action);
  const resourceId = candidate.resource_id as string;

  if (action.startsWith("invitation.")) {
    const equivalents =
      action === "invitation.sent" ? ["invitation.sent", "invitation.created"] : [action];
    return auditRows.some(
      (row) => equivalents.includes(String(row.action)) && row.resource_id === resourceId,
    );
  }

  if (action === "employee.created") {
    return auditRows.some(
      (row) => row.action === "employee.created" && row.resource_id === resourceId,
    );
  }

  const candidateTime = timestamp(candidate.created_at);
  return auditRows.some((row) => {
    const rowAction = String(row.action);
    const describesAccess =
      action === "user.force_logout"
        ? rowAction === "user.force_logout"
        : ACCESS_AUDIT_PREFIXES.some((prefix) => rowAction.startsWith(prefix));
    if (!describesAccess) return false;
    if (!targetsUser(row, resourceId)) return false;
    return Math.abs(timestamp(row.created_at) - candidateTime) <= ACCESS_DEDUPE_WINDOW_MS;
  });
}

function targetsUser(row: AuditRow, userId: string): boolean {
  if (row.resource_id === userId) return true;
  const details = row.details;
  if (!details || typeof details !== "object") return false;
  const target = (details as Record<string, unknown>).targetUserId;
  return target === userId;
}

function timestamp(value: unknown): number {
  const time = new Date(String(value)).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Rows each organization query reads; a result this long may have more. */
export const EMPLOYEE_AUDIT_ROW_LIMIT = 300;
export const EMPLOYEE_ROLE_CHANGE_ROW_LIMIT = 200;

const PERSON_ACTIVITY_CATEGORY_SET = new Set<string>(PERSON_ACTIVITY_CATEGORIES);
export const PERSON_ACTIVITY_ACTIONS: readonly string[] = Object.entries(AUDIT_ACTIONS)
  .filter(([, spec]) => PERSON_ACTIVITY_CATEGORY_SET.has(spec.category))
  .map(([action]) => action);

/**
 * The organization's audit rows about one staff record. `actions` defaults to
 * the person-activity actions an organization sees; a Gridmaster passes `null`
 * for every action.
 */
export async function fetchEmployeeAuditRows(
  serviceClient: SupabaseClient,
  orgId: string,
  employee: EmployeeActivitySubject,
  invitationIds: string[],
  options: { actions?: readonly string[] | null } = {},
): Promise<AuditRow[]> {
  const targets = [
    `and(resource_type.eq.employee,resource_id.eq.${employee.id})`,
    `details->>employeeId.eq.${employee.id}`,
  ];
  if (employee.user_id) {
    targets.push(
      `and(resource_type.in.(user,organization_membership,role),resource_id.eq.${employee.user_id})`,
      `details->>targetUserId.eq.${employee.user_id}`,
    );
  }
  if (invitationIds.length > 0) {
    targets.push(`and(resource_type.eq.invitation,resource_id.in.(${invitationIds.join(",")}))`);
  }

  const actions = options.actions === undefined ? PERSON_ACTIVITY_ACTIONS : options.actions;
  let query = serviceClient.from("audit_log").select("*").eq("org_id", orgId);
  if (actions) query = query.in("action", [...actions]);
  const { data, error } = await query
    .or(targets.join(","))
    .order("created_at", { ascending: false })
    .limit(EMPLOYEE_AUDIT_ROW_LIMIT);
  if (error) {
    throw error;
  }
  return (data ?? []) as AuditRow[];
}

export async function fetchEmployeeRoleChanges(
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string | null,
): Promise<RoleChangeLogRow[]> {
  if (!userId) return [];
  const { data, error } = await serviceClient
    .from("role_change_log")
    .select(
      "id, org_id, target_user_id, changed_by_id, from_role, to_role, change_type, permissions_before, permissions_after, created_at",
    )
    .eq("org_id", orgId)
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(EMPLOYEE_ROLE_CHANGE_ROW_LIMIT);
  if (error) {
    throw error;
  }
  return (data ?? []) as RoleChangeLogRow[];
}
