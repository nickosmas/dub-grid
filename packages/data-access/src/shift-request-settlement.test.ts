import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { settleShiftRequestAfterTransition } from "./shift-request-settlement";

function makeClients(
  status: string | null,
  rpcResult: { data: unknown; error: { message: string } | null },
) {
  const rpc = vi.fn(async () => rpcResult);
  const maybeSingle = vi.fn(async () => ({ data: status ? { status } : null, error: null }));
  const serviceClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    })),
  } as unknown as SupabaseClient;
  const userClient = { rpc } as unknown as SupabaseClient;
  return { serviceClient, userClient, rpc };
}

describe("settleShiftRequestAfterTransition", () => {
  it("does nothing when told to skip", async () => {
    const { serviceClient, userClient, rpc } = makeClients("pending_approval", {
      data: null,
      error: null,
    });
    await expect(
      settleShiftRequestAfterTransition({ userClient, serviceClient, requestId: "r1", skip: true }),
    ).resolves.toEqual({ autoApproved: false, reason: "skipped" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not call the database for a request that is not pending approval", async () => {
    const { serviceClient, userClient, rpc } = makeClients("open", { data: null, error: null });
    await expect(
      settleShiftRequestAfterTransition({ userClient, serviceClient, requestId: "r1" }),
    ).resolves.toEqual({ autoApproved: false, reason: "not_pending" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports no approver when the RPC returns null", async () => {
    const { serviceClient, userClient, rpc } = makeClients("pending_approval", {
      data: null,
      error: null,
    });
    await expect(
      settleShiftRequestAfterTransition({ userClient, serviceClient, requestId: "r1" }),
    ).resolves.toEqual({ autoApproved: false, reason: "no_approver" });
    expect(rpc).toHaveBeenCalledWith("auto_approve_shift_request", { p_request_id: "r1" });
  });

  it("swallows an RPC error so the request stays in the queue", async () => {
    const { serviceClient, userClient } = makeClients("pending_approval", {
      data: null,
      error: { message: "Cannot approve: overlap" },
    });
    await expect(
      settleShiftRequestAfterTransition({ userClient, serviceClient, requestId: "r1" }),
    ).resolves.toEqual({
      autoApproved: false,
      reason: "error",
      error: "Cannot approve: overlap",
    });
  });

  it("returns the approver and note when the request was approved", async () => {
    const { serviceClient, userClient } = makeClients("pending_approval", {
      data: {
        approverUserId: "u-1",
        adminNote: "Auto-approved: Jane Doe can approve shift requests",
      },
      error: null,
    });
    await expect(
      settleShiftRequestAfterTransition({ userClient, serviceClient, requestId: "r1" }),
    ).resolves.toEqual({
      autoApproved: true,
      approverUserId: "u-1",
      adminNote: "Auto-approved: Jane Doe can approve shift requests",
    });
  });
});
