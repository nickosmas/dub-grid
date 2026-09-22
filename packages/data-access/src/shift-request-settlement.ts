import type { SupabaseClient } from "@supabase/supabase-js";

export type ShiftRequestSettlement =
  | {
      autoApproved: false;
      reason: "skipped" | "not_pending" | "no_approver" | "error";
      error?: string;
    }
  | { autoApproved: true; approverUserId: string; adminNote: string };

export type SettleShiftRequestAfterTransition = (input: {
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  requestId: string;
  skip?: boolean;
}) => Promise<ShiftRequestSettlement>;

/**
 * Runs right after a request enters pending_approval. When an approver is
 * party to it, `auto_approve_shift_request` approves it on their behalf and
 * returns who and with what note. Never throws: any failure leaves the row
 * in the queue exactly as before, and the caller carries on with the
 * ordinary approver notifications.
 */
export const settleShiftRequestAfterTransition: SettleShiftRequestAfterTransition = async ({
  userClient,
  serviceClient,
  requestId,
  skip = false,
}) => {
  if (skip) {
    return { autoApproved: false, reason: "skipped" };
  }

  const { data: row } = await serviceClient
    .from("shift_requests")
    .select("status")
    .eq("id", requestId)
    .maybeSingle();
  if (row?.status !== "pending_approval") {
    return { autoApproved: false, reason: "not_pending" };
  }

  const { data, error } = await userClient.rpc("auto_approve_shift_request", {
    p_request_id: requestId,
  });
  if (error) {
    return { autoApproved: false, reason: "error", error: error.message };
  }

  const result = data as { approverUserId?: unknown; adminNote?: unknown } | null;
  if (
    !result ||
    typeof result.approverUserId !== "string" ||
    typeof result.adminNote !== "string"
  ) {
    return { autoApproved: false, reason: "no_approver" };
  }

  return { autoApproved: true, approverUserId: result.approverUserId, adminNote: result.adminNote };
};
