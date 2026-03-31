import { supabase } from "@/lib/supabase";
import logger from "@/lib/logger";

export type AuditAction =
  // Employee management
  | "employee.created"
  | "employee.updated"
  | "employee.archived"
  | "employee.benched"
  | "employee.activated"
  // Shift management
  | "shift.created"
  | "shift.updated"
  | "shift.deleted"
  | "shift.moved"
  // Schedule
  | "schedule.published"
  | "schedule.drafts_discarded"
  // Shift requests
  | "shift_request.created"
  | "shift_request.claimed"
  | "shift_request.responded"
  | "shift_request.resolved"
  | "shift_request.canceled"
  // Organization settings
  | "org.updated"
  | "org.created"
  | "org.archived"
  | "org.restored"
  // Role & permissions
  | "role.changed"
  | "permissions.updated"
  | "user.removed_from_org"
  // Invitations
  | "invitation.sent"
  | "invitation.accepted"
  | "invitation.revoked"
  // Config items
  | "focus_area.upserted"
  | "focus_area.archived"
  | "shift_code.upserted"
  | "shift_code.archived"
  | "absence_type.upserted"
  | "absence_type.archived"
  | "shift_category.upserted"
  | "shift_category.archived"
  | "indicator_type.upserted"
  | "indicator_type.archived"
  | "certifications.saved"
  | "org_roles.saved"
  | "coverage_requirements.saved"
  // Recurring shifts
  | "recurring_shift.upserted"
  | "recurring_shift.deleted"
  | "recurring_schedule.applied"
  // Shift series
  | "shift_series.created"
  | "shift_series.updated"
  | "shift_series.archived"
  // Impersonation
  | "impersonation.started"
  | "impersonation.ended"
  // Schedule notes
  | "schedule_note.upserted"
  | "schedule_note.deleted"
  // Data export
  | "data.exported";

export type AuditResourceType =
  | "employee"
  | "shift"
  | "schedule"
  | "shift_request"
  | "organization"
  | "role"
  | "invitation"
  | "focus_area"
  | "shift_code"
  | "absence_type"
  | "shift_category"
  | "indicator_type"
  | "certification"
  | "org_role"
  | "coverage_requirement"
  | "recurring_shift"
  | "shift_series"
  | "impersonation_session"
  | "schedule_note"
  | "permissions"
  | "data_export";

/**
 * Log an audit event. Best-effort — never throws.
 * Call this from client-side mutation functions in db.ts.
 */
export async function logAudit(
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string | null,
  details: Record<string, unknown> = {},
  orgId?: string | null,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from("audit_log").insert({
      org_id: orgId ?? null,
      actor_id: session.user.id,
      actor_email: session.user.email ?? null,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
    });

    if (error) {
      logger.error({ error, action, resourceType }, "Failed to write audit log");
    }
  } catch (err) {
    logger.error({ error: err, action, resourceType }, "Audit logging failed");
  }
}
