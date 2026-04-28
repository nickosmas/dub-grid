import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queueNotification } from "@/lib/notify";
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
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return (err as { message: string }).message;
  return fallback;
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
    absenceTypeId?: number
  ) => Promise<string | null>;
  /** Claim an open pickup request. */
  claim: (requestId: string, claimerEmpId: string) => Promise<boolean>;
  /** Accept or decline a swap proposal. */
  respond: (
    requestId: string,
    empId: string,
    accept: boolean
  ) => Promise<boolean>;
  /** Admin: approve or reject a pending request. */
  resolve: (
    requestId: string,
    approved: boolean,
    note?: string
  ) => Promise<boolean>;
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
  canApprove: boolean
): ShiftRequestsData {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;
  const requestsRef = useRef(requests);
  requestsRef.current = requests;

  // Stabilize the Map reference: serialize to a string key so useCallback
  // doesn't get a new identity every render (Map is compared by reference).
  const assignmentLabelMapKey = useMemo(
    () => JSON.stringify([...assignmentLabelMap.entries()].sort((a, b) => a[0] - b[0])),
    [assignmentLabelMap],
  );
  const assignmentLabelMapRef = useRef(assignmentLabelMap);
  assignmentLabelMapRef.current = assignmentLabelMap;

  const fetchRequests = useCallback(async () => {
    if (!orgId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await fetchShiftRequests(orgId, assignmentLabelMapRef.current, {
        status: [
          "open",
          "pending_approval",
        ] as ShiftRequestStatus[],
      });
      if (orgIdRef.current === orgId) {
        setRequests(data);
      }
    } catch (err: unknown) {
      const msg = errMsg(err, "Failed to fetch shift requests");
      Sentry.captureException(err);
      if (orgIdRef.current === orgId) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  // assignmentLabelMapKey is intentional: stabilization proxy for Map reference (read via assignmentLabelMapRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, assignmentLabelMapKey]);

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
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'SUBSCRIBED' && hadError) {
          hadError = false;
          fetchRequestsRef.current();
        } else if (status === 'CHANNEL_ERROR') {
          hadError = true;
          Sentry.captureException(err ?? new Error('shift_requests channel error'));
        }
      });

    return () => {
      void removeBrowserRealtimeChannel(channel);
    };
  }, [orgId]);

  useEffect(() => {
    const expiryTimes = requests
      .filter(
        (r) =>
          !["expired", "cancelled", "approved", "rejected"].includes(r.status),
      )
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

  // Filter expired at read time: must be a non-terminal status AND not past expiry.
  // Memoized so consumers get a stable array reference when the underlying data hasn't changed.
  const activeRequests = useMemo(
    () => {
      const nowIso = new Date(now).toISOString();
      return requests.filter(
        (r) =>
          !["expired", "cancelled", "approved", "rejected"].includes(r.status) &&
          r.expiresAt > nowIso,
      );
    },
    [requests, now],
  );

  // BUG 1.13: Filter out user's own pickup requests from available shifts tab
  const openPickups = useMemo(
    () => activeRequests.filter(
      (r) => r.type === "pickup" && r.status === "open" && r.requesterEmpId !== currentEmpId
    ),
    [activeRequests, currentEmpId],
  );

  const myRequests = useMemo(
    () => currentEmpId
      ? activeRequests.filter(
          (r) =>
            r.requesterEmpId === currentEmpId ||
            r.targetEmpId === currentEmpId
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
    const myPendingSwaps = currentEmpId
      ? activeRequests.filter(
          (r) =>
            r.type === "swap" &&
            r.status === "open" &&
            r.targetEmpId === currentEmpId
        ).length
      : 0;
    return myPendingSwaps + (canApprove ? pendingApproval.length : 0);
  }, [activeRequests, currentEmpId, canApprove, pendingApproval]);

  const create = useCallback(
    async (
      type: ShiftRequestType,
      requesterEmpId: string,
      requesterShiftDate: string,
      targetEmpId?: string,
      targetShiftDate?: string,
      absenceTypeId?: number
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
          absenceTypeId
        );
        toast.success(
          type === "calloff"
            ? "Calloff submitted for approval"
            : type === "pickup"
              ? "Shift posted as available"
              : "Swap request sent"
        );
        if (id) {
          queueNotification({
            action: "shift_request_created",
            orgId,
            requestId: id,
            requestType: type,
          });
        }
        return id;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to create request"));
        return null;
      }
    },
    [orgId]
  );

  const claim = useCallback(
    async (requestId: string, claimerEmpId: string): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await claimShiftRequest(requestId, claimerEmpId, orgId);
        toast.success("Shift claimed — awaiting admin approval");
        queueNotification({
          action: "shift_request_claimed",
          orgId,
          requestId,
          requestType: "pickup",
        });
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to claim shift"));
        return false;
      }
    },
    [orgId]
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
        const id = await volunteerForOpenShift(
          orgId,
          empId,
          shiftDate,
          input,
          focusAreaId,
        );
        toast.success("Volunteered for shift — awaiting admin approval");
        if (id) {
          queueNotification({
            action: "shift_request_created",
            orgId,
            requestId: id,
            requestType: "pickup",
          });
        }
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to volunteer for shift"));
        return false;
      }
    },
    [orgId]
  );

  const respond = useCallback(
    async (
      requestId: string,
      empId: string,
      accept: boolean
    ): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await respondToShiftRequest(requestId, empId, accept, orgId);
        toast.success(
          accept
            ? "Swap accepted — awaiting admin approval"
            : "Swap declined"
        );
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to respond"));
        return false;
      }
    },
    []
  );

  const resolve = useCallback(
    async (
      requestId: string,
      approved: boolean,
      note?: string
    ): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await resolveShiftRequest(requestId, approved, note, orgId);
        toast.success(approved ? "Request approved" : "Request rejected");
        // Find the request to get its type for the notification
        const request = requestsRef.current.find((r) => r.id === requestId);
        queueNotification({
          action: "shift_request_resolved",
          orgId,
          requestId,
          requestType: request?.type ?? "pickup",
          approved,
          adminNote: note,
        });
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to resolve request"));
        return false;
      }
    },
    [orgId]
  );

  const cancel = useCallback(
    async (requestId: string, empId: string): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await cancelShiftRequest(requestId, empId, orgId);
        toast.success("Request cancelled");
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to cancel"));
        return false;
      }
    },
    [orgId]
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
