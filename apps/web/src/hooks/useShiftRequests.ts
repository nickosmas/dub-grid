import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { describeShiftRequestSubmitted } from "@dubgrid/domain";
import { getIsoDateInTimeZone, resolveActiveShiftRequests } from "@dubgrid/schedule-core";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { queryKeys } from "@/lib/query-keys";
import {
  cancelShiftRequest,
  claimShiftRequest,
  createShiftRequest,
  fetchShiftRequests,
  resolveShiftRequest,
  respondToShiftRequest,
  volunteerForOpenShift,
} from "@/features/schedule/client";
import type {
  ScheduleCellInput,
  ShiftRequest,
  ShiftRequestType,
  ShiftRequestStatus,
} from "@/types";

/** Extract message from Error or Supabase error objects. */
function errMsg(err: unknown, fallback: string): string {
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : fallback;

  if (/already volunteered for this open shift/i.test(message)) {
    return "You already volunteered for this open shift.";
  }

  return message;
}

export interface ShiftRequestsOptions {
  /**
   * Fetch every status in the window rather than only open and
   * pending-approval ones. `requests` and the derived lists still hold only
   * the active ones; `allRequests` holds everything fetched. The dashboard
   * uses this so its activity feed and its pending-approvals count come from
   * one request instead of two for the same period.
   */
  includeAllStatuses?: boolean;
}

export interface ShiftRequestsData {
  /** Everything the last fetch returned, before any activity filtering. */
  allRequests: ShiftRequest[];
  /** All requests for the org (filtered by active statuses by default). */
  requests: ShiftRequest[];
  /** Open pickup requests available for claiming. */
  openPickups: ShiftRequest[];
  /** Requests involving the current employee (as requester or target). */
  myRequests: ShiftRequest[];
  /** Requests awaiting admin approval. */
  pendingApproval: ShiftRequest[];
  /** Count of actionable items (swap proposals for me + pending approvals for admins). */
  badgeCount: number;
  loading: boolean;
  /** Error message from the last fetch attempt, or null if successful. */
  error: string | null;
  /** Refetch all requests. */
  refetch: () => Promise<void>;
  /** Create a new pickup, swap, or calloff request. */
  create: (
    type: ShiftRequestType,
    requesterEmpId: string,
    requesterShiftDate: string,
    targetEmpId?: string,
    targetShiftDate?: string,
    absenceTypeId?: number,
    requesterSegmentIndex?: number,
    targetSegmentIndex?: number,
  ) => Promise<string | null>;
  /** Claim an open pickup request. */
  claim: (requestId: string, claimerEmpId: string) => Promise<boolean>;
  /** Accept or decline a swap proposal. */
  respond: (requestId: string, empId: string, accept: boolean) => Promise<boolean>;
  /** Admin: approve or reject a pending request. */
  resolve: (requestId: string, approved: boolean, note?: string) => Promise<boolean>;
  /** Volunteer for a coverage-gap open shift. */
  volunteer: (
    empId: string,
    shiftDate: string,
    input: ScheduleCellInput,
    focusAreaId: number,
  ) => Promise<boolean>;
  /** Cancel your own request. */
  cancel: (requestId: string, empId: string, note?: string) => Promise<boolean>;
}

export function useShiftRequests(
  orgId: string | null,
  assignmentLabelMap: Map<number, string>,
  currentEmpId: string | null,
  canApprove: boolean,
  timeZone?: string | null,
  // Optional — omit for the org-wide/unbounded fetch the schedule page needs
  // (a scheduler reviewing requests shouldn't have older ones disappear).
  // The dashboard passes its selected period so Pending Approvals matches
  // mobile's period-scoped behavior instead of showing every open-ended
  // request in the org regardless of the period toggle.
  dateRange?: { startDate: string; endDate: string } | null,
  options?: ShiftRequestsOptions,
): ShiftRequestsData {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const includeAllStatuses = options?.includeAllStatuses === true;

  // Stabilize the Map reference: serialize to a string key so the query key
  // doesn't change identity every render (Map is compared by reference).
  const assignmentLabelMapKey = useMemo(
    () => JSON.stringify([...assignmentLabelMap.entries()].sort((a, b) => a[0] - b[0])),
    [assignmentLabelMap],
  );
  const assignmentLabelMapRef = useRef(assignmentLabelMap);
  assignmentLabelMapRef.current = assignmentLabelMap;
  const dateRangeStart = dateRange?.startDate ?? null;
  const dateRangeEnd = dateRange?.endDate ?? null;

  // Lives in react-query under the org's shiftRequests prefix, which is what
  // the shared org realtime channel (useOrgRealtimeInvalidation, mounted by
  // useOrganizationData) invalidates on every shift_requests row change.
  // This hook used to open its own raw channel per mount on top of that,
  // reintroducing the per-hook-channel problem the shared helper exists to
  // fix (build plan item 29).
  const query = useQuery({
    queryKey: [
      ...queryKeys.shiftRequests.all(orgId ?? "none"),
      dateRangeStart ?? "",
      dateRangeEnd ?? "",
      includeAllStatuses ? "all" : "active",
      assignmentLabelMapKey,
    ],
    queryFn: () =>
      fetchShiftRequests(orgId!, assignmentLabelMapRef.current, {
        ...(includeAllStatuses
          ? {}
          : { status: ["open", "pending_approval"] as ShiftRequestStatus[] }),
        ...(dateRangeStart && dateRangeEnd
          ? { startDate: dateRangeStart, endDate: dateRangeEnd }
          : {}),
      }),
    enabled: Boolean(orgId),
    staleTime: 15_000,
  });

  const requests = useMemo(() => (orgId ? (query.data ?? []) : []), [orgId, query.data]);
  const loading = Boolean(orgId) && query.isPending;
  const error = query.error
    ? errMsg(query.error, "We couldn't fetch shift requests. Try again.")
    : null;

  useEffect(() => {
    if (query.error) Sentry.captureException(query.error);
  }, [query.error]);

  const fetchRequests = useCallback(async () => {
    if (!orgId) return;
    await query.refetch();
  }, [orgId, query]);

  useEffect(() => {
    const expiryTimes = requests
      .filter((r) => !["expired", "cancelled", "approved", "rejected"].includes(r.status))
      .map((r) => Date.parse(r.expiresAt))
      .filter((ms) => ms > Date.now());

    if (expiryTimes.length === 0) return undefined;

    const nextExpiry = Math.min(...expiryTimes);
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, nextExpiry - Date.now() + 50),
    );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [requests]);

  useEffect(() => {
    const todayDate = getIsoDateInTimeZone(new Date(), timeZone);
    const hasSameDayActiveRequest = requests.some((request) => {
      if (["expired", "cancelled", "approved", "rejected"].includes(request.status)) {
        return false;
      }

      return (
        request.requesterShiftDate === todayDate ||
        (request.type === "swap" && request.targetShiftDate === todayDate)
      );
    });

    if (!hasSameDayActiveRequest) {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [requests, timeZone]);

  // Filter expired at read time: must be a non-terminal status AND not past expiry.
  // Memoized so consumers get a stable array reference when the underlying data hasn't changed.
  const activeRequests = useMemo(
    () => resolveActiveShiftRequests(requests, new Date(now), timeZone),
    [requests, now, timeZone],
  );

  // Invalidate the whole org prefix rather than refetch just this query, so
  // a sibling instance (the dashboard's all-status window next to the
  // schedule page's active list) refreshes from the same mutation.
  const refetchAfterMutation = useCallback(async () => {
    if (!orgId) return;
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.shiftRequests.all(orgId) });
    } catch (err) {
      Sentry.captureException(err);
    }
  }, [orgId, queryClient]);

  // Available pickups include public pickup offers plus targeted pickups for me.
  const openPickups = useMemo(
    () =>
      activeRequests.filter(
        (r) =>
          r.type === "pickup" &&
          r.status === "open" &&
          r.requesterEmpId !== currentEmpId &&
          (r.targetEmpId == null || r.targetEmpId === currentEmpId),
      ),
    [activeRequests, currentEmpId],
  );

  const myRequests = useMemo(
    () =>
      currentEmpId
        ? activeRequests.filter(
            (r) => r.requesterEmpId === currentEmpId || r.targetEmpId === currentEmpId,
          )
        : [],
    [activeRequests, currentEmpId],
  );

  const pendingApproval = useMemo(
    () => activeRequests.filter((r) => r.status === "pending_approval"),
    [activeRequests],
  );

  // Badge count: what the board will show you. Approvers see every active
  // request, which is what their Approval Queue tab lists (it used to count
  // only the pending ones, so the badge and the tab disagreed); everyone else
  // sees the requests waiting on their own answer.
  const badgeCount = useMemo(() => {
    if (canApprove) return activeRequests.length;
    if (!currentEmpId) return 0;
    return activeRequests.filter(
      (r) =>
        (r.type === "swap" || (r.type === "pickup" && r.targetEmpId != null)) &&
        r.status === "open" &&
        r.targetEmpId === currentEmpId,
    ).length;
  }, [activeRequests, currentEmpId, canApprove]);

  const showSubmitted = useCallback(
    (submission: Parameters<typeof describeShiftRequestSubmitted>[0], autoApproved: boolean) => {
      const copy = describeShiftRequestSubmitted(submission, {
        autoApproved,
        viewerCanApprove: canApprove,
      });
      toast.success(copy.title, { description: copy.message });
    },
    [canApprove],
  );

  const create = useCallback(
    async (
      type: ShiftRequestType,
      requesterEmpId: string,
      requesterShiftDate: string,
      targetEmpId?: string,
      targetShiftDate?: string,
      absenceTypeId?: number,
      requesterSegmentIndex?: number,
      targetSegmentIndex?: number,
    ): Promise<string | null> => {
      if (!orgId) return null;
      try {
        const { requestId, autoApproved } = await createShiftRequest(
          orgId,
          type,
          requesterEmpId,
          requesterShiftDate,
          targetEmpId,
          targetShiftDate,
          absenceTypeId,
          requesterSegmentIndex,
          targetSegmentIndex,
        );
        showSubmitted({ action: "created", type, targeted: targetEmpId != null }, autoApproved);
        // The server route already dispatches shift_request_created via
        // dispatchNotificationEvent; queuing it again here double-sent every
        // request's notification.
        await refetchAfterMutation();
        return requestId;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't create request. Try again."));
        return null;
      }
    },
    [orgId, refetchAfterMutation, showSubmitted],
  );

  const claim = useCallback(
    async (requestId: string, claimerEmpId: string): Promise<boolean> => {
      if (!orgId) return false;
      try {
        const { autoApproved } = await claimShiftRequest(requestId, claimerEmpId, orgId);
        showSubmitted({ action: "claimed" }, autoApproved);
        // Server route already dispatches shift_request_claimed.
        await refetchAfterMutation();
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't claim shift. Try again."));
        return false;
      }
    },
    [orgId, refetchAfterMutation, showSubmitted],
  );

  const volunteer = useCallback(
    async (
      empId: string,
      shiftDate: string,
      input: ScheduleCellInput,
      focusAreaId: number,
    ): Promise<boolean> => {
      if (!orgId) return false;
      try {
        const { autoApproved } = await volunteerForOpenShift(
          orgId,
          empId,
          shiftDate,
          input,
          focusAreaId,
        );
        showSubmitted({ action: "claimed" }, autoApproved);
        // Server route already dispatches shift_request_created.
        await refetchAfterMutation();
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't volunteer for shift. Try again."));
        return false;
      }
    },
    [orgId, refetchAfterMutation, showSubmitted],
  );

  const respond = useCallback(
    async (requestId: string, empId: string, accept: boolean): Promise<boolean> => {
      if (!orgId) return false;
      try {
        const { autoApproved } = await respondToShiftRequest(requestId, empId, accept, orgId);
        if (accept) {
          showSubmitted({ action: "accepted", type: "swap" }, autoApproved);
        } else {
          toast.success("Swap declined");
        }
        await refetchAfterMutation();
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't respond. Try again."));
        return false;
      }
    },
    [orgId, refetchAfterMutation, showSubmitted],
  );

  const resolve = useCallback(
    async (requestId: string, approved: boolean, note?: string): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await resolveShiftRequest(requestId, approved, note, orgId);
        toast.success(approved ? "Request approved" : "Request rejected");
        // Server route already dispatches shift_request_resolved.
        await refetchAfterMutation();
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't resolve request. Try again."));
        return false;
      }
    },
    [orgId, refetchAfterMutation],
  );

  const cancel = useCallback(
    async (requestId: string, empId: string, note?: string): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await cancelShiftRequest(requestId, empId, orgId, note);
        toast.success("Request cancelled");
        await refetchAfterMutation();
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't cancel. Try again."));
        return false;
      }
    },
    [orgId, refetchAfterMutation],
  );

  return {
    allRequests: requests,
    requests: activeRequests,
    openPickups,
    myRequests,
    pendingApproval,
    badgeCount,
    loading,
    error,
    refetch: fetchRequests,
    create,
    claim,
    volunteer,
    respond,
    resolve,
    cancel,
  };
}
