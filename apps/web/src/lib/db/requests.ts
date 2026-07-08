import { supabase, assertSafeFilterValue, logAudit } from "./shared";
import { fetchAssignmentDefinitions } from "./config";
import type { DbShiftRequest } from "./types";
import { rowToShiftRequest } from "./mappers";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";
import type {
  GridOpenShift,
  ScheduleCellInput,
  ShiftRequest,
  ShiftRequestStatus,
  ShiftRequestType,
} from "@/types";

// ── Shift Requests ───────────────────────────────────────────────────────────

export async function fetchShiftRequests(
  orgId: string,
  assignmentLabelMap: Map<number, string>,
  filters?: {
    status?: ShiftRequestStatus[];
    type?: ShiftRequestType;
    empId?: string;
  },
): Promise<ShiftRequest[]> {
  let query = supabase
    .from("shift_requests")
    .select(
      `*,
       requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name),
       target:employees!shift_requests_target_emp_id_fkey(first_name, last_name)`,
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (filters?.status?.length) {
    query = query.in("status", filters.status);
  }
  if (filters?.type) {
    query = query.eq("type", filters.type);
  }
  if (filters?.empId) {
    assertSafeFilterValue(filters.empId, "empId");
    query = query.or(`requester_emp_id.eq.${filters.empId},target_emp_id.eq.${filters.empId}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const assignmentIdByPair = createAssignmentDefinitionIdByPairMap(
    await fetchAssignmentDefinitions(orgId, true),
  );

  return (data ?? []).map((row: Record<string, unknown>) => {
    const requester = row.requester as {
      first_name: string;
      last_name: string;
    } | null;
    const target = row.target as {
      first_name: string;
      last_name: string;
    } | null;
    const mapped: DbShiftRequest = {
      id: row.id as string,
      org_id: row.org_id as string,
      type: row.type as ShiftRequestType,
      status: row.status as ShiftRequestStatus,
      requester_emp_id: row.requester_emp_id as string,
      requester_shift_date: row.requester_shift_date as string,
      requester_state: row.requester_state as ScheduleCellInput,
      target_emp_id: row.target_emp_id as string | null,
      target_shift_date: row.target_shift_date as string | null,
      target_state: (row.target_state as ScheduleCellInput | null | undefined) ?? null,
      absence_type_id: row.absence_type_id as number | null,
      parent_request_id: row.parent_request_id as string | null,
      admin_user_id: row.admin_user_id as string | null,
      admin_note: row.admin_note as string | null,
      expires_at: row.expires_at as string,
      resolved_at: row.resolved_at as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      requester_first_name: requester?.first_name,
      requester_last_name: requester?.last_name,
      target_first_name: target?.first_name ?? null,
      target_last_name: target?.last_name ?? null,
    };
    return rowToShiftRequest(mapped, assignmentLabelMap, undefined, assignmentIdByPair);
  });
}

export async function fetchPendingApprovalCount(orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from("shift_requests")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending_approval");
  if (error) throw error;
  return count ?? 0;
}

export async function createShiftRequest(
  orgId: string,
  type: ShiftRequestType,
  requesterEmpId: string,
  requesterShiftDate: string,
  targetEmpId?: string,
  targetShiftDate?: string,
  absenceTypeId?: number,
  requesterSegmentIndex?: number,
  targetSegmentIndex?: number,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_shift_request", {
    p_org_id: orgId,
    p_type: type,
    p_requester_emp_id: requesterEmpId,
    p_requester_shift_date: requesterShiftDate,
    p_target_emp_id: targetEmpId ?? null,
    p_target_shift_date: targetShiftDate ?? null,
    p_absence_type_id: absenceTypeId ?? null,
    p_requester_segment_index: requesterSegmentIndex ?? null,
    p_target_segment_index: targetSegmentIndex ?? null,
  });
  if (error) throw error;
  void logAudit(
    "shift_request.created",
    "shift_request",
    data as string,
    { type, requesterEmpId, requesterShiftDate, targetEmpId, targetShiftDate },
    orgId,
  );
  return data as string;
}

export async function claimShiftRequest(
  requestId: string,
  claimerEmpId: string,
  orgId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("claim_shift_request", {
    p_request_id: requestId,
    p_claimer_emp_id: claimerEmpId,
  });
  if (error) throw error;
  void logAudit(
    "shift_request.claimed",
    "shift_request",
    requestId,
    { claimerEmpId },
    orgId ?? null,
  );
}

export async function volunteerForOpenShift(
  orgId: string,
  empId: string,
  shiftDate: string,
  input: ScheduleCellInput,
  focusAreaId: number,
): Promise<string> {
  if (input.kind !== "worked" || input.segments.length === 0) {
    throw new Error("Open-shift volunteering requires a worked assignment");
  }

  const { data, error } = await supabase.rpc("volunteer_for_open_shift", {
    p_org_id: orgId,
    p_emp_id: empId,
    p_shift_date: shiftDate,
    p_shift_ids: input.segments.map((segment) => segment.shiftId),
    p_job_ids: input.segments.map((segment) => segment.jobId),
    p_is_mentored_flags: input.segments.map((segment) => segment.isMentored ?? false),
    p_focus_area_id: focusAreaId,
    p_custom_start_time: input.customStartTime ?? null,
    p_custom_end_time: input.customEndTime ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function respondToShiftRequest(
  requestId: string,
  empId: string,
  accept: boolean,
  orgId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("respond_to_shift_request", {
    p_request_id: requestId,
    p_emp_id: empId,
    p_accept: accept,
  });
  if (error) throw error;
  void logAudit(
    "shift_request.responded",
    "shift_request",
    requestId,
    { empId, accept },
    orgId ?? null,
  );
}

export async function resolveShiftRequest(
  requestId: string,
  approved: boolean,
  note?: string,
  orgId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("resolve_shift_request", {
    p_request_id: requestId,
    p_approved: approved,
    p_note: note ?? null,
  });
  if (error) throw error;
  void logAudit("shift_request.resolved", "shift_request", requestId, { approved }, orgId ?? null);
}

export async function cancelShiftRequest(
  requestId: string,
  empId: string,
  orgId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("cancel_shift_request", {
    p_request_id: requestId,
    p_emp_id: empId,
  });
  if (error) throw error;
  void logAudit("shift_request.canceled", "shift_request", requestId, { empId }, orgId ?? null);
}

// ── Open Shifts for Grid ──────────────────────────────────────────────────

export async function fetchCalloffOpenShifts(
  orgId: string,
  startDate: string,
  endDate: string,
  assignmentLabelMap: Map<number, string>,
): Promise<GridOpenShift[]> {
  // Fetch pickup requests spawned from approved calloffs (parent_request_id IS NOT NULL)
  const { data, error } = await supabase
    .from("shift_requests")
    .select(
      `*, requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name, focus_area_ids)`,
    )
    .eq("org_id", orgId)
    .eq("type", "pickup")
    .eq("status", "open")
    .not("parent_request_id", "is", null)
    .gte("requester_shift_date", startDate)
    .lte("requester_shift_date", endDate);

  if (error) throw error;

  const assignmentIdByPair = createAssignmentDefinitionIdByPairMap(
    await fetchAssignmentDefinitions(orgId, true),
  );

  return (data ?? [])
    .map((row: Record<string, unknown>) => {
      const requester = row.requester as {
        first_name: string;
        last_name: string;
        focus_area_ids: number[];
      } | null;
      const mapped: DbShiftRequest = {
        id: row.id as string,
        org_id: row.org_id as string,
        type: row.type as ShiftRequestType,
        status: row.status as ShiftRequestStatus,
        requester_emp_id: row.requester_emp_id as string,
        requester_shift_date: row.requester_shift_date as string,
        requester_state: row.requester_state as ScheduleCellInput,
        target_emp_id: row.target_emp_id as string | null,
        target_shift_date: row.target_shift_date as string | null,
        target_state: (row.target_state as ScheduleCellInput | null | undefined) ?? null,
        absence_type_id: row.absence_type_id as number | null,
        parent_request_id: row.parent_request_id as string | null,
        admin_user_id: row.admin_user_id as string | null,
        admin_note: row.admin_note as string | null,
        expires_at: row.expires_at as string,
        resolved_at: row.resolved_at as string | null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        requester_first_name: requester?.first_name,
        requester_last_name: requester?.last_name,
        target_first_name: null,
        target_last_name: null,
      };
      const request = rowToShiftRequest(mapped, assignmentLabelMap, undefined, assignmentIdByPair);
      // BUG 1.7: Determine focusAreaId, omit shifts with focusAreaId=0
      const resolvedFocusAreaId = request.requesterFocusAreaId ?? requester?.focus_area_ids?.[0];
      if (resolvedFocusAreaId == null) {
        // Skip this open shift if we cannot determine a valid focus area
        console.warn(
          `[fetchCalloffOpenShifts] Skipping open shift ${row.id}: requester has no focus_area_id and no home focus areas`,
        );
        return null;
      }
      return {
        id: request.id,
        source: "calloff" as const,
        date: request.requesterShiftDate,
        focusAreaId: resolvedFocusAreaId,
        shiftIds: request.requesterShiftIds,
        jobIds: request.requesterJobIds,
        assignmentIds: request.requesterAssignmentDefinitionIds,
        assignmentLabel: request.requesterShiftLabel,
        customStartTime: request.requesterCustomStartTime,
        customEndTime: request.requesterCustomEndTime,
        calledOffBy: request.requesterName || undefined,
        requestId: request.id,
        needed: 1,
      };
    })
    .filter((item: GridOpenShift | null) => item !== null) as GridOpenShift[];
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export async function fetchOnboardingStatus(
  userId: string,
  orgId: string,
): Promise<{
  completed: boolean;
  completedAt: string | null;
  tooltipToursCompleted: Record<string, string>;
}> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("onboarding_completed_at, tooltip_tours_completed")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return {
    completed: !!data?.onboarding_completed_at,
    completedAt: data?.onboarding_completed_at ?? null,
    tooltipToursCompleted: (data?.tooltip_tours_completed as Record<string, string>) ?? {},
  };
}

export async function completeOnboarding(_userId: string, orgId: string): Promise<void> {
  const { error } = await supabase.rpc("complete_onboarding", {
    p_org_id: orgId,
  });
  if (error) throw error;
}
