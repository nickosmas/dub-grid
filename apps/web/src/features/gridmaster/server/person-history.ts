import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichAuditRows, type AuditRow, type EnrichedAuditEntry } from "@/lib/audit/enrich";
import {
  buildEmployeeActivityRows,
  EMPLOYEE_AUDIT_ROW_LIMIT,
  EMPLOYEE_ROLE_CHANGE_ROW_LIMIT,
  fetchEmployeeAuditRows,
  fetchEmployeeRoleChanges,
  type EmployeeActivitySubject,
  type EmployeeInvitationRow,
} from "@/lib/audit/employee-activity";

/** Rows read per source; a source that returns this many may have more. */
export const HISTORY_SOURCE_CAP = 500;
const EMPLOYEE_SUBJECT_COLUMNS = "id, org_id, user_id, created_at, created_by";

// Explicit columns: the history never carries IP addresses or user agents.
const AUDIT_COLUMNS =
  "id, org_id, actor_id, actor_email, action, resource_type, resource_id, details, impersonation_session_id, created_at";

/** The session row says everything these do, so they are dropped for the person it targets. */
const IMPERSONATION_EVENT_ACTIONS = new Set(["impersonation.started", "impersonation.ended"]);

type Row = Record<string, unknown>;

export interface AccountHistoryRows {
  rows: AuditRow[];
  truncated: boolean;
}

function rowsOrThrow(result: { data: unknown; error: unknown }): Row[] {
  if (result.error) throw result.error;
  return (result.data ?? []) as Row[];
}

function minutesBetween(from: string, to: string | null): number | null {
  if (!to) return null;
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
}

function impersonationRow(session: Row, userId: string): AuditRow {
  const startedAt = session.created_at as string;
  const endedAt = (session.ended_at as string | null) ?? null;
  return {
    id: `impersonation-${session.session_id as string}`,
    org_id: (session.target_org_id as string | null) ?? null,
    actor_id: (session.gridmaster_id as string | null) ?? null,
    action: "impersonation.session",
    resource_type: "user",
    resource_id: userId,
    details: {
      targetUserId: userId,
      justification: (session.justification as string | null) ?? null,
      startedAt,
      endedAt,
      expiresAt: (session.expires_at as string | null) ?? null,
      endReason: (session.end_reason as string | null) ?? null,
      durationMinutes: minutesBetween(startedAt, endedAt),
    },
    created_at: startedAt,
  };
}

function editorEndRow(termination: Row, userId: string): AuditRow {
  return {
    id: `editor-end-${termination.id as string}`,
    org_id: (termination.org_id as string | null) ?? null,
    actor_id: null,
    action: "schedule.editor_session_ended",
    resource_type: "user",
    resource_id: userId,
    details: { targetUserId: userId },
    created_at: termination.ended_at as string,
  };
}

/**
 * Everything recorded against one account rather than one staff record: what
 * they did anywhere, what was done to their account (with or without an
 * organization), impersonations of them, and editor sessions ended on them.
 */
export async function loadAccountHistoryRows(
  client: SupabaseClient,
  userId: string,
): Promise<AccountHistoryRows> {
  const [auditResult, sessionResult, editorResult] = await Promise.all([
    client
      .from("audit_log")
      .select(AUDIT_COLUMNS)
      .or(
        `actor_id.eq.${userId},and(resource_type.eq.user,resource_id.eq.${userId}),details->>targetUserId.eq.${userId}`,
      )
      .order("created_at", { ascending: false })
      .limit(HISTORY_SOURCE_CAP),
    client
      .from("impersonation_sessions")
      .select(
        "session_id, gridmaster_id, target_user_id, target_org_id, justification, expires_at, created_at, ended_at, end_reason",
      )
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_SOURCE_CAP),
    client
      .from("schedule_editor_session_terminations")
      .select("id, org_id, user_id, ended_at")
      .eq("user_id", userId)
      .order("ended_at", { ascending: false })
      .limit(HISTORY_SOURCE_CAP),
  ]);

  const auditRows = rowsOrThrow(auditResult);
  const sessions = rowsOrThrow(sessionResult);
  const editorEnds = rowsOrThrow(editorResult);

  const rows: AuditRow[] = [
    ...auditRows.filter(
      (row) => !(IMPERSONATION_EVENT_ACTIONS.has(row.action as string) && row.actor_id !== userId),
    ),
    ...sessions.map((session) => impersonationRow(session, userId)),
    ...editorEnds.map((termination) => editorEndRow(termination, userId)),
  ];

  return {
    rows,
    truncated: [auditRows, sessions, editorEnds].some(
      (source) => source.length >= HISTORY_SOURCE_CAP,
    ),
  };
}

/** Everything the People page's Activity tab reads for one staff record, every action included. */
async function loadStaffHistoryRows(
  client: SupabaseClient,
  employee: EmployeeActivitySubject,
): Promise<AccountHistoryRows> {
  const invitationResult = await client
    .from("invitations")
    .select(
      "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at",
    )
    .eq("org_id", employee.org_id)
    .eq("employee_id", employee.id);
  const invitations = rowsOrThrow(invitationResult) as unknown as EmployeeInvitationRow[];
  const [auditRows, roleChanges] = await Promise.all([
    fetchEmployeeAuditRows(
      client,
      employee.org_id,
      employee,
      invitations.map((invitation) => invitation.id),
      { actions: null },
    ),
    fetchEmployeeRoleChanges(client, employee.org_id, employee.user_id),
  ]);
  return {
    rows: buildEmployeeActivityRows({ employee, auditRows, roleChanges, invitations }),
    truncated:
      auditRows.length >= EMPLOYEE_AUDIT_ROW_LIMIT ||
      roleChanges.length >= EMPLOYEE_ROLE_CHANGE_ROW_LIMIT,
  };
}

/** Sign-in evidence the security audit keeps: a hashed IP, email and session. */
const HASHED_DETAIL_KEYS = ["sourceHash", "targetHash", "sessionHash"];

function withoutNetworkDetails(row: AuditRow): AuditRow {
  const { ip_address: _ip, user_agent: _agent, ...rest } = row;
  const details = rest.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return rest;
  const kept = { ...(details as Record<string, unknown>) };
  for (const key of HASHED_DETAIL_KEYS) delete kept[key];
  return { ...rest, details: kept };
}

export type PersonHistoryTarget =
  { kind: "user"; userId: string } | { kind: "staff"; employeeId: string };

export interface PersonHistory {
  entries: EnrichedAuditEntry<string>[];
  truncated: boolean;
}

/**
 * The person's whole history for the Gridmaster: every staff record's
 * organization activity and, with an account, everything recorded against the
 * account. Newest first, one entry per event. Null when there is no such person.
 */
export async function loadPersonHistory(
  client: SupabaseClient,
  target: PersonHistoryTarget,
): Promise<PersonHistory | null> {
  let userId: string | null;
  let employees: EmployeeActivitySubject[];
  if (target.kind === "user") {
    const [profileResult, employeeResult] = await Promise.all([
      client.from("profiles").select("id, platform_role").eq("id", target.userId).maybeSingle(),
      client.from("employees").select(EMPLOYEE_SUBJECT_COLUMNS).eq("user_id", target.userId),
    ]);
    if (profileResult.error) throw profileResult.error;
    employees = rowsOrThrow(employeeResult) as unknown as EmployeeActivitySubject[];
    if (!profileResult.data && employees.length === 0) return null;
    // A Gridmaster's own account is not a person page target (43b).
    if ((profileResult.data as { platform_role?: string } | null)?.platform_role === "gridmaster") {
      return null;
    }
    userId = target.userId;
  } else {
    const { data, error } = await client
      .from("employees")
      .select(EMPLOYEE_SUBJECT_COLUMNS)
      .eq("id", target.employeeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    employees = [data as EmployeeActivitySubject];
    userId = employees[0].user_id;
    if (userId) {
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if ((profile as { platform_role?: string } | null)?.platform_role === "gridmaster")
        return null;
    }
  }

  const sources = await Promise.all([
    ...employees.map((employee) => loadStaffHistoryRows(client, employee)),
    ...(userId ? [loadAccountHistoryRows(client, userId)] : []),
  ]);

  const byId = new Map<string, AuditRow>();
  for (const row of sources.flatMap((source) => source.rows)) {
    // Each session row says what these do, and the staff source matches them
    // too, through the target organization (F-87).
    if (IMPERSONATION_EVENT_ACTIONS.has(row.action as string) && row.actor_id !== userId) continue;
    const id = String(row.id);
    if (!byId.has(id)) byId.set(id, { ...withoutNetworkDetails(row), id });
  }
  const rows = [...byId.values()].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );

  return {
    entries: await enrichAuditRows<string>(client, rows),
    truncated: sources.some((source) => source.truncated),
  };
}
