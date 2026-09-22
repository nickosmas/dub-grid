import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMobileShiftRequest,
  updateMobileShiftRequest,
  type MobileShiftRequestSettlement,
  type MobileShiftRequestsContext,
} from "./shift-requests";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const EMP_ID = "22222222-2222-4222-8222-222222222222";

function makeContext(rpcResult: unknown = { data: REQUEST_ID, error: null }) {
  const rpc = vi.fn(async () => rpcResult);
  const single = vi.fn(async () => ({ data: { type: "swap" }, error: null }));
  const serviceClient = {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) })),
  } as unknown as SupabaseClient;
  const auth: MobileShiftRequestsContext = {
    currentOrg: { id: "org-1" },
    permissions: {
      canEditShifts: false,
      canManageEmployees: false,
      canApproveShiftRequests: false,
    },
    serviceClient,
    user: { id: "actor-user" },
    userClient: { rpc } as unknown as SupabaseClient,
  };
  return { auth, rpc };
}

function makeDeps(settlement: MobileShiftRequestSettlement) {
  return {
    dispatchNotificationEvent: vi.fn(async () => undefined),
    settleShiftRequestAfterTransition: vi.fn(async () => settlement),
  };
}

describe("createMobileShiftRequest", () => {
  it("reports the approval and tells the other party when an approver settled it", async () => {
    const { auth } = makeContext();
    const deps = makeDeps({
      autoApproved: true,
      approverUserId: "actor-user",
      adminNote: "Auto-approved: Jane Doe can approve shift requests",
    });

    const result = await createMobileShiftRequest(
      auth,
      {
        type: "calloff",
        requesterEmpId: EMP_ID,
        requesterShiftDate: "2031-04-14",
        absenceTypeId: 1,
      },
      deps,
    );

    expect(result).toEqual({ requestId: REQUEST_ID, autoApproved: true });
    expect(deps.settleShiftRequestAfterTransition).toHaveBeenCalledWith({
      userClient: auth.userClient,
      serviceClient: auth.serviceClient,
      requestId: REQUEST_ID,
    });
    expect(deps.dispatchNotificationEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchNotificationEvent).toHaveBeenCalledWith("actor-user", {
      action: "shift_request_resolved",
      orgId: "org-1",
      requestId: REQUEST_ID,
      requestType: "calloff",
      approved: true,
      adminNote: "Auto-approved: Jane Doe can approve shift requests",
      autoApproved: true,
    });
  });

  it("keeps the ordinary approver notification when nothing settled", async () => {
    const { auth } = makeContext();
    const deps = makeDeps({ autoApproved: false, reason: "no_approver" });

    const result = await createMobileShiftRequest(
      auth,
      {
        type: "calloff",
        requesterEmpId: EMP_ID,
        requesterShiftDate: "2031-04-14",
        absenceTypeId: 1,
      },
      deps,
    );

    expect(result).toEqual({ requestId: REQUEST_ID, autoApproved: false });
    expect(deps.dispatchNotificationEvent).toHaveBeenCalledWith(
      "actor-user",
      expect.objectContaining({ action: "shift_request_created", requestType: "calloff" }),
    );
  });
});

describe("updateMobileShiftRequest", () => {
  it("settles a claim the same way", async () => {
    const { auth, rpc } = makeContext({ data: null, error: null });
    const deps = makeDeps({ autoApproved: true, approverUserId: "u", adminNote: "n" });

    await expect(
      updateMobileShiftRequest(auth, REQUEST_ID, { action: "claim", claimerEmpId: EMP_ID }, deps),
    ).resolves.toEqual({ autoApproved: true });
    expect(rpc).toHaveBeenCalledWith("claim_shift_request", {
      p_request_id: REQUEST_ID,
      p_claimer_emp_id: EMP_ID,
    });
    expect(deps.dispatchNotificationEvent).toHaveBeenCalledWith(
      "actor-user",
      expect.objectContaining({ action: "shift_request_resolved", autoApproved: true }),
    );
  });

  it("never tries to settle a declined response", async () => {
    const { auth } = makeContext({ data: null, error: null });
    const deps = makeDeps({ autoApproved: false, reason: "not_pending" });

    await expect(
      updateMobileShiftRequest(
        auth,
        REQUEST_ID,
        { action: "respond", empId: EMP_ID, accept: false },
        deps,
      ),
    ).resolves.toEqual({ autoApproved: false });
    expect(deps.settleShiftRequestAfterTransition).not.toHaveBeenCalled();
    expect(deps.dispatchNotificationEvent).toHaveBeenCalledWith(
      "actor-user",
      expect.objectContaining({ action: "shift_request_responded", accepted: false }),
    );
  });

  it("settles an accepted response with the request's real type", async () => {
    const { auth } = makeContext({ data: null, error: null });
    const deps = makeDeps({ autoApproved: true, approverUserId: "u", adminNote: "n" });

    await expect(
      updateMobileShiftRequest(
        auth,
        REQUEST_ID,
        { action: "respond", empId: EMP_ID, accept: true },
        deps,
      ),
    ).resolves.toEqual({ autoApproved: true });
    expect(deps.dispatchNotificationEvent).toHaveBeenCalledWith(
      "actor-user",
      expect.objectContaining({ action: "shift_request_resolved", requestType: "swap" }),
    );
  });

  it("reports a manual decision as not auto-approved", async () => {
    const { auth } = makeContext({ data: null, error: null });
    const deps = makeDeps({ autoApproved: false, reason: "not_pending" });

    await expect(
      updateMobileShiftRequest(auth, REQUEST_ID, { action: "resolve", approved: true }, deps),
    ).resolves.toEqual({ autoApproved: false });
    expect(deps.settleShiftRequestAfterTransition).not.toHaveBeenCalled();
  });
});
