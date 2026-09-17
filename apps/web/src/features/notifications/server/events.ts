import { getServiceClient } from "@/lib/supabase-service";
import { summarizePermissionChanges } from "@/lib/permission-labels";
import { formatOrganizationRoleLabel } from "@/lib/client-facing";
import { fetchPublishedShiftRows } from "@/lib/published-shifts";
import logger from "@/lib/logger";
import { sendNotification } from "./sender";
import type { NotificationType } from "@/types";

export type NotificationEvent =
  | {
      action: "shift_request_created" | "shift_request_claimed";
      orgId: string;
      requestId: string;
      requestType: "pickup" | "swap" | "calloff";
    }
  | {
      action: "shift_request_responded";
      orgId: string;
      requestId: string;
      requestType: "pickup" | "swap" | "calloff";
      accepted: boolean;
    }
  | {
      action: "shift_request_resolved";
      orgId: string;
      requestId: string;
      requestType: "pickup" | "swap" | "calloff";
      approved: boolean;
      adminNote?: string;
      /**
       * The claimant's employee id as it stood before the resolve RPC ran.
       * Rejecting a claimed pickup clears target_emp_id on the row, so this
       * is the only way to still notify them once the RPC has run.
       */
      previousTargetEmpId?: string | null;
    }
  | {
      action: "schedule_published";
      orgId: string;
      startDate: string;
      endDate: string;
    }
  | {
      action: "role_changed";
      orgId: string;
      targetUserId: string;
      fromRole: string;
      toRole: string;
    }
  // ── Schedule (non-publish flows) ────────────────────────────────────────
  | {
      action: "schedule_note_changed";
      orgId: string;
      empId: string;
      date: string;
      mode: "upsert" | "delete";
      /** Resulting note status — only notifies when 'published'. */
      status: "draft" | "published" | "draft_deleted";
    }
  // ── Membership lifecycle ────────────────────────────────────────────────
  | {
      action: "invitation_created";
      orgId: string;
      invitationId: string;
      inviteeEmail: string;
    }
  | {
      action: "invitation_accepted";
      orgId: string;
      acceptedUserId: string;
      invitationId?: string | null;
    }
  | {
      action: "invitation_revoked";
      orgId: string;
      invitationId: string;
      inviteeEmail: string;
    }
  | {
      action: "invitation_resent";
      orgId: string;
      invitationId: string;
      inviteeEmail: string;
    }
  | {
      action: "membership_removed";
      orgId: string;
      removedUserId: string;
    }
  | {
      action: "admin_permissions_changed";
      orgId: string;
      targetUserId: string;
      before: Record<string, boolean> | null;
      after: Record<string, boolean> | null;
    }
  // ── Employee ────────────────────────────────────────────────────────────
  | {
      action: "employee_created";
      orgId: string;
      empId: string;
    }
  | {
      action: "employee_status_changed";
      orgId: string;
      empId: string;
      fromStatus: string;
      toStatus: string;
    }
  | {
      action: "employee_profile_changed";
      orgId: string;
      empId: string;
      fields: string[];
    }
  // ── Security (account-level) ────────────────────────────────────────────
  | {
      action: "security_new_device";
      orgId: string | null;
      targetUserId: string;
      platform: "web" | "ios" | "android";
      deviceLabel: string | null;
      ipAddress: string | null;
    }
  | {
      action: "security_mfa_changed";
      orgId: string | null;
      targetUserId: string;
      enabled: boolean;
    }
  | {
      action: "security_session_revoked";
      orgId: string | null;
      targetUserId: string;
      /** Who initiated the revocation. 'self' = user revoked from own settings; 'gridmaster' = platform admin force-logout. */
      initiatedBy: "self" | "gridmaster";
      deviceLabel?: string | null;
    }
  // ── Billing (super_admin-targeted) ──────────────────────────────────────
  | {
      action: "billing_payment_failed";
      orgId: string;
      /** Stripe invoice id — used as the idempotency key in metadata.stripeEventId. */
      stripeInvoiceId: string;
      amountDue?: number | null;
      currency?: string | null;
    }
  | {
      action: "billing_trial_ending_soon";
      orgId: string;
      trialEndsAt: string;
      /** Period bucket (e.g. '3d') used to dedupe repeated cron runs. */
      periodKey: string;
    }
  | {
      action: "billing_trial_expired";
      orgId: string;
      trialEndsAt: string;
    }
  // ── Expiry sweepers (cron-driven) ───────────────────────────────────────
  | {
      action: "shift_request_expired";
      orgId: string;
      requestId: string;
      requestType: "pickup" | "swap" | "calloff";
    }
  | {
      action: "invitation_expired";
      orgId: string;
      invitationId: string;
      inviteeEmail: string;
    }
  // ── Membership change ───────────────────────────────────────────────────
  | {
      action: "member_dept_changed";
      orgId: string;
      targetUserId: string;
      addedDepartmentNames: string[];
      removedDepartmentNames: string[];
    };

async function getAdminsWithPermission(orgId: string, permission: string): Promise<string[]> {
  const db = getServiceClient();

  const { data: superAdmins } = await db
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("org_role", "super_admin")
    .is("archived_at", null);

  const { data: admins } = await db
    .from("organization_memberships")
    .select("user_id, admin_permissions")
    .eq("org_id", orgId)
    .eq("org_role", "admin")
    .is("archived_at", null);

  const ids = new Set<string>();
  for (const row of superAdmins ?? []) {
    ids.add(row.user_id);
  }
  for (const row of admins ?? []) {
    const perms = row.admin_permissions as Record<string, boolean> | null;
    if (perms?.[permission]) {
      ids.add(row.user_id);
    }
  }
  return [...ids];
}

async function getAffectedEmployeeUserIds(
  orgId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const db = getServiceClient();

  const shifts = await fetchPublishedShiftRows(db, {
    orgId,
    startDate,
    endDate,
  });

  if (!shifts.length) return [];

  const empIds = [...new Set(shifts.map((shift) => shift.emp_id))];
  const { data: employees } = await db
    .from("employees")
    .select("user_id")
    .in("id", empIds)
    .not("user_id", "is", null);

  return (employees ?? []).map((employee) => employee.user_id as string).filter(Boolean);
}

async function getRequestInfo(requestId: string): Promise<{
  requesterUserId: string | null;
  requesterName: string;
  targetUserId: string | null;
  targetName: string;
  requestType: "pickup" | "swap" | "calloff" | null;
  status: string | null;
}> {
  const db = getServiceClient();
  const { data } = await db
    .from("shift_requests")
    .select(
      `status,
       type,
       requester:employees!shift_requests_requester_emp_id_fkey(user_id, first_name, last_name),
       target:employees!shift_requests_target_emp_id_fkey(user_id, first_name, last_name)`,
    )
    .eq("id", requestId)
    .single();

  const requester = normalizeEmployeeRelation(data?.requester);
  const target = normalizeEmployeeRelation(data?.target);

  return {
    requesterUserId: requester?.user_id ?? null,
    requesterName: requester ? `${requester.first_name} ${requester.last_name}` : "An employee",
    targetUserId: target?.user_id ?? null,
    targetName: target ? `${target.first_name} ${target.last_name}` : "An employee",
    requestType:
      data?.type === "pickup" || data?.type === "swap" || data?.type === "calloff"
        ? data.type
        : null,
    status: (data?.status as string | null | undefined) ?? null,
  };
}

function normalizeEmployeeRelation(
  value: unknown,
): { user_id: string | null; first_name: string; last_name: string } | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return normalizeEmployeeRelation(value[0]);
  }
  if (typeof value !== "object") return null;

  const row = value as {
    user_id?: unknown;
    first_name?: unknown;
    last_name?: unknown;
  };
  if (typeof row.first_name !== "string" || typeof row.last_name !== "string") {
    return null;
  }

  return {
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    first_name: row.first_name,
    last_name: row.last_name,
  };
}

function getShiftRequestTypeLabel(type: "pickup" | "swap" | "calloff"): string {
  if (type === "calloff") return "calloff";
  if (type === "swap") return "swap";
  return "pickup";
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

async function getOrgSuperAdmins(orgId: string): Promise<string[]> {
  const db = getServiceClient();
  const { data } = await db
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("org_role", "super_admin")
    .is("archived_at", null);
  return (data ?? []).map((row) => row.user_id as string).filter(Boolean);
}

async function getEmployeeUserId(empId: string): Promise<string | null> {
  const db = getServiceClient();
  const { data } = await db.from("employees").select("user_id").eq("id", empId).maybeSingle();
  return (data?.user_id as string | null) ?? null;
}

async function getEmployeeName(empId: string): Promise<string> {
  const db = getServiceClient();
  const { data } = await db
    .from("employees")
    .select("first_name, last_name")
    .eq("id", empId)
    .maybeSingle();
  if (!data) return "An employee";
  return `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || "An employee";
}

async function getInvitation(invitationId: string): Promise<{
  invitedBy: string | null;
  email: string | null;
  orgId: string | null;
  roleToAssign: string | null;
} | null> {
  const db = getServiceClient();
  const { data } = await db
    .from("invitations")
    .select("invited_by, email, org_id, role_to_assign")
    .eq("id", invitationId)
    .maybeSingle();
  if (!data) return null;
  return {
    invitedBy: (data.invited_by as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    orgId: (data.org_id as string | null) ?? null,
    roleToAssign: (data.role_to_assign as string | null) ?? null,
  };
}

/**
 * The person who took the action, for alerts that would otherwise say "a
 * member" or use the passive voice. An alert that doesn't name who did
 * something forces the reader into the activity log to find out.
 */
async function getUserName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const db = getServiceClient();
  const { data } = await db
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const name = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
  return name || null;
}

/** Actor name with a neutral fallback, so copy always has a subject. */
async function getActorName(userId: string): Promise<string> {
  return (await getUserName(userId)) ?? "An administrator";
}

/**
 * "2026-05-04" → "May 4, 2026". Alerts show a raw date only because nothing
 * formatted it; the reader shouldn't have to parse an ISO string.
 */
function formatNotificationDate(value: string): string {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * "May 4 – May 17, 2026". Collapses a same-day range to a single date, and
 * names the year once when both ends share it rather than twice.
 */
function formatNotificationDateRange(start: string, end: string): string {
  const from = formatNotificationDate(start);
  const to = formatNotificationDate(end);
  if (from === to) return from;

  const startYear = start.slice(0, 4);
  const openEnd = startYear === end.slice(0, 4) ? from.replace(`, ${startYear}`, "") : from;
  return `${openEnd} \u2013 ${to}`;
}

async function getOrgName(orgId: string): Promise<string> {
  const db = getServiceClient();
  const { data } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  return (data?.name as string | null) ?? "your organization";
}

type OrgCopyLabels = {
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
};

async function getOrgCopyLabels(orgId: string): Promise<OrgCopyLabels> {
  const db = getServiceClient();
  const { data } = await db
    .from("organizations")
    .select("focus_area_label, certification_label, role_label")
    .eq("id", orgId)
    .maybeSingle();
  return {
    focusAreaLabel: (data?.focus_area_label as string | null) ?? "Focus Areas",
    certificationLabel: (data?.certification_label as string | null) ?? "Certifications",
    roleLabel: (data?.role_label as string | null) ?? "Roles",
  };
}

function titleCaseWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function friendlyProfileFieldLabel(key: string, labels: OrgCopyLabels): string {
  switch (key) {
    case "firstName":
      return "first name";
    case "lastName":
      return "last name";
    case "email":
      return "email";
    case "phone":
      return "phone number";
    case "contactNotes":
      return "contact notes";
    case "employmentType":
      return "employment type";
    case "certification":
      return labels.certificationLabel.toLowerCase();
    case "seniority":
      return "seniority";
    case "roles":
      return labels.roleLabel.toLowerCase();
    case "focusAreas":
      return labels.focusAreaLabel.toLowerCase();
    case "departments":
      return "departments";
    case "departmentAdmin":
      return "department admin assignments";
    default:
      return titleCaseWords(key).toLowerCase();
  }
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function capitalizeFirst(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

async function notifyShiftRequestApprovers(input: {
  actorUserId: string;
  orgId: string;
  requestId: string;
  requestType: "pickup" | "swap" | "calloff";
  title: string;
  message: string;
}) {
  const adminIds = await getAdminsWithPermission(input.orgId, "canApproveShiftRequests");

  await Promise.all(
    adminIds
      .filter((id) => id !== input.actorUserId)
      .map((adminId) =>
        sendNotification(
          adminId,
          input.orgId,
          "shift_request_new" as NotificationType,
          input.title,
          input.message,
          {
            requestId: input.requestId,
            requestType: input.requestType,
            action: "approve_request",
            tab: "approval",
          },
        ),
      ),
  );
}

export type NotificationDispatchResult = { success: true } | { success: false; error: string };

/**
 * Dispatches a notification event and returns a structured result. Errors
 * are caught and surfaced as `{ success: false }` so callers can decide
 * whether to fail their HTTP response. Previously this swallowed errors
 * unconditionally and the caller had no signal of failure.
 */
export async function dispatchNotificationEvent(
  actorUserId: string,
  event: NotificationEvent,
): Promise<NotificationDispatchResult> {
  try {
    await dispatchNotificationEventInternal(actorUserId, event);
    return { success: true };
  } catch (error) {
    logger.error(
      { error, action: event.action, orgId: event.orgId },
      "Failed to dispatch notification event",
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function dispatchNotificationEventInternal(
  actorUserId: string,
  event: NotificationEvent,
): Promise<void> {
  switch (event.action) {
    case "shift_request_created": {
      const requestInfo = await getRequestInfo(event.requestId);
      const requestType = requestInfo.requestType ?? event.requestType;
      const typeLabel = getShiftRequestTypeLabel(requestType);

      if (
        requestInfo.status === "open" &&
        requestInfo.targetUserId &&
        requestInfo.targetUserId !== actorUserId
      ) {
        await sendNotification(
          requestInfo.targetUserId,
          event.orgId,
          "shift_request_new" as NotificationType,
          `${capitalize(typeLabel)} response needed`,
          `${requestInfo.requesterName} sent you a ${typeLabel} request.`,
          {
            requestId: event.requestId,
            requestType,
            action: "respond_to_request",
            tab: "mine",
          },
        );
        return;
      }

      if (requestInfo.status === "pending_approval") {
        await notifyShiftRequestApprovers({
          actorUserId,
          orgId: event.orgId,
          requestId: event.requestId,
          requestType,
          title: `New ${typeLabel} request`,
          message: `${requestInfo.requesterName} submitted a ${typeLabel} request that needs your approval.`,
        });
      }
      return;
    }

    case "shift_request_claimed": {
      const { requesterName, targetName } = await getRequestInfo(event.requestId);
      await notifyShiftRequestApprovers({
        actorUserId,
        orgId: event.orgId,
        requestId: event.requestId,
        requestType: "pickup",
        title: "Pickup request awaiting approval",
        message: `${targetName} offered to pick up ${requesterName}'s shift.`,
      });
      return;
    }

    case "shift_request_responded": {
      const requestInfo = await getRequestInfo(event.requestId);
      const requestType = requestInfo.requestType ?? event.requestType;
      const typeLabel = getShiftRequestTypeLabel(requestType);

      if (event.accepted) {
        await notifyShiftRequestApprovers({
          actorUserId,
          orgId: event.orgId,
          requestId: event.requestId,
          requestType,
          title: `${capitalize(typeLabel)} request awaiting approval`,
          message: `${requestInfo.targetName} accepted ${requestInfo.requesterName}'s ${typeLabel} request.`,
        });
        return;
      }

      if (requestInfo.requesterUserId && requestInfo.requesterUserId !== actorUserId) {
        await sendNotification(
          requestInfo.requesterUserId,
          event.orgId,
          "shift_request_rejected" as NotificationType,
          "Request declined",
          `${requestInfo.targetName} declined your ${typeLabel} request.`,
          {
            requestId: event.requestId,
            requestType,
            approved: false,
            action: "view_request",
            tab: "mine",
          },
        );
      }
      return;
    }

    case "shift_request_resolved": {
      const requestInfo = await getRequestInfo(event.requestId);
      const requestType = requestInfo.requestType ?? event.requestType;
      const typeLabel = getShiftRequestTypeLabel(requestType);
      const { requesterUserId } = requestInfo;
      if (requesterUserId && requesterUserId !== actorUserId) {
        const status = event.approved ? "approved" : "rejected";
        const type: NotificationType = event.approved
          ? "shift_request_approved"
          : "shift_request_rejected";
        const noteText = event.adminNote ? ` Note: ${event.adminNote}` : "";

        await sendNotification(
          requesterUserId,
          event.orgId,
          type,
          `Request ${status}`,
          `Your ${typeLabel} request has been ${status}.${noteText}`,
          {
            requestId: event.requestId,
            requestType,
            approved: event.approved,
            action: "view_request",
            tab: "mine",
          },
        );
      }

      // Rejecting a claimed pickup reopens it and clears target_emp_id, so
      // requestInfo's target is already gone by the time this runs. The
      // requester notification above tells the original poster nothing
      // changed for them; this tells the claimant their claim was declined.
      if (!event.approved && !requestInfo.targetUserId && event.previousTargetEmpId) {
        const claimantUserId = await getEmployeeUserId(event.previousTargetEmpId);
        if (claimantUserId && claimantUserId !== actorUserId) {
          const noteText = event.adminNote ? ` Note: ${event.adminNote}` : "";
          await sendNotification(
            claimantUserId,
            event.orgId,
            "shift_request_rejected" as NotificationType,
            "Claim not approved",
            `Your claim on a ${typeLabel} request wasn't approved. The shift is open again.${noteText}`,
            {
              requestId: event.requestId,
              requestType,
              approved: false,
              action: "view_request",
              tab: "mine",
            },
          );
        }
      }
      return;
    }

    case "schedule_published": {
      const userIds = await getAffectedEmployeeUserIds(event.orgId, event.startDate, event.endDate);
      const publisherName = await getActorName(actorUserId);
      const publishedRange = formatNotificationDateRange(event.startDate, event.endDate);

      await Promise.all(
        userIds
          .filter((id) => id !== actorUserId)
          .map((userId) =>
            sendNotification(
              userId,
              event.orgId,
              "schedule_published" as NotificationType,
              "Schedule updated",
              `${publisherName} published the schedule for ${publishedRange}. Open the schedule to see your shifts.`,
              {
                startDate: event.startDate,
                endDate: event.endDate,
              },
            ),
          ),
      );
      return;
    }

    case "role_changed": {
      if (event.targetUserId !== actorUserId) {
        await sendNotification(
          event.targetUserId,
          event.orgId,
          "system" as NotificationType,
          "Your role changed",
          `${await getActorName(actorUserId)} changed your role from ${formatOrganizationRoleLabel(
            event.fromRole,
          )} to ${formatOrganizationRoleLabel(event.toRole)}.`,
          {
            fromRole: event.fromRole,
            toRole: event.toRole,
          },
        );
      }
      return;
    }

    // ── Schedule (non-publish flows) ────────────────────────────────────

    case "schedule_note_changed": {
      // Only notify when the resulting note is published — drafts are
      // editor-only state and shouldn't surface in user inboxes.
      if (event.status !== "published") return;
      const userId = await getEmployeeUserId(event.empId);
      if (!userId || userId === actorUserId) return;
      const title = event.mode === "delete" ? "Schedule note removed" : "Schedule note added";
      const noteActor = await getActorName(actorUserId);
      const noteDate = formatNotificationDate(event.date);
      // The date sits at the end rather than inside the noun phrase — "your
      // May 20, 2026 shift" reads badly once the year is spelled out.
      const message =
        event.mode === "delete"
          ? `${noteActor} removed the note on your shift on ${noteDate}.`
          : `${noteActor} added a note to your shift on ${noteDate}.`;
      await sendNotification(
        userId,
        event.orgId,
        "schedule_note_published" as NotificationType,
        title,
        message,
        { empId: event.empId, date: event.date, mode: event.mode },
      );
      return;
    }

    // ── Membership lifecycle ────────────────────────────────────────────

    case "invitation_created": {
      // The send_invitation RPC already triggers an email to the invitee.
      // We skip in-app notification because the invitee typically has no
      // user account yet. If one exists, the email is still the canonical
      // delivery channel.
      return;
    }

    case "invitation_accepted": {
      const orgName = await getOrgName(event.orgId);
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      const invitation = event.invitationId ? await getInvitation(event.invitationId) : null;
      const inviter = invitation?.invitedBy ?? null;
      // Name the person and the role they came in on — "a new member joined"
      // sends the reader to the activity log to find out who and as what.
      const joinerName =
        (await getUserName(event.acceptedUserId)) ?? invitation?.email ?? "Someone";
      const joinedAs = invitation?.roleToAssign
        ? ` as ${formatOrganizationRoleLabel(invitation.roleToAssign)}`
        : "";
      const recipients = new Set<string>(superAdmins);
      if (inviter) recipients.add(inviter);
      recipients.delete(actorUserId);
      await Promise.all(
        [...recipients].map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "invitation_accepted" as NotificationType,
            "Invitation accepted",
            `${joinerName} accepted their invitation and joined ${orgName}${joinedAs}.`,
            {
              acceptedUserId: event.acceptedUserId,
              invitationId: event.invitationId ?? null,
            },
          ),
        ),
      );
      return;
    }

    case "invitation_revoked": {
      const orgName = await getOrgName(event.orgId);
      const revokedByName = await getActorName(actorUserId);
      const inv = await getInvitation(event.invitationId);
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      const recipients = new Set<string>(superAdmins);
      if (inv?.invitedBy) recipients.add(inv.invitedBy);
      recipients.delete(actorUserId);
      await Promise.all(
        [...recipients].map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "invitation_revoked" as NotificationType,
            "Invitation revoked",
            `${revokedByName} canceled the invitation to ${event.inviteeEmail} for ${orgName}.`,
            {
              invitationId: event.invitationId,
              inviteeEmail: event.inviteeEmail,
            },
          ),
        ),
      );
      return;
    }

    case "invitation_resent": {
      // Like invitation_created — the resend itself sends a new email.
      // No in-app row needed (invitee usually has no user yet).
      return;
    }

    case "membership_removed": {
      const orgName = await getOrgName(event.orgId);
      const removedName = (await getUserName(event.removedUserId)) ?? "A member";
      const removedByName = await getActorName(actorUserId);
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      const recipients = new Set<string>(superAdmins);
      // The removed user themselves always gets notified (they need to know).
      recipients.add(event.removedUserId);
      recipients.delete(actorUserId);
      await Promise.all(
        [...recipients].map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "membership_removed" as NotificationType,
            userId === event.removedUserId
              ? "You were removed from an organization"
              : "Member removed",
            userId === event.removedUserId
              ? `${removedByName} removed your access to ${orgName}.`
              : `${removedByName} removed ${removedName} from ${orgName}.`,
            { removedUserId: event.removedUserId },
          ),
        ),
      );
      return;
    }

    case "admin_permissions_changed": {
      if (event.targetUserId === actorUserId) return;
      // Spell out what moved. "Your permissions were updated" tells the reader
      // nothing they can act on, and they can't see the before/after anywhere.
      const permissionChanges = summarizePermissionChanges(event.before, event.after);
      const changedByName = await getActorName(actorUserId);
      await sendNotification(
        event.targetUserId,
        event.orgId,
        "admin_permissions_changed" as NotificationType,
        "Your permissions changed",
        permissionChanges
          ? `${changedByName} ${permissionChanges}.`
          : `${changedByName} updated your permissions for this organization.`,
        {
          before: event.before,
          after: event.after,
        },
      );
      return;
    }

    // ── Employee ────────────────────────────────────────────────────────

    case "employee_created": {
      const orgName = await getOrgName(event.orgId);
      const addedByName = await getActorName(actorUserId);
      const empUserId = await getEmployeeUserId(event.empId);
      const empName = await getEmployeeName(event.empId);
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      const recipients = new Set<string>(superAdmins);
      if (empUserId) recipients.add(empUserId);
      recipients.delete(actorUserId);
      await Promise.all(
        [...recipients].map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "employee_created" as NotificationType,
            userId === empUserId ? "You were added to an organization" : "Employee added",
            userId === empUserId
              ? `${addedByName} added you to ${orgName}.`
              : `${addedByName} added ${empName} to ${orgName}.`,
            { empId: event.empId },
          ),
        ),
      );
      return;
    }

    case "employee_status_changed": {
      const empUserId = await getEmployeeUserId(event.empId);
      const statusEmpName = await getEmployeeName(event.empId);
      const statusActorName = await getActorName(actorUserId);
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      const recipients = new Set<string>(superAdmins);
      if (empUserId) recipients.add(empUserId);
      recipients.delete(actorUserId);
      const transition = `${titleCaseWords(event.fromStatus)} to ${titleCaseWords(event.toStatus)}`;
      await Promise.all(
        [...recipients].map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "employee_status_changed" as NotificationType,
            userId === empUserId ? "Your employment status changed" : "Employee status changed",
            userId === empUserId
              ? `${statusActorName} changed your status from ${transition}.`
              : `${statusActorName} changed ${statusEmpName}'s status from ${transition}.`,
            {
              empId: event.empId,
              fromStatus: event.fromStatus,
              toStatus: event.toStatus,
            },
          ),
        ),
      );
      return;
    }

    case "employee_profile_changed": {
      const empUserId = await getEmployeeUserId(event.empId);
      if (!empUserId || empUserId === actorUserId) return;

      let body: string;
      if (event.fields.length === 0) {
        body = "Your profile was updated.";
      } else if (event.fields.length > 5) {
        body = "Several details on your profile were updated.";
      } else {
        const labels = await getOrgCopyLabels(event.orgId);
        const friendly = event.fields.map((f) => friendlyProfileFieldLabel(f, labels));
        const verb = friendly.length === 1 ? "was" : "were";
        body = `${capitalizeFirst(joinWithAnd(friendly))} ${verb} updated.`;
      }

      await sendNotification(
        empUserId,
        event.orgId,
        "employee_profile_changed" as NotificationType,
        "Your profile was updated",
        body,
        { empId: event.empId, fields: event.fields },
      );
      return;
    }

    // ── Security (account-level) ────────────────────────────────────────
    // Actor-initiated events (new sign-in, MFA toggle) skip the in-app row —
    // a "you just signed in" alert on the app you just signed into is noise.
    // Email + push (which reach out-of-band channels) still fire.

    case "security_new_device": {
      const platformLabel = formatPlatformLabel(event.platform);
      const where = event.deviceLabel ? `${event.deviceLabel} (${platformLabel})` : platformLabel;
      await sendNotification(
        event.targetUserId,
        event.orgId,
        "security_new_device" as NotificationType,
        "New sign-in on your account",
        `Your account was just signed in from a new ${where}. If this wasn't you, change your password and review your active sessions.`,
        {
          platform: event.platform,
          deviceLabel: event.deviceLabel,
          ipAddress: event.ipAddress,
        },
        { writeInApp: false },
      );
      return;
    }

    case "security_mfa_changed": {
      await sendNotification(
        event.targetUserId,
        event.orgId,
        "security_mfa_changed" as NotificationType,
        event.enabled ? "Two-factor authentication enabled" : "Two-factor authentication disabled",
        event.enabled
          ? "Two-factor authentication was turned on for your account."
          : "Two-factor authentication was turned off for your account. If this wasn't you, re-enable it and change your password.",
        { enabled: event.enabled },
        { writeInApp: false },
      );
      return;
    }

    // ── Billing (super_admin-targeted) ─────────────────────────────────

    case "billing_payment_failed": {
      const orgName = await getOrgName(event.orgId);
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      // Dedupe on stripeInvoiceId — Stripe retries webhooks, and we don't
      // want one failed invoice to produce N alerts per super_admin.
      const alreadySent = await hasExistingNotification(event.orgId, {
        type: "billing_payment_failed",
        metadataKey: "stripeInvoiceId",
        metadataValue: event.stripeInvoiceId,
      });
      if (alreadySent) return;
      await Promise.all(
        superAdmins.map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "billing_payment_failed" as NotificationType,
            "Payment failed",
            `A payment for ${orgName} failed. Update your payment method to avoid losing access.`,
            {
              stripeInvoiceId: event.stripeInvoiceId,
              amountDue: event.amountDue ?? null,
              currency: event.currency ?? null,
            },
          ),
        ),
      );
      return;
    }

    case "billing_trial_ending_soon": {
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      const alreadySent = await hasExistingNotification(event.orgId, {
        type: "billing_trial_ending_soon",
        metadataKey: "periodKey",
        metadataValue: event.periodKey,
      });
      if (alreadySent) return;
      await Promise.all(
        superAdmins.map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "billing_trial_ending_soon" as NotificationType,
            "Your trial ends soon",
            `Your trial ends on ${formatTrialDate(event.trialEndsAt)}. Add a payment method to keep your team on the schedule.`,
            {
              trialEndsAt: event.trialEndsAt,
              periodKey: event.periodKey,
            },
          ),
        ),
      );
      return;
    }

    case "billing_trial_expired": {
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      const alreadySent = await hasExistingNotification(event.orgId, {
        type: "billing_trial_expired",
        metadataKey: "trialEndsAt",
        metadataValue: event.trialEndsAt,
      });
      if (alreadySent) return;
      await Promise.all(
        superAdmins.map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "billing_trial_expired" as NotificationType,
            "Your trial has ended",
            "Your free trial has ended. Add a payment method now to restore full access.",
            { trialEndsAt: event.trialEndsAt },
          ),
        ),
      );
      return;
    }

    // ── Expiry sweepers (cron-driven) ──────────────────────────────────

    case "shift_request_expired": {
      const { requesterUserId, requesterName } = await getRequestInfo(event.requestId);
      // Dedupe — the cron may re-run; once a row exists for this request the
      // sweeper won't re-fire because it filters on status='expired' already,
      // but keep this guard so a transient SQL error mid-run can't double-fire.
      const alreadySent = await hasExistingNotification(event.orgId, {
        type: "shift_request_expired",
        metadataKey: "requestId",
        metadataValue: event.requestId,
      });
      if (alreadySent || !requesterUserId) return;
      const typeLabel = getShiftRequestTypeLabel(event.requestType);
      await sendNotification(
        requesterUserId,
        event.orgId,
        "shift_request_expired" as NotificationType,
        `${capitalize(typeLabel)} request expired`,
        `Your ${typeLabel} request expired before it was acted on. ${requesterName === "An employee" ? "Submit a new one if you still need it." : "Submit a new one if you still need it."}`,
        {
          requestId: event.requestId,
          requestType: event.requestType,
          action: "view_request",
          tab: "mine",
        },
      );
      return;
    }

    case "invitation_expired": {
      const inv = await getInvitation(event.invitationId);
      const inviter = inv?.invitedBy ?? null;
      const superAdmins = await getOrgSuperAdmins(event.orgId);
      const orgName = await getOrgName(event.orgId);
      const alreadySent = await hasExistingNotification(event.orgId, {
        type: "invitation_expired",
        metadataKey: "invitationId",
        metadataValue: event.invitationId,
      });
      if (alreadySent) return;
      const recipients = new Set<string>(superAdmins);
      if (inviter) recipients.add(inviter);
      await Promise.all(
        [...recipients].map((userId) =>
          sendNotification(
            userId,
            event.orgId,
            "invitation_expired" as NotificationType,
            "Invitation expired",
            `An invitation to ${event.inviteeEmail} for ${orgName} expired before it was accepted.`,
            {
              invitationId: event.invitationId,
              inviteeEmail: event.inviteeEmail,
            },
          ),
        ),
      );
      return;
    }

    // ── Membership change ──────────────────────────────────────────────

    case "member_dept_changed": {
      if (event.targetUserId === actorUserId) return;
      const added = event.addedDepartmentNames;
      const removed = event.removedDepartmentNames;
      if (added.length === 0 && removed.length === 0) return;
      const parts: string[] = [];
      if (added.length > 0) parts.push(`added to ${joinWithAnd(added)}`);
      if (removed.length > 0) parts.push(`removed from ${joinWithAnd(removed)}`);
      const message = `You were ${parts.join(" and ")}.`;
      await sendNotification(
        event.targetUserId,
        event.orgId,
        "member_dept_changed" as NotificationType,
        "Your departments changed",
        message,
        {
          added,
          removed,
        },
      );
      return;
    }

    case "security_session_revoked": {
      // Self-revoke: user clicked the button. No alert at all — they know.
      if (event.initiatedBy === "self") return;
      const where = event.deviceLabel ? ` on ${event.deviceLabel}` : "";
      await sendNotification(
        event.targetUserId,
        event.orgId,
        "security_session_revoked" as NotificationType,
        "You were signed out by an administrator",
        `A platform administrator ended your session${where}. Sign in again to continue.`,
        {
          initiatedBy: event.initiatedBy,
          deviceLabel: event.deviceLabel ?? null,
        },
      );
      return;
    }
  }
}

function formatPlatformLabel(platform: "web" | "ios" | "android"): string {
  if (platform === "ios") return "iOS device";
  if (platform === "android") return "Android device";
  return "browser";
}

function formatTrialDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function hasExistingNotification(
  orgId: string,
  input: { type: string; metadataKey: string; metadataValue: string },
): Promise<boolean> {
  const db = getServiceClient();
  const { data } = await db
    .from("notifications")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", input.type)
    .eq(`metadata->>${input.metadataKey}`, input.metadataValue)
    .limit(1);
  return (data ?? []).length > 0;
}
