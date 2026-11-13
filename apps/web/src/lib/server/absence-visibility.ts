import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbAbsenceType } from "@dubgrid/db-types";
import {
  createAbsenceNameMask,
  HIDDEN_ABSENCE_TYPE,
  maskCellStateAbsence,
  type AbsenceNameMask,
} from "@dubgrid/domain";
import { normalizeCoverageRuleConfig, resolveDayOffAbsenceType } from "@dubgrid/schedule-core";
import { rowToAbsenceType } from "@/lib/db/mappers";
import { ABSENCE_TYPE_COLS } from "@/lib/db/shared";
import type { AbsenceType } from "@/types";

/**
 * How this viewer sees a colleague's absence, or null when they see every
 * name (the organization shows them, or the viewer runs the schedule,
 * approves requests or manages staff). Reads nothing when it is null.
 */
export async function resolveAbsenceNameMask(
  serviceClient: SupabaseClient,
  orgId: string,
  viewer: { showAbsenceNames: boolean; userId: string },
): Promise<AbsenceNameMask | null> {
  if (viewer.showAbsenceNames) return null;
  const [employees, org, absenceTypes] = await Promise.all([
    serviceClient.from("employees").select("id").eq("org_id", orgId).eq("user_id", viewer.userId),
    serviceClient
      .from("organizations")
      .select("coverage_rule_config")
      .eq("id", orgId)
      .maybeSingle(),
    serviceClient.from("absence_types").select(ABSENCE_TYPE_COLS).eq("org_id", orgId),
  ]);
  if (employees.error) throw employees.error;
  if (org.error) throw org.error;
  if (absenceTypes.error) throw absenceTypes.error;
  const dayOff = resolveDayOffAbsenceType(
    normalizeCoverageRuleConfig(
      (org.data as { coverage_rule_config?: unknown } | null)?.coverage_rule_config,
    ),
    ((absenceTypes.data ?? []) as DbAbsenceType[]).map(rowToAbsenceType),
  );
  return createAbsenceNameMask({
    showAbsenceNames: false,
    viewerEmployeeIds: ((employees.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    keepAbsenceTypeIds: [dayOff?.absenceType.id],
  });
}

/**
 * The Time off absence, for a viewer who sees it in place of colleagues'.
 * Not archived, which would label it "(archived)"; the call-off picker leaves
 * it out instead.
 */
export function hiddenAbsenceTypeFor(orgId: string): AbsenceType {
  return {
    id: HIDDEN_ABSENCE_TYPE.id,
    orgId,
    label: HIDDEN_ABSENCE_TYPE.label,
    name: HIDDEN_ABSENCE_TYPE.name,
    color: HIDDEN_ABSENCE_TYPE.color,
    border: HIDDEN_ABSENCE_TYPE.borderColor,
    text: HIDDEN_ABSENCE_TYPE.textColor,
    sortOrder: Number.MAX_SAFE_INTEGER,
    archivedAt: null,
  };
}

/** A schedule cell row with each snapshot's absence as this viewer may see it. */
export function maskCellRowAbsences<
  T extends { emp_id: string; snapshots?: Array<{ absence_type_id?: number | null }> | null },
>(mask: AbsenceNameMask | null, row: T): T {
  if (!mask || !row.snapshots?.some((snapshot) => snapshot.absence_type_id != null)) return row;
  return {
    ...row,
    snapshots: row.snapshots.map((snapshot) =>
      snapshot.absence_type_id == null
        ? snapshot
        : {
            ...snapshot,
            absence_type_id: mask.absenceTypeId(row.emp_id, snapshot.absence_type_id),
          },
    ),
  };
}

function maskStateValue(mask: AbsenceNameMask, empId: string, state: unknown): unknown {
  if (!state || typeof state !== "object" || !("absenceTypeId" in state)) return state;
  return maskCellStateAbsence(mask, empId, state as { absenceTypeId?: number | null });
}

/** A published change row with both sides' absences as this viewer may see them. */
export function maskPublishChangeRowAbsences<
  T extends {
    emp_id: string;
    from_state?: unknown;
    to_state?: unknown;
    from_absence_type_id?: number | null;
    to_absence_type_id?: number | null;
  },
>(mask: AbsenceNameMask | null, row: T): T {
  if (!mask) return row;
  return {
    ...row,
    from_state: maskStateValue(mask, row.emp_id, row.from_state),
    to_state: maskStateValue(mask, row.emp_id, row.to_state),
    from_absence_type_id: mask.absenceTypeId(row.emp_id, row.from_absence_type_id),
    to_absence_type_id: mask.absenceTypeId(row.emp_id, row.to_absence_type_id),
  };
}
