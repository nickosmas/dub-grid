import { getServiceClient } from "@/lib/supabase-service";
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
    .eq("org_role", "super_admin");

  const { data: admins } = await db
    .from("organization_memberships")
    .select("user_id, admin_permissions")
    .eq("org_id", orgId)
    .eq("org_role", "admin");

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

  const { data: shifts } = await db
    .from("shifts")
    .select("emp_id")
    .eq("org_id", orgId)
    .gte("date", startDate)
    .lte("date", endDate)
    .not("published_shift_code_ids", "is", null);

  if (!shifts?.length) return [];

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
): Promise<{ userId: string | null; requesterName: string }> {
  const db = getServiceClient();
  const { data } = await db
    .from("shift_requests")
    .select(
      "requester:employees!shift_requests_requester_emp_id_fkey(user_id, first_name, last_name)",
    )
    .eq("id", requestId)
    .single();

  const requesterRows = data?.requester as
    | { user_id: string | null; first_name: string; last_name: string }[]
    | null;
  const requester = requesterRows?.[0] ?? null;

  return {
    userId: requester?.user_id ?? null,
    requesterName: requester
      ? `${requester.first_name} ${requester.last_name}`
      : "An employee",
  };
}

export async function dispatchNotificationEvent(
  actorUserId: string,
  event: NotificationEvent,
): Promise<void> {
  switch (event.action) {
    case "shift_request_created": {
      const { requesterName } = await getRequestInfo(event.requestId);
      const adminIds = await getAdminsWithPermission(
        event.orgId,
        "canApproveShiftRequests",
      );
      const typeLabel =
        event.requestType === "calloff"
          ? "calloff"
          : event.requestType === "swap"
            ? "swap"
            : "pickup";

      await Promise.all(
        adminIds
          .filter((id) => id !== actorUserId)
          .map((adminId) =>
            sendNotification(
              adminId,
              event.orgId,
              "shift_request_new" as NotificationType,
              `New ${typeLabel} request`,
              `${requesterName} submitted a ${typeLabel} request that needs your approval.`,
              {
                requestId: event.requestId,
                requestType: event.requestType,
              },
            ),
          ),
      );
      return;
    }

    case "shift_request_claimed": {
      const { requesterName: claimerName } = await getRequestInfo(event.requestId);
      const adminIds = await getAdminsWithPermission(
        event.orgId,
        "canApproveShiftRequests",
      );
      await Promise.all(
        adminIds
          .filter((id) => id !== actorUserId)
          .map((adminId) =>
            sendNotification(
              adminId,
              event.orgId,
              "shift_request_new" as NotificationType,
              "Shift pickup claimed",
              `${claimerName} claimed a pickup request that needs your approval.`,
              {
                requestId: event.requestId,
                requestType: "pickup",
              },
            ),
          ),
      );
      return;
    }

    case "shift_request_resolved": {
      const { userId } = await getRequestInfo(event.requestId);
      if (userId && userId !== actorUserId) {
        const status = event.approved ? "approved" : "rejected";
        const type: NotificationType = event.approved
          ? "shift_request_approved"
          : "shift_request_rejected";
        const noteText = event.adminNote ? ` Note: ${event.adminNote}` : "";

        await sendNotification(
          userId,
          event.orgId,
          type,
          `Request ${status}`,
          `Your ${event.requestType} request has been ${status}.${noteText}`,
          {
            requestId: event.requestId,
            requestType: event.requestType,
            approved: event.approved,
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
