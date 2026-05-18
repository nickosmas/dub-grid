import { getServiceClient } from "@/lib/supabase-service";
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
      action: "recurring_shift_updated";
      orgId: string;
      empId: string;
      mode: "upsert" | "delete";
    }
  | {
      action: "shift_series_changed";
      orgId: string;
      seriesId: string;
      mode: "create" | "update_all" | "delete";
      /** Pre-resolved affected employees. If omitted, looked up from shifts in series. */
      empIds?: string[];
    }
  | {
      action: "schedule_note_changed";
      orgId: string;
      empId: string;
      date: string;
      mode: "upsert" | "delete";
      /** Resulting note status — only notifies when 'published'. */
      status: "draft" | "published" | "draft_deleted";
    }
  | {
      action: "recurring_schedules_applied";
      orgId: string;
      startDate: string;
      endDate: string;
      affectedEmpIds: string[];
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
    };

async function getAdminsWithPermission(
  orgId: string,
  permission: string,
): Promise<string[]> {
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

  return (employees ?? [])
    .map((employee) => employee.user_id as string)
    .filter(Boolean);
}

async function getRequestInfo(
  requestId: string,
): Promise<{
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
    requesterName: requester
      ? `${requester.first_name} ${requester.last_name}`
      : "An employee",
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
  const { data } = await db
    .from("employees")
    .select("user_id")
    .eq("id", empId)
    .maybeSingle();
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

async function getSeriesAffectedUserIds(seriesId: string): Promise<string[]> {
  const db = getServiceClient();
  const { data: shifts } = await db
    .from("schedule_cell_snapshots")
    .select("cell:schedule_cells(emp_id)")
    .eq("series_id", seriesId);
  if (!shifts) return [];
  const empIds = new Set<string>();
  for (const row of shifts as Array<{ cell: { emp_id?: string } | null }>) {
    const empId = row.cell?.emp_id;
    if (empId) empIds.add(empId);
  }
  if (empIds.size === 0) return [];
  const { data: emps } = await db
    .from("employees")
    .select("user_id")
    .in("id", [...empIds])
    .not("user_id", "is", null);
  return (emps ?? [])
    .map((emp) => emp.user_id as string)
    .filter(Boolean);
}

async function getAffectedUserIdsForEmpIds(
  empIds: string[],
): Promise<string[]> {
  if (empIds.length === 0) return [];
  const db = getServiceClient();
  const { data } = await db
    .from("employees")
    .select("user_id")
    .in("id", empIds)
    .not("user_id", "is", null);
  return (data ?? []).map((row) => row.user_id as string).filter(Boolean);
}

async function getInvitation(
  invitationId: string,
): Promise<{
  invitedBy: string | null;
  email: string | null;
  orgId: string | null;
} | null> {
  const db = getServiceClient();
  const { data } = await db
    .from("invitations")
    .select("invited_by, email, org_id")
    .eq("id", invitationId)
    .maybeSingle();
  if (!data) return null;
  return {
    invitedBy: (data.invited_by as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    orgId: (data.org_id as string | null) ?? null,
  };
}

async function getOrgName(orgId: string): Promise<string> {
  const db = getServiceClient();
  const { data } = await db
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  return (data?.name as string | null) ?? "your organization";
}

async function notifyShiftRequestApprovers(input: {
  actorUserId: string;
  orgId: string;
  requestId: string;
  requestType: "pickup" | "swap" | "calloff";
  title: string;
  message: string;
}) {
  const adminIds = await getAdminsWithPermission(
    input.orgId,
    "canApproveShiftRequests",
  );

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

export async function dispatchNotificationEvent(
  actorUserId: string,
  event: NotificationEvent,
): Promise<void> {
  try {
    await dispatchNotificationEventInternal(actorUserId, event);
  } catch (error) {
    logger.error(
      { error, action: event.action, orgId: event.orgId },
      "Failed to dispatch notification event",
    );
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
      return;
    }

    case "schedule_published": {
      const userIds = await getAffectedEmployeeUserIds(
        event.orgId,
        event.startDate,
        event.endDate,
      );

      await Promise.all(
        userIds
          .filter((id) => id !== actorUserId)
          .map((userId) =>
            sendNotification(
              userId,
              event.orgId,
              "schedule_published" as NotificationType,
              "Schedule updated",
              `A new schedule has been published for ${event.startDate} to ${event.endDate}. Check the schedule page for your shifts.`,
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
          "Your role has been updated",
          `Your role has been changed from ${event.fromRole} to ${event.toRole}.`,
          {
            fromRole: event.fromRole,
            toRole: event.toRole,
          },
        );
      }
    }
  }
}
