import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FOCUS_AREA_SHIFTS_DECISION_CODE,
  focusAreaShiftsClearFailed,
  focusAreaShiftsRefusal,
  removedFocusAreaIds,
  type FocusAreaShiftsDecision,
  type FocusAreaUpcomingShifts,
} from "@dubgrid/domain";
import logger from "@/lib/logger";

export interface FocusAreaShiftsRefusalBody {
  error: string;
  code: typeof FOCUS_AREA_SHIFTS_DECISION_CODE;
  focusAreaShifts: FocusAreaUpcomingShifts[];
}

/** Someone's shifts from today in each of `focusAreaIds` that holds any, by the same rule the clear uses. */
export async function fetchUpcomingFocusAreaShifts(
  serviceClient: SupabaseClient,
  orgId: string,
  employeeId: string,
  focusAreaIds: readonly number[],
): Promise<FocusAreaUpcomingShifts[]> {
  if (focusAreaIds.length === 0) return [];
  const { data, error } = await serviceClient.rpc("upcoming_focus_area_shifts", {
    p_emp_id: employeeId,
    p_focus_area_ids: focusAreaIds,
  });
  if (error) throw error;
  const rows = (data ?? []) as {
    focus_area_id: number;
    shift_count: number;
    first_date: string;
    last_date: string;
  }[];
  if (rows.length === 0) return [];

  const { data: names, error: namesError } = await serviceClient
    .from("focus_areas")
    .select("id, name")
    .eq("org_id", orgId)
    .in(
      "id",
      rows.map((row) => row.focus_area_id),
    );
  if (namesError) throw namesError;
  const nameById = new Map(
    ((names ?? []) as { id: number; name: string }[]).map((row) => [Number(row.id), row.name]),
  );
  return rows
    .map((row) => ({
      focusAreaId: Number(row.focus_area_id),
      focusAreaName: nameById.get(Number(row.focus_area_id)) ?? "",
      count: Number(row.shift_count),
      firstDate: row.first_date,
      lastDate: row.last_date,
    }))
    .filter((area) => area.focusAreaName !== "");
}

export type FocusAreaShiftsPlan =
  { refuse: FocusAreaShiftsRefusalBody } | { refuse?: undefined; clear: FocusAreaUpcomingShifts[] };

/**
 * Before a save that may take someone off focus areas: refuses it when an
 * area they come off holds upcoming shifts and the save doesn't say whether
 * to clear or keep them, and otherwise names the areas to clear after it.
 */
export async function planFocusAreaShifts(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    before: readonly number[];
    after: readonly number[];
    decision: FocusAreaShiftsDecision | undefined;
  },
): Promise<FocusAreaShiftsPlan> {
  const removed = removedFocusAreaIds(input.before, input.after);
  if (removed.length === 0 || input.decision === "keep") return { clear: [] };
  const areas = await fetchUpcomingFocusAreaShifts(
    serviceClient,
    input.orgId,
    input.employeeId,
    removed,
  );
  if (areas.length === 0) return { clear: [] };
  if (!input.decision) {
    return {
      refuse: {
        error: focusAreaShiftsRefusal(areas),
        code: FOCUS_AREA_SHIFTS_DECISION_CODE,
        focusAreaShifts: areas,
      },
    };
  }
  return { clear: areas };
}

/**
 * Clears the planned areas' shifts once the person is saved, in one database
 * transaction, and records it. A failure leaves every shift in place and
 * returns what to tell the manager; the save itself stands.
 */
export async function clearFocusAreaShiftsAfterSave(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    areas: readonly FocusAreaUpcomingShifts[];
    actor: { id: string; email: string | null };
    ipAddress: string | null;
    userAgent: string | null;
  },
): Promise<{ cleared: number; notCleared?: undefined } | { notCleared: string }> {
  if (input.areas.length === 0) return { cleared: 0 };
  const { data, error } = await serviceClient.rpc("clear_focus_area_shifts", {
    p_emp_id: input.employeeId,
    p_focus_area_ids: input.areas.map((area) => area.focusAreaId),
    p_actor_id: input.actor.id,
  });
  if (error) {
    logger.error(
      { error, orgId: input.orgId, empId: input.employeeId },
      "Clearing focus area shifts failed",
    );
    return { notCleared: focusAreaShiftsClearFailed(input.areas) };
  }

  const cleared = Number(data ?? 0);
  if (cleared > 0) {
    const { error: auditError } = await serviceClient.from("audit_log").insert({
      org_id: input.orgId,
      actor_id: input.actor.id,
      actor_email: input.actor.email,
      action: "employee.focus_area_shifts_cleared",
      resource_type: "employee",
      resource_id: input.employeeId,
      details: {
        firstName: input.firstName,
        lastName: input.lastName,
        count: cleared,
        focusAreas: input.areas.map((area) => area.focusAreaName),
      },
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
    });
    if (auditError) {
      logger.error(
        { error: auditError, orgId: input.orgId, empId: input.employeeId },
        "Focus area shifts audit log write failed",
      );
    }
  }
  return { cleared };
}
