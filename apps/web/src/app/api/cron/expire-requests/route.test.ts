import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchNotificationEvent = vi.fn();
const shiftRequestsSelect = vi.fn();
const shiftRequestsUpdate = vi.fn();
const invitationsSelect = vi.fn();

vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

let fromCallIndex = 0;
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      // Two terminal patterns:
      //   - SELECT chain: .select().lt().in()/.is().is().limit()
      //   - UPDATE chain: .update().eq().in() → resolves directly
      if (table === "shift_requests") {
        const myIndex = fromCallIndex++;
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.update = vi.fn(() => ({
          eq: () => ({
            in: () => shiftRequestsUpdate(),
          }),
        }));
        builder.lt = vi.fn(() => builder);
        builder.in = vi.fn(() => builder);
        builder.limit = vi.fn(() => (myIndex === 0 ? shiftRequestsSelect() : { data: [] }));
        return builder;
      }
      if (table === "invitations") {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.lt = vi.fn(() => builder);
        builder.is = vi.fn(() => builder);
        builder.limit = vi.fn(() => invitationsSelect());
        return builder;
      }
      return { select: vi.fn(), update: vi.fn() };
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const isFeatureEnabled = vi.fn(async (_key: string) => true);
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (key: string) => isFeatureEnabled(key),
}));

import { GET } from "./route";

const SECRET = "test-cron-secret";

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/expire-requests", {
    headers,
  });
}

describe("GET /api/cron/expire-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallIndex = 0;
    process.env.CRON_SECRET = SECRET;
    isFeatureEnabled.mockResolvedValue(true);
    dispatchNotificationEvent.mockResolvedValue({ success: true });
    shiftRequestsSelect.mockResolvedValue({ data: [], error: null });
    shiftRequestsUpdate.mockResolvedValue({ error: null });
    invitationsSelect.mockResolvedValue({ data: [], error: null });
  });

  it("rejects requests without the bearer token", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 503 when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
  });

  it("returns 200 skipped (not 503) when intentionally disabled via kill switch", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, skipped: true, reason: "disabled" });
  });

  it("marks stale shift_requests expired and dispatches per row", async () => {
    shiftRequestsSelect.mockResolvedValueOnce({
      data: [
        { id: "req-a", org_id: "org-1", type: "pickup" },
        { id: "req-b", org_id: "org-1", type: "swap" },
      ],
      error: null,
    });

    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(shiftRequestsUpdate).toHaveBeenCalledTimes(2);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "expire-requests-cron",
      expect.objectContaining({
        action: "shift_request_expired",
        orgId: "org-1",
        requestId: "req-a",
        requestType: "pickup",
      }),
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "expire-requests-cron",
      expect.objectContaining({
        action: "shift_request_expired",
        requestId: "req-b",
        requestType: "swap",
      }),
    );
  });

  it("dispatches invitation_expired for stale invitations", async () => {
    invitationsSelect.mockResolvedValueOnce({
      data: [{ id: "inv-x", org_id: "org-1", email: "alex@example.com" }],
      error: null,
    });

    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "expire-requests-cron",
      expect.objectContaining({
        action: "invitation_expired",
        orgId: "org-1",
        invitationId: "inv-x",
        inviteeEmail: "alex@example.com",
      }),
    );
  });

  it("skips shift_requests with unknown types (defensive)", async () => {
    shiftRequestsSelect.mockResolvedValueOnce({
      data: [{ id: "req-bogus", org_id: "org-1", type: "unknown" }],
      error: null,
    });
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    // Update still runs (mark as expired); dispatch is skipped.
    expect(shiftRequestsUpdate).toHaveBeenCalledTimes(1);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("returns counts in the response body", async () => {
    shiftRequestsSelect.mockResolvedValueOnce({
      data: [{ id: "req-a", org_id: "org-1", type: "calloff" }],
      error: null,
    });
    invitationsSelect.mockResolvedValueOnce({
      data: [{ id: "inv-x", org_id: "org-1", email: "x@e.com" }],
      error: null,
    });

    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    await expect(res.json()).resolves.toEqual({
      ok: true,
      shiftRequestsExpired: 1,
      invitationsExpired: 1,
    });
  });
});
