import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
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
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;

  const fetchRequests = useCallback(async () => {
    if (!orgId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      const data = await db.fetchShiftRequests(orgId, shiftCodeMap, {
        status: [
          "open",
          "pending_approval",
        ] as ShiftRequestStatus[],
      });
      if (orgIdRef.current === orgId) {
        setRequests(data);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : JSON.stringify(err);
      console.error("Failed to fetch shift requests:", msg);
    } finally {
      setLoading(false);
    }
  }, [orgId, shiftCodeMap]);

  // Initial fetch
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;

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
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchRequests]);

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
        const id = await db.createShiftRequest(
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
        await db.claimShiftRequest(requestId, claimerEmpId);
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
        await db.respondToShiftRequest(requestId, empId, accept);
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
        await db.resolveShiftRequest(requestId, approved, note);
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
        await db.cancelShiftRequest(requestId, empId);
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
    refetch: fetchRequests,
    create,
    claim,
    respond,
    resolve,
    cancel,
  };
}
