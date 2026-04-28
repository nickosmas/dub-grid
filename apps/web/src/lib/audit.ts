import { supabase } from "@/lib/supabase";
import { getVerifiedBrowserUser } from "@/lib/browser-auth";
import { getImpersonationFromCookie } from "@/lib/impersonation";

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
  | "org.suspended"
  | "org.unsuspended"
  | "org.deleted"
  // Role & permissions
  | "role.changed"
  | "permissions.updated"
  | "user.removed_from_org"
  | "user.deactivated"
  | "user.reactivated"
  | "user.force_logout"
  | "user.password_reset_sent"
  // Invitations
  | "invitation.sent"
  | "invitation.accepted"
  | "invitation.revoked"
  | "invitation.resent"
  // Config items
  | "focus_area.upserted"
  | "focus_area.archived"
  | "focus_area.restored"
  | "assignment.upserted"
  | "assignment.archived"
  | "assignment.restored"
  | "absence_type.upserted"
  | "absence_type.archived"
  | "absence_type.restored"
  | "shift_category.upserted"
  | "shift_category.archived"
  | "shift_category.restored"
  | "job.upserted"
  | "job.archived"
  | "job.restored"
  | "indicator_type.upserted"
  | "indicator_type.archived"
  | "indicator_type.restored"
  | "certifications.saved"
  | "certification.restored"
  | "org_roles.saved"
  | "org_role.restored"
  | "coverage_requirements.saved"
  | "coverage_rule_config.saved"
  // Departments
  | "departments.saved"
  | "department.restored"
  | "department_permissions.updated"
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
  // Billing
  | "billing.trial_extended"
  | "billing.subscription_canceled"
  | "billing.synced"
  // Data export
  | "data.exported"
  | "data.portability_exported";

export type AuditResourceType =
  | "employee"
  | "shift"
  | "schedule"
  | "shift_request"
  | "organization"
  | "role"
  | "invitation"
  | "focus_area"
  | "assignment"
  | "absence_type"
  | "shift_category"
  | "job"
  | "indicator_type"
  | "certification"
  | "org_role"
  | "coverage_requirement"
  | "coverage_rule_config"
  | "department"
  | "recurring_shift"
  | "shift_series"
  | "impersonation_session"
  | "schedule_note"
  | "permissions"
  | "data_export"
  | "user"
  | "billing";

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
    const user = await getVerifiedBrowserUser();
    if (!user) return;

    // Attach impersonation session ID if the actor is impersonating.
    // This makes actions taken during impersonation distinguishable from
    // direct gridmaster actions in the audit trail.
    let impersonationSessionId: string | null = null;
    if (typeof document !== "undefined") {
      const imp = getImpersonationFromCookie(document.cookie);
      if (imp) impersonationSessionId = imp.sessionId;
    }

    const { error } = await supabase.from("audit_log").insert({
      org_id: orgId ?? null,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      impersonation_session_id: impersonationSessionId,
    });

    if (error) {
      console.error("Failed to write audit log", { action, resourceType, error });
    }
  } catch (err) {
    console.error("Audit logging failed", { action, resourceType, err });
  }
}
