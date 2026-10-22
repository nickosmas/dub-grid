import { buildPermissionContext, scheduleViewerVisibility } from "@dubgrid/authz";
import { scheduleCellStateSchema, type ScheduleCellState } from "@dubgrid/contracts";
import {
  cellStateToChangeDay,
  describeShiftChange,
  type ShiftChangeResolvers,
} from "@dubgrid/schedule-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminPermissions, OrganizationRole } from "@/types";
import { isNoOpPublishChange, isNotePublishChangeRow } from "@/lib/db/publish-history";
import logger from "@/lib/logger";
import { sendNotification } from "./sender";
import { buildShiftChangeAlert, type ChangedDay } from "./shift-change-alert";

interface ChangeRow {
  emp_id: string;
  date: string;
  kind: string;
  from_state: unknown;
  to_state: unknown;
}

function readCellState(state: unknown): ScheduleCellState | null | undefined {
  if (state == null) return null;
  const parsed = scheduleCellStateSchema.safeParse(state);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Sends each person whose shifts a publish changed one alert listing every
 * changed day (item 46e), with push and, under their schedule email
 * preference, an email. The publisher gets none. Whether a person sees what
 * each day was follows the organization's choice for staff (item 46f).
 * Never throws: the publish has already committed.
 */
export async function notifyPublishedShiftChanges(input: {
  serviceClient: SupabaseClient;
  orgId: string;
  publishHistoryId: string;
  actorId: string;
  /** Names for the organization's shifts, jobs, focus areas and absences, archived included. */
  loadResolvers: () => Promise<ShiftChangeResolvers>;
}): Promise<void> {
  const { serviceClient, orgId, publishHistoryId, actorId } = input;
  try {
    const { data: changeRows, error: changeError } = await serviceClient
      .from("schedule_publish_changes")
      .select("emp_id, date, kind, from_state, to_state")
      .eq("publish_history_id", publishHistoryId);
    if (changeError) throw changeError;
    const cellRows = ((changeRows ?? []) as ChangeRow[]).filter(
      (row) =>
        !isNotePublishChangeRow(row) &&
        !isNoOpPublishChange({
          kind: row.kind as "new" | "modified" | "deleted",
          fromState: readCellState(row.from_state) ?? null,
          toState: readCellState(row.to_state) ?? null,
        }),
    );
    if (cellRows.length === 0) return;

    const empIds = [...new Set(cellRows.map((row) => row.emp_id))];
    const [{ data: employees, error: employeeError }, { data: org, error: orgError }] =
      await Promise.all([
        serviceClient.from("employees").select("id, user_id").eq("org_id", orgId).in("id", empIds),
        serviceClient
          .from("organizations")
          .select("staff_see_shift_changes")
          .eq("id", orgId)
          .maybeSingle(),
      ]);
    if (employeeError) throw employeeError;
    if (orgError) throw orgError;

    const userByEmp = new Map<string, string>();
    for (const row of (employees ?? []) as { id: string; user_id: string | null }[]) {
      if (row.user_id && row.user_id !== actorId) userByEmp.set(row.id, row.user_id);
    }
    if (userByEmp.size === 0) return;

    const userIds = [...new Set(userByEmp.values())];
    const [resolvers, { data: memberships, error: membershipError }] = await Promise.all([
      input.loadResolvers(),
      serviceClient
        .from("organization_memberships")
        .select("user_id, org_role, admin_permissions")
        .eq("org_id", orgId)
        .in("user_id", userIds)
        .is("archived_at", null),
    ]);
    if (membershipError) throw membershipError;

    const showDetailsFor = new Map<string, boolean>();
    for (const row of (memberships ?? []) as {
      user_id: string;
      org_role: OrganizationRole | null;
      admin_permissions: AdminPermissions | null;
    }[]) {
      const permissions = buildPermissionContext(
        row.org_role ?? "user",
        orgId,
        row.admin_permissions,
      );
      showDetailsFor.set(
        row.user_id,
        scheduleViewerVisibility(permissions, {
          staffSeeShiftChanges: (org?.staff_see_shift_changes as boolean | null) ?? true,
        }).showChangeDetails,
      );
    }

    const daysByUser = new Map<string, ChangedDay[]>();
    for (const row of cellRows) {
      const userId = userByEmp.get(row.emp_id);
      const from = readCellState(row.from_state);
      const to = readCellState(row.to_state);
      if (!userId || from === undefined || to === undefined) continue;
      const change = describeShiftChange(
        cellStateToChangeDay(from, resolvers),
        cellStateToChangeDay(to, resolvers),
        { date: row.date },
      );
      daysByUser.set(userId, [...(daysByUser.get(userId) ?? []), { date: row.date, change }]);
    }

    const results = await Promise.allSettled(
      [...daysByUser].map(async ([userId, days]) => {
        // A person no longer in the organization gets nothing.
        if (!showDetailsFor.has(userId)) return;
        const alert = buildShiftChangeAlert({
          days,
          showDetails: showDetailsFor.get(userId)!,
          publishHistoryId,
        });
        if (!alert) return;
        await sendNotification(
          userId,
          orgId,
          "shift_change",
          alert.title,
          alert.message,
          alert.metadata,
          {
            email: alert.email,
          },
        );
      }),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        logger.error(
          { error: result.reason, orgId, publishHistoryId },
          "Shift change alert failed",
        );
      }
    }
  } catch (error) {
    logger.error({ error, orgId, publishHistoryId }, "Shift change alerts failed");
  }
}
