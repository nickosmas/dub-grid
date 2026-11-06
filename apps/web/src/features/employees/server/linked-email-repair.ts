import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/db/shared";
import logger from "@/lib/logger";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import { escapeLikePattern } from "@/features/employees/server/contact-conflicts";

const AUTH_PAGE_SIZE = 1000;
const UNIQUE_VIOLATION = "23505";

interface LinkedRow {
  id: string;
  org_id: string;
  user_id: string;
  email: string | null;
  version: number;
  organization: { workspace_kind: string; archived_at: string | null } | null;
}

interface MismatchedRow extends LinkedRow {
  signInEmail: string;
}

type RepairOutcome = "repaired" | "clash" | "skipped";

export interface LinkedEmailRepairResult {
  repaired: number;
  blocked: number;
}

function comparable(email: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

/** auth.users isn't exposed through PostgREST, so sign-ins come from the admin API. */
async function loadSignInEmails(db: SupabaseClient): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error) throw error;
    for (const user of data.users) {
      const email = user.email?.trim();
      if (email) emails.set(user.id, email);
    }
    if (data.users.length < AUTH_PAGE_SIZE) return emails;
  }
}

async function loadMismatchedRows(db: SupabaseClient): Promise<MismatchedRow[]> {
  const signInEmails = await loadSignInEmails(db);
  const rows = await fetchAllRows<LinkedRow>((from, to) =>
    db
      .from("employees")
      .select(
        "id, org_id, user_id, email, version, organization:organizations(workspace_kind, archived_at)",
      )
      .not("user_id", "is", null)
      .is("archived_at", null)
      .order("id")
      .range(from, to)
      .then((result) => ({
        data: result.data as unknown as LinkedRow[] | null,
        error: result.error,
      })),
  );

  const mismatched: MismatchedRow[] = [];
  for (const row of rows) {
    const signInEmail = signInEmails.get(row.user_id);
    if (!signInEmail || comparable(signInEmail) === comparable(row.email)) continue;
    if (row.organization?.workspace_kind !== "real" || row.organization.archived_at) continue;
    mismatched.push({ ...row, signInEmail });
  }
  return mismatched;
}

async function repairRow(db: SupabaseClient, row: MismatchedRow): Promise<RepairOutcome> {
  const { data, error } = await db
    .from("employees")
    .update({ email: row.signInEmail, version: row.version + 1 })
    .eq("id", row.id)
    .eq("org_id", row.org_id)
    .eq("version", row.version)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error?.code === UNIQUE_VIOLATION) return "clash";
  if (error) {
    logger.error({ error, empId: row.id }, "linked-email-repair: update failed");
    return "skipped";
  }
  if (!data) return "skipped";

  const { error: auditError } = await db.from("audit_log").insert({
    org_id: row.org_id,
    actor_id: null,
    actor_email: null,
    action: "employee.email_synced",
    resource_type: "employee",
    resource_id: row.id,
    details: { previousEmail: row.email, email: row.signInEmail, changedFields: ["email"] },
  });
  if (auditError) {
    logger.error({ error: auditError, empId: row.id }, "linked-email-repair: audit write failed");
  }
  return "repaired";
}

async function clashAlreadyReported(db: SupabaseClient, row: MismatchedRow): Promise<boolean> {
  const { data, error } = await db
    .from("audit_log")
    .select("id")
    .eq("org_id", row.org_id)
    .eq("action", "employee.email_sync_blocked")
    .eq("resource_id", row.id)
    .eq("details->>email", row.signInEmail)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function findAddressHolder(db: SupabaseClient, row: MismatchedRow): Promise<string | null> {
  const { data, error } = await db
    .from("employees")
    .select("id")
    .eq("org_id", row.org_id)
    .ilike("email", escapeLikePattern(comparable(row.signInEmail)))
    .is("archived_at", null)
    .neq("id", row.id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/** The audit row goes in only after the alert, so a failed alert is tried again tomorrow. */
async function reportClash(db: SupabaseClient, row: MismatchedRow): Promise<void> {
  if (await clashAlreadyReported(db, row)) return;

  const holderEmpId = await findAddressHolder(db, row);
  const dispatched = await dispatchNotificationEvent("linked-email-repair-cron", {
    action: "employee_email_blocked",
    orgId: row.org_id,
    empId: row.id,
    signInEmail: row.signInEmail,
    holderEmpId,
  });
  if (!dispatched.success) return;

  const { error } = await db.from("audit_log").insert({
    org_id: row.org_id,
    actor_id: null,
    actor_email: null,
    action: "employee.email_sync_blocked",
    resource_type: "employee",
    resource_id: row.id,
    details: { email: row.signInEmail, holderEmpId },
  });
  if (error) logger.error({ error, empId: row.id }, "linked-email-repair: audit write failed");
}

/**
 * A confirmed sign-in change reaches every linked staff record through the
 * auth trigger (022), except a record whose organization already has another
 * staff record on that address: the trigger leaves that one behind with only a
 * database warning. This finds those rows, moves each one the moment it can,
 * and tells the organization's Super Admins once about any it can't. The other
 * record is theirs to change, so this never touches it.
 */
export async function repairLinkedEmails(db: SupabaseClient): Promise<LinkedEmailRepairResult> {
  const mismatched = await loadMismatchedRows(db);
  let repaired = 0;
  const clashes: MismatchedRow[] = [];

  for (const row of mismatched) {
    const outcome = await repairRow(db, row);
    if (outcome === "repaired") repaired += 1;
    if (outcome === "clash") clashes.push(row);
  }

  // A clash may be with a row this run has just moved off that address.
  let blocked = 0;
  for (const row of clashes) {
    const outcome = await repairRow(db, row);
    if (outcome === "repaired") repaired += 1;
    if (outcome !== "clash") continue;
    blocked += 1;
    try {
      await reportClash(db, row);
    } catch (error) {
      logger.error({ error, empId: row.id }, "linked-email-repair: reporting a clash failed");
    }
  }

  return { repaired, blocked };
}
