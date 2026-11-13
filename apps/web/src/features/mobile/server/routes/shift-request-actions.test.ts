import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const updateMobileShiftRequest = vi.fn();
const settleShiftRequestAfterTransition = vi.fn();

vi.mock("@/features/mobile/server", () => ({ requireMobileAuth }));
vi.mock("@dubgrid/mobile-api-core", () => ({
  updateMobileShiftRequest: (...args: unknown[]) => updateMobileShiftRequest(...args),
}));
vi.mock("@dubgrid/data-access", () => ({ settleShiftRequestAfterTransition }));
const dispatchNotificationEventAfterResponse = vi.fn();
vi.mock("@/features/notifications/server", () => ({
  dispatchNotificationEventAfterResponse: (...args: unknown[]) =>
    dispatchNotificationEventAfterResponse(...args),
}));

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const EMP_ID = "22222222-2222-4222-8222-222222222222";

function patchRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/mobile/v1/shift-requests/${REQUEST_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mobile shift-request actions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuth.mockResolvedValue({ user: { id: "actor" }, currentOrg: { id: "org-1" } });
  });

  it("returns the auth failure response unchanged", async () => {
    requireMobileAuth.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });
    const { PATCH } = await import("./shift-request-actions");

    const response = await PATCH(patchRequest({ action: "claim", claimerEmpId: EMP_ID }), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    expect(response.status).toBe(401);
  });

  it("tells the client whether the action settled the request", async () => {
    updateMobileShiftRequest.mockResolvedValueOnce({ autoApproved: true });
    const { PATCH } = await import("./shift-request-actions");

    const response = await PATCH(patchRequest({ action: "claim", claimerEmpId: EMP_ID }), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, autoApproved: true });
    expect(updateMobileShiftRequest).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: "actor" } }),
      REQUEST_ID,
      { action: "claim", claimerEmpId: EMP_ID },
      expect.objectContaining({ settleShiftRequestAfterTransition }),
    );
  });

  it("gives the package a dispatcher that sends the alert after the response", async () => {
    updateMobileShiftRequest.mockResolvedValueOnce({ autoApproved: false });
    const { PATCH } = await import("./shift-request-actions");

    await PATCH(patchRequest({ action: "claim", claimerEmpId: EMP_ID }), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    const deps = updateMobileShiftRequest.mock.calls[0][3] as {
      dispatchNotificationEvent: (actorId: string, event: object) => Promise<unknown>;
    };
    const event = { action: "shift_request_claimed", orgId: "org-1", requestId: REQUEST_ID };
    await deps.dispatchNotificationEvent("actor", event);
    expect(dispatchNotificationEventAfterResponse).toHaveBeenCalledWith("actor", event);
  });

  it("surfaces the rule the caller broke in client copy", async () => {
    updateMobileShiftRequest.mockRejectedValueOnce(
      new Error("You are involved in another active shift request on this date"),
    );
    const { PATCH } = await import("./shift-request-actions");

    const response = await PATCH(patchRequest({ action: "claim", claimerEmpId: EMP_ID }), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "You already have an active request for that date.",
    });
  });
});
