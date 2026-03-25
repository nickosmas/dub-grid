import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchShiftRequests, createShiftRequest, claimShiftRequest, respondToShiftRequest, resolveShiftRequest, cancelShiftRequest } from "@/lib/db";
import { toast } from "sonner";
import type {
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
  /** Create a new pickup or swap request. */
  create: (
    type: ShiftRequestType,
    requesterEmpId: string,
    requesterShiftDate: string,
    targetEmpId?: string,
    targetShiftDate?: string
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
  /** Cancel your own request. */
  cancel: (requestId: string, empId: string) => Promise<boolean>;
}

export function useShiftRequests(
  orgId: string | null,
  shiftCodeMap: Map<number, string>,
  currentEmpId: string | null,
  canApprove: boolean
): ShiftRequestsData {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;

  // Stabilize the Map reference: serialize to a string key so useCallback
  // doesn't get a new identity every render (Map is compared by reference).
  const shiftCodeMapKey = useMemo(
    () => JSON.stringify([...shiftCodeMap.entries()].sort((a, b) => a[0] - b[0])),
    [shiftCodeMap],
  );
  const shiftCodeMapRef = useRef(shiftCodeMap);
  shiftCodeMapRef.current = shiftCodeMap;

  const fetchRequests = useCallback(async () => {
    if (!orgId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await fetchShiftRequests(orgId, shiftCodeMapRef.current, {
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
      console.error("Failed to fetch shift requests:", msg);
      if (orgIdRef.current === orgId) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, shiftCodeMapKey]);

  // Initial fetch
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime subscription — keyed on orgId only. Uses fetchRequestsRef
  // so the channel callback always has the latest fetch function without
  // causing channel teardown/recreate on every shiftCodeMap change.
  const fetchRequestsRef = useRef(fetchRequests);
  fetchRequestsRef.current = fetchRequests;

  useEffect(() => {
    if (!orgId) return;

    let hadError = false;

    const channel = supabase
      .channel(`shift_requests_${orgId}`)
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
          console.warn('[Realtime] shift_requests channel error (auto-retrying):', err ?? 'unknown');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  // Filter expired at read time: must be a non-terminal status AND not past expiry
  const now = new Date().toISOString();
  const activeRequests = requests.filter(
    (r) =>
      !["expired", "cancelled", "approved", "rejected"].includes(r.status) &&
      r.expiresAt > now
  );

  const openPickups = activeRequests.filter(
    (r) => r.type === "pickup" && r.status === "open"
  );

  const myRequests = currentEmpId
    ? activeRequests.filter(
        (r) =>
          r.requesterEmpId === currentEmpId ||
          r.targetEmpId === currentEmpId
      )
    : [];

  const pendingApproval = activeRequests.filter(
    (r) => r.status === "pending_approval"
  );

  // Badge count: for employees = swap proposals directed at them (open status);
  // for admins = pending_approval count
  const myPendingSwaps = currentEmpId
    ? activeRequests.filter(
        (r) =>
          r.type === "swap" &&
          r.status === "open" &&
          r.targetEmpId === currentEmpId
      ).length
    : 0;
  const badgeCount = myPendingSwaps + (canApprove ? pendingApproval.length : 0);

  const create = useCallback(
    async (
      type: ShiftRequestType,
      requesterEmpId: string,
      requesterShiftDate: string,
      targetEmpId?: string,
      targetShiftDate?: string
    ): Promise<string | null> => {
      if (!orgId) return null;
      try {
        const id = await createShiftRequest(
          orgId,
          type,
          requesterEmpId,
          requesterShiftDate,
          targetEmpId,
          targetShiftDate
        );
        toast.success(
          type === "pickup"
            ? "Shift posted as available"
            : "Swap request sent"
        );
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
      try {
        await claimShiftRequest(requestId, claimerEmpId);
        toast.success("Shift claimed — awaiting admin approval");
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to claim shift"));
        return false;
      }
    },
    []
  );

  const respond = useCallback(
    async (
      requestId: string,
      empId: string,
      accept: boolean
    ): Promise<boolean> => {
      try {
        await respondToShiftRequest(requestId, empId, accept);
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
      try {
        await resolveShiftRequest(requestId, approved, note);
        toast.success(approved ? "Request approved" : "Request rejected");
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to resolve request"));
        return false;
      }
    },
    []
  );

  const cancel = useCallback(
    async (requestId: string, empId: string): Promise<boolean> => {
      try {
        await cancelShiftRequest(requestId, empId);
        toast.success("Request cancelled");
        return true;
      } catch (err: unknown) {
        toast.error(errMsg(err, "Failed to cancel"));
        return false;
      }
    },
    []
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
    respond,
    resolve,
    cancel,
  };
}
