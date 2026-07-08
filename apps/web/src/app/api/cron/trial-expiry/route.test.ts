import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchNotificationEvent = vi.fn();
const endingSoonQuery = vi.fn();
const expiredQuery = vi.fn();

vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

// Track which query is being built across .from() calls. The route's first
// .from("organizations") build is the ending-soon query (uses .gte/.lt); the
// second is the expired query (uses .lt/.in). We dispatch the terminating
// .is().is() resolution to the right mock based on whether .in() was called.
let fromCallIndex = 0;
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const myIndex = fromCallIndex++;
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.gte = vi.fn(() => builder);
      builder.lt = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      builder.is = vi.fn(() => {
        const inner: Record<string, unknown> = {};
        inner.is = vi.fn(() => (myIndex === 0 ? endingSoonQuery() : expiredQuery()));
        return inner;
      });
      return builder;
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from "./route";

const SECRET = "test-cron-secret";

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/trial-expiry", { headers });
}

describe("GET /api/cron/trial-expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallIndex = 0;
    process.env.CRON_SECRET = SECRET;
    dispatchNotificationEvent.mockResolvedValue({ success: true });
    endingSoonQuery.mockResolvedValue({ data: [], error: null });
    expiredQuery.mockResolvedValue({ data: [], error: null });
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("rejects requests without the matching bearer token", async () => {
    const res = await GET(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("rejects requests with no Authorization header", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("dispatches billing_trial_ending_soon for each org returned by the ending-soon query", async () => {
    endingSoonQuery.mockResolvedValueOnce({
      data: [
        { id: "org-a", trial_ends_at: "2026-06-11T00:00:00Z" },
        { id: "org-b", trial_ends_at: "2026-06-11T00:00:00Z" },
      ],
      error: null,
    });
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "trial-expiry-cron",
      expect.objectContaining({
        action: "billing_trial_ending_soon",
        orgId: "org-a",
      }),
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "trial-expiry-cron",
      expect.objectContaining({
        action: "billing_trial_ending_soon",
        orgId: "org-b",
      }),
    );
  });

  it("dispatches billing_trial_expired for orgs whose trial expired with no paid status", async () => {
    expiredQuery.mockResolvedValueOnce({
      data: [
        {
          id: "org-c",
          trial_ends_at: "2026-06-05T00:00:00Z",
          subscription_status: "trialing",
        },
      ],
      error: null,
    });
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "trial-expiry-cron",
      expect.objectContaining({
        action: "billing_trial_expired",
        orgId: "org-c",
        trialEndsAt: "2026-06-05T00:00:00Z",
      }),
    );
  });

  it("returns counts in the response body", async () => {
    endingSoonQuery.mockResolvedValueOnce({
      data: [{ id: "org-a", trial_ends_at: "2026-06-11T00:00:00Z" }],
      error: null,
    });
    expiredQuery.mockResolvedValueOnce({
      data: [
        {
          id: "org-c",
          trial_ends_at: "2026-06-05T00:00:00Z",
          subscription_status: "trialing",
        },
      ],
      error: null,
    });
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    await expect(res.json()).resolves.toEqual({
      ok: true,
      endingSoonDispatched: 1,
      expiredDispatched: 1,
    });
  });
});
