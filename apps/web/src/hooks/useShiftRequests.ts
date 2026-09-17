import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIsoDateInTimeZone, resolveActiveShiftRequests } from "@dubgrid/schedule-core";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import {
  createBrowserRealtimeChannel,
  removeBrowserRealtimeChannel,
} from "@/features/account/client";
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

export interface ShiftRequestsData {
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
  cancel: (requestId: string, empId: string) => Promise<boolean>;
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
): ShiftRequestsData {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;

  // Stabilize the Map reference: serialize to a string key so useCallback
  // doesn't get a new identity every render (Map is compared by reference).
  const assignmentLabelMapKey = useMemo(
    () => JSON.stringify([...assignmentLabelMap.entries()].sort((a, b) => a[0] - b[0])),
    [assignmentLabelMap],
  );
  const assignmentLabelMapRef = useRef(assignmentLabelMap);
  assignmentLabelMapRef.current = assignmentLabelMap;
  const dateRangeStart = dateRange?.startDate ?? null;
  const dateRangeEnd = dateRange?.endDate ?? null;

  const fetchRequests = useCallback(async () => {
    if (!orgId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await fetchShiftRequests(orgId, assignmentLabelMapRef.current, {
        status: ["open", "pending_approval"] as ShiftRequestStatus[],
        ...(dateRangeStart && dateRangeEnd
          ? { startDate: dateRangeStart, endDate: dateRangeEnd }
          : {}),
      });
      if (orgIdRef.current === orgId) {
        setRequests(data);
      }
    } catch (err: unknown) {
      const msg = errMsg(err, "We couldn't fetch shift requests. Try again.");
      Sentry.captureException(err);
      if (orgIdRef.current === orgId) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
    // assignmentLabelMapKey is intentional: stabilization proxy for Map reference (read via assignmentLabelMapRef.current)
  }, [orgId, assignmentLabelMapKey, dateRangeStart, dateRangeEnd]);

  // Initial fetch
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime subscription — keyed on orgId only. Uses fetchRequestsRef
  // so the channel callback always has the latest fetch function without
  // causing channel teardown/recreate on every assignmentLabelMap change.
  const fetchRequestsRef = useRef(fetchRequests);
  fetchRequestsRef.current = fetchRequests;

  useEffect(() => {
    if (!orgId) return;

    let hadError = false;

    const channel = createBrowserRealtimeChannel(`shift_requests_${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shift_requests",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          fetchRequestsRef.current();
        },
      )
      .subscribe((status: string, err?: Error) => {
        if (status === "SUBSCRIBED" && hadError) {
          hadError = false;
          fetchRequestsRef.current();
        } else if (status === "CHANNEL_ERROR") {
          hadError = true;
          Sentry.captureException(err ?? new Error("shift_requests channel error"));
        }
      });

    return () => {
      void removeBrowserRealtimeChannel(channel);
    };
  }, [orgId]);

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

  const refetchAfterMutation = useCallback(async () => {
    try {
      await fetchRequestsRef.current();
    } catch (err) {
      Sentry.captureException(err);
    }
  }, []);

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

  // Badge count: for employees = swap proposals directed at them (open status);
  // for admins = pending_approval count
  const badgeCount = useMemo(() => {
    const myPendingTargetedRequests = currentEmpId
      ? activeRequests.filter(
          (r) =>
            (r.type === "swap" || (r.type === "pickup" && r.targetEmpId != null)) &&
            r.status === "open" &&
            r.targetEmpId === currentEmpId,
        ).length
      : 0;
    return myPendingTargetedRequests + (canApprove ? pendingApproval.length : 0);
  }, [activeRequests, currentEmpId, canApprove, pendingApproval]);

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
        const id = await createShiftRequest(
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
        toast.success(
          type === "calloff"
            ? "Calloff submitted for approval"
            : type === "pickup"
              ? targetEmpId
                ? "Pickup request sent"
                : "Shift posted as available"
              : "Swap request sent",
        );
        // The server route already dispatches shift_request_created via
        // dispatchNotificationEvent; queuing it again here double-sent every
        // request's notification.
        await refetchAfterMutation();
        return id;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't create request. Try again."));
        return null;
      }
    },
    [orgId, refetchAfterMutation],
  );

  const claim = useCallback(
    async (requestId: string, claimerEmpId: string): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await claimShiftRequest(requestId, claimerEmpId, orgId);
        toast.success("Shift claimed. Awaiting admin approval.");
        // Server route already dispatches shift_request_claimed.
        await refetchAfterMutation();
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't claim shift. Try again."));
        return false;
      }
    },
    [orgId, refetchAfterMutation],
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
        const id = await volunteerForOpenShift(orgId, empId, shiftDate, input, focusAreaId);
        toast.success("Volunteered for shift. Awaiting admin approval.");
        // Server route already dispatches shift_request_created.
        await refetchAfterMutation();
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't volunteer for shift. Try again."));
        return false;
      }
    },
    [orgId, refetchAfterMutation],
  );

  const respond = useCallback(
    async (requestId: string, empId: string, accept: boolean): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await respondToShiftRequest(requestId, empId, accept, orgId);
        toast.success(accept ? "Swap accepted, awaiting admin approval" : "Swap declined");
        await refetchAfterMutation();
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "We couldn't respond. Try again."));
        return false;
      }
    },
    [orgId, refetchAfterMutation],
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
    async (requestId: string, empId: string): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await cancelShiftRequest(requestId, empId, orgId);
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
