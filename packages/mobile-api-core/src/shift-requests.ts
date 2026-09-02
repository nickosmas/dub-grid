import { normalizeMobileScheduleRange, type MobileScheduleQuery } from "@dubgrid/contracts";
import type {
  MobileBootstrapResponse,
  MobileCreateShiftRequestBody,
  MobileOpenShift,
  MobileScheduleEntry,
  MobileShiftRequest,
  MobileShiftRequestHistoryCursor,
  MobileShiftRequestHistoryResponse,
  MobileUpdateShiftRequestBody,
} from "@dubgrid/contracts";
import { hasShiftRequestStarted, timesOverlap, type TimeRange } from "@dubgrid/schedule-core";
import type { SupabaseClient } from "@supabase/supabase-js";

type MobileShiftRequestEmployee = NonNullable<MobileBootstrapResponse["linkedEmployee"]>;

export type MobileShiftRequestsContext = {
  currentOrg: {
    id: string;
    timezone?: string | null;
  };
  permissions: {
    canEditShifts: boolean;
    canManageEmployees: boolean;
    canApproveShiftRequests: boolean;
  };
  serviceClient: SupabaseClient;
  user: {
    id: string;
  };
  userClient: SupabaseClient;
};

type FetchLinkedEmployeeForUser<TEmployee extends MobileShiftRequestEmployee> = (
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
) => Promise<TEmployee | null>;

type FetchMobileShiftRequests = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId?: string;
    includeOpenPickupRequests: boolean;
    startDate?: string;
    endDate?: string;
  },
) => Promise<MobileShiftRequest[]>;

type FetchMobileShiftRequestHistory = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId?: string;
    limit: number;
    cursor?: MobileShiftRequestHistoryCursor | null;
  },
) => Promise<MobileShiftRequestHistoryResponse>;

type FetchMobileOpenShifts<TEmployee extends MobileShiftRequestEmployee> = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employee?: TEmployee;
    startDate?: string;
    endDate?: string;
    showAll?: boolean;
    timeZone?: string | null;
  },
) => Promise<MobileOpenShift[]>;

type FetchMobileScheduleEntries = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId?: string;
    startDate: string;
    endDate: string;
  },
) => Promise<MobileScheduleEntry[]>;

type ShiftRequestNotificationEvent =
  | {
      action: "shift_request_created";
      orgId: string;
      requestId: string;
      requestType: "pickup" | "swap" | "calloff";
    }
  | {
      action: "shift_request_claimed";
      orgId: string;
      requestId: string;
      requestType: "pickup";
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
    };

// The dispatcher may return a structured result (e.g. { success, error }) or
// void — this package awaits but doesn't inspect the result, so the contract
// is widened to `unknown` to accept either shape. Callers that DO want to
// inspect the result can do so at their own type boundary.
type DispatchShiftRequestNotificationEvent = (
  actorUserId: string,
  event: ShiftRequestNotificationEvent,
) => Promise<unknown>;

type MobileShiftRequestsResponse = {
  requests: MobileShiftRequest[];
  openShifts: MobileOpenShift[];
};

function resolveMobileShiftRequestRange(
  startDate?: string,
  endDate?: string,
): { startDate: string; endDate: string } {
  return normalizeMobileScheduleRange({
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  } as MobileScheduleQuery);
}

function toTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): TimeRange | null {
  const normalizedStart = start?.slice(0, 5) ?? null;
  const normalizedEnd = end?.slice(0, 5) ?? null;

  if (!normalizedStart || !normalizedEnd) {
    return null;
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
  };
}

function getScheduleEntryTimeRanges(entry: MobileScheduleEntry): TimeRange[] {
  if (entry.state.kind === "absence") {
    return [];
  }

  const segmentRanges = entry.presentation.segments.flatMap((segment) => {
    const range = toTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const presentationRange = toTimeRange(entry.presentation.startTime, entry.presentation.endTime);

  return presentationRange ? [presentationRange] : [];
}

function getRequestTimeRanges(request: MobileShiftRequest): TimeRange[] {
  const segments = request.requesterPresentation?.segments ?? [];
  const segmentRanges = segments.flatMap((segment) => {
    const range = toTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const presentationRange = toTimeRange(
    request.requesterPresentation?.startTime ?? null,
    request.requesterPresentation?.endTime ?? null,
  );

  if (presentationRange) {
    return [presentationRange];
  }

  const stateRange = toTimeRange(
    request.requesterState?.customStartTime ?? null,
    request.requesterState?.customEndTime ?? null,
  );

  return stateRange ? [stateRange] : [];
}

function buildScheduleRangesByDate(entries: MobileScheduleEntry[]): Map<string, TimeRange[]> {
  const rangesByDate = new Map<string, TimeRange[]>();

  for (const entry of entries) {
    const ranges = getScheduleEntryTimeRanges(entry);

    if (ranges.length === 0) {
      continue;
    }

    const currentRanges = rangesByDate.get(entry.date) ?? [];
    currentRanges.push(...ranges);
    rangesByDate.set(entry.date, currentRanges);
  }

  return rangesByDate;
}

function filterAvailableOpenPickupRequests(input: {
  linkedEmployeeId: string;
  requests: MobileShiftRequest[];
  scheduleEntries: MobileScheduleEntry[];
  timeZone?: string | null;
}): MobileShiftRequest[] {
  const scheduleRangesByDate = buildScheduleRangesByDate(input.scheduleEntries);
  const now = new Date();

  return input.requests.filter((request) => {
    if (
      request.type !== "pickup" ||
      request.status !== "open" ||
      request.requesterEmpId === input.linkedEmployeeId
    ) {
      return true;
    }

    if (request.targetEmpId != null && request.targetEmpId !== input.linkedEmployeeId) {
      return false;
    }

    if (hasShiftRequestStarted(request, now, input.timeZone)) {
      return false;
    }

    return !timesOverlap(
      scheduleRangesByDate.get(request.requesterShiftDate) ?? [],
      getRequestTimeRanges(request),
    );
  });
}

export async function loadMobileShiftRequestsPayload<TEmployee extends MobileShiftRequestEmployee>(
  auth: MobileShiftRequestsContext,
  input: { startDate?: string; endDate?: string },
  deps: {
    fetchLinkedEmployeeForUser: FetchLinkedEmployeeForUser<TEmployee>;
    fetchMobileOpenShifts: FetchMobileOpenShifts<TEmployee>;
    fetchMobileScheduleEntries: FetchMobileScheduleEntries;
    fetchMobileShiftRequests: FetchMobileShiftRequests;
  },
): Promise<MobileShiftRequestsResponse> {
  const linkedEmployee = await deps.fetchLinkedEmployeeForUser(
    auth.serviceClient,
    auth.currentOrg.id,
    auth.user.id,
  );

  const canViewAllRequests =
    auth.permissions.canApproveShiftRequests ||
    auth.permissions.canEditShifts ||
    auth.permissions.canManageEmployees;

  if (!canViewAllRequests && !linkedEmployee) {
    return { requests: [], openShifts: [] };
  }

  const employeeId = canViewAllRequests ? undefined : linkedEmployee?.id;
  const requestRange = resolveMobileShiftRequestRange(input.startDate, input.endDate);

  const [requests, openShifts, availabilityEntries] = await Promise.all([
    deps.fetchMobileShiftRequests(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      employeeId,
      includeOpenPickupRequests: !canViewAllRequests,
      ...(input.startDate ? { startDate: input.startDate } : {}),
      ...(input.endDate ? { endDate: input.endDate } : {}),
    }),
    linkedEmployee || canViewAllRequests
      ? deps.fetchMobileOpenShifts(auth.serviceClient, {
          orgId: auth.currentOrg.id,
          ...(linkedEmployee ? { employee: linkedEmployee } : {}),
          showAll: canViewAllRequests,
          timeZone: auth.currentOrg.timezone ?? null,
          ...(input.startDate ? { startDate: input.startDate } : {}),
          ...(input.endDate ? { endDate: input.endDate } : {}),
        })
      : Promise.resolve([]),
    employeeId
      ? deps.fetchMobileScheduleEntries(auth.serviceClient, {
          orgId: auth.currentOrg.id,
          employeeId,
          startDate: requestRange.startDate,
          endDate: requestRange.endDate,
        })
      : Promise.resolve([]),
  ]);

  return {
    requests:
      employeeId && !canViewAllRequests
        ? filterAvailableOpenPickupRequests({
            linkedEmployeeId: employeeId,
            requests,
            scheduleEntries: availabilityEntries,
            timeZone: auth.currentOrg.timezone ?? null,
          })
        : requests,
    openShifts,
  };
}

export async function loadMobileShiftRequestHistoryPayload<
  TEmployee extends MobileShiftRequestEmployee,
>(
  auth: MobileShiftRequestsContext,
  input: {
    limit?: number;
    cursorCreatedAt?: string;
    cursorId?: string;
  },
  deps: {
    fetchLinkedEmployeeForUser: FetchLinkedEmployeeForUser<TEmployee>;
    fetchMobileShiftRequestHistory: FetchMobileShiftRequestHistory;
  },
): Promise<MobileShiftRequestHistoryResponse> {
  const linkedEmployee = await deps.fetchLinkedEmployeeForUser(
    auth.serviceClient,
    auth.currentOrg.id,
    auth.user.id,
  );
  const canViewAllRequests =
    auth.permissions.canApproveShiftRequests ||
    auth.permissions.canEditShifts ||
    auth.permissions.canManageEmployees;

  if (!canViewAllRequests && !linkedEmployee) {
    return { requests: [], nextCursor: null };
  }

  return deps.fetchMobileShiftRequestHistory(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    ...(!canViewAllRequests && linkedEmployee ? { employeeId: linkedEmployee.id } : {}),
    limit: input.limit ?? 25,
    ...(input.cursorCreatedAt && input.cursorId
      ? { cursor: { createdAt: input.cursorCreatedAt, id: input.cursorId } }
      : {}),
  });
}

export async function createMobileShiftRequest(
  auth: MobileShiftRequestsContext,
  data: MobileCreateShiftRequestBody,
  deps: {
    dispatchNotificationEvent: DispatchShiftRequestNotificationEvent;
  },
): Promise<{ requestId: string }> {
  const { data: requestId, error } = await auth.userClient.rpc("create_shift_request", {
    p_org_id: auth.currentOrg.id,
    p_type: data.type,
    p_requester_emp_id: data.requesterEmpId,
    p_requester_shift_date: data.requesterShiftDate,
    p_target_emp_id: data.targetEmpId ?? null,
    p_target_shift_date: data.targetShiftDate ?? null,
    p_absence_type_id: data.absenceTypeId ?? null,
    p_requester_segment_index: data.requesterSegmentIndex ?? null,
    p_target_segment_index: data.targetSegmentIndex ?? null,
  });

  if (error || !requestId) {
    throw error ?? new Error("Unable to create shift request");
  }

  await deps.dispatchNotificationEvent(auth.user.id, {
    action: "shift_request_created",
    orgId: auth.currentOrg.id,
    requestId: requestId as string,
    requestType: data.type,
  });

  return {
    requestId: requestId as string,
  };
}

export async function updateMobileShiftRequest(
  auth: MobileShiftRequestsContext,
  requestId: string,
  data: MobileUpdateShiftRequestBody,
  deps: {
    dispatchNotificationEvent: DispatchShiftRequestNotificationEvent;
  },
): Promise<void> {
  switch (data.action) {
    case "claim": {
      const { error } = await auth.userClient.rpc("claim_shift_request", {
        p_request_id: requestId,
        p_claimer_emp_id: data.claimerEmpId,
      });
      if (error) {
        throw error;
      }

      await deps.dispatchNotificationEvent(auth.user.id, {
        action: "shift_request_claimed",
        orgId: auth.currentOrg.id,
        requestId,
        requestType: "pickup",
      });
      return;
    }

    case "respond": {
      const { error } = await auth.userClient.rpc("respond_to_shift_request", {
        p_request_id: requestId,
        p_emp_id: data.empId,
        p_accept: data.accept,
      });
      if (error) {
        throw error;
      }

      const { data: requestRow } = await auth.serviceClient
        .from("shift_requests")
        .select("type")
        .eq("id", requestId)
        .single();

      await deps.dispatchNotificationEvent(auth.user.id, {
        action: "shift_request_responded",
        orgId: auth.currentOrg.id,
        requestId,
        requestType: (requestRow?.type as "pickup" | "swap" | "calloff" | undefined) ?? "swap",
        accepted: data.accept,
      });
      return;
    }

    case "resolve": {
      const { error } = await auth.userClient.rpc("resolve_shift_request", {
        p_request_id: requestId,
        p_approved: data.approved,
        p_note: data.note ?? null,
      });
      if (error) {
        throw error;
      }

      const { data: requestRow } = await auth.serviceClient
        .from("shift_requests")
        .select("type")
        .eq("id", requestId)
        .single();

      await deps.dispatchNotificationEvent(auth.user.id, {
        action: "shift_request_resolved",
        orgId: auth.currentOrg.id,
        requestId,
        requestType: (requestRow?.type as "pickup" | "swap" | "calloff" | undefined) ?? "pickup",
        approved: data.approved,
        ...(data.note !== undefined ? { adminNote: data.note } : {}),
      });
      return;
    }

    case "cancel": {
      const { error } = await auth.userClient.rpc("cancel_shift_request", {
        p_request_id: requestId,
        p_emp_id: data.empId,
      });
      if (error) {
        throw error;
      }
      return;
    }

    case "volunteer_open_shift": {
      if (data.state.kind !== "worked" || data.state.segments.length === 0) {
        throw new Error("Open-shift volunteering requires a worked assignment");
      }

      const { data: createdRequestId, error } = await auth.userClient.rpc(
        "volunteer_for_open_shift",
        {
          p_org_id: auth.currentOrg.id,
          p_emp_id: data.empId,
          p_shift_date: data.shiftDate,
          p_shift_ids: data.state.segments.map((segment) => segment.shiftId),
          p_job_ids: data.state.segments.map((segment) => segment.jobId),
          p_is_mentored_flags: data.state.segments.map((segment) => segment.isMentored ?? false),
          p_focus_area_id: data.focusAreaId,
          p_custom_start_time: data.state.customStartTime ?? null,
          p_custom_end_time: data.state.customEndTime ?? null,
        },
      );
      if (error || !createdRequestId) {
        throw error ?? new Error("Unable to volunteer");
      }

      await deps.dispatchNotificationEvent(auth.user.id, {
        action: "shift_request_created",
        orgId: auth.currentOrg.id,
        requestId: createdRequestId as string,
        requestType: "pickup",
      });
    }
  }
}
