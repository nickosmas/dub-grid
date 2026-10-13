import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatchNotificationEvent = vi.fn();
const endingSoonQuery = vi.fn();
const expiredQuery = vi.fn();
const overdueQuery = vi.fn();
const endingSoonEq = vi.fn();

vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

// Track which query is being built across .from() calls. The route's first
// .from("organizations") build is the ending-soon query (uses .gte/.lt); the
// second is the expired query (uses .lt/.in). Awaiting the builder resolves
// to the matching mock.
let fromCallIndex = 0;
const isFilter = vi.fn();
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const myIndex = fromCallIndex++;
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.gte = vi.fn(() => builder);
      builder.lt = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      builder.eq = vi.fn((column: string, value: unknown) => {
        if (myIndex === 0) endingSoonEq(column, value);
        return builder;
      });
      builder.is = vi.fn((column: string, value: unknown) => {
        isFilter(myIndex, column, value);
        return builder;
      });
      builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve([endingSoonQuery, expiredQuery, overdueQuery][myIndex]()).then(
          resolve,
          reject,
        );
      return builder;
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

vi.mock("@/lib/billing-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing-policy")>();
  const { DEFAULT_BILLING_POLICY } = await import("@dubgrid/domain");
  return { ...actual, getPlatformBillingPolicy: async () => DEFAULT_BILLING_POLICY };
});

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
    isFeatureEnabled.mockResolvedValue(true);
    dispatchNotificationEvent.mockResolvedValue({ success: true });
    endingSoonQuery.mockResolvedValue({ data: [], error: null });
    expiredQuery.mockResolvedValue({ data: [], error: null });
    overdueQuery.mockResolvedValue({ data: [], error: null });
    // Fixtures end on 2026-06-11: the first day of a 7-day reminder window.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-04T14:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("returns 200 skipped (not 503) when intentionally disabled via kill switch", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, skipped: true, reason: "disabled" });
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

  it("reminds each organization on its own reminder window", async () => {
    endingSoonQuery.mockResolvedValueOnce({
      data: [
        { id: "org-default", trial_ends_at: "2026-06-11T00:00:00Z" },
        { id: "org-short", trial_ends_at: "2026-06-07T00:00:00Z", trial_reminder_days_override: 3 },
        {
          id: "org-short-later",
          trial_ends_at: "2026-06-11T00:00:00Z",
          trial_reminder_days_override: 3,
        },
        { id: "org-not-yet", trial_ends_at: "2026-06-13T00:00:00Z" },
      ],
      error: null,
    });

    await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

    const reminded = dispatchNotificationEvent.mock.calls
      .map(([, event]) => event as { action: string; orgId: string; periodKey?: string })
      .filter((event) => event.action === "billing_trial_ending_soon");
    expect(reminded).toEqual([
      expect.objectContaining({ orgId: "org-default", periodKey: "2026-06-11" }),
      expect.objectContaining({ orgId: "org-short", periodKey: "2026-06-07" }),
    ]);
  });

  it("reminds only organizations still on their trial", async () => {
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    expect(endingSoonEq).toHaveBeenCalledWith("subscription_status", "trialing");
  });

  it("skips paused organizations in both passes", async () => {
    await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

    expect(isFilter).toHaveBeenCalledWith(0, "billing_paused_at", null);
    expect(isFilter).toHaveBeenCalledWith(1, "billing_paused_at", null);
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
      lockedDispatched: 0,
    });
  });

  describe("lock alerts", () => {
    // now = 2026-06-04T14:00Z
    const locked = (orgId: string, reason: string, lockedAt: string) =>
      expect.objectContaining({ action: "billing_access_locked", orgId, reason, lockedAt });

    it("alerts once a trial's grace has run out, but not for an old lock", async () => {
      expiredQuery.mockResolvedValueOnce({
        data: [
          // Grace ended 2026-06-03T00:00Z: within the window.
          {
            id: "org-recent",
            trial_ends_at: "2026-05-31T00:00:00Z",
            subscription_status: "trialing",
          },
          // Grace ended 2026-05-28: locked long ago.
          { id: "org-old", trial_ends_at: "2026-05-25T00:00:00Z", subscription_status: "trialing" },
          // Its own 10-day grace hasn't run out yet.
          {
            id: "org-longer",
            trial_ends_at: "2026-05-31T00:00:00Z",
            subscription_status: "trialing",
            trial_grace_days_override: 10,
          },
        ],
        error: null,
      });

      await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

      expect(dispatchNotificationEvent).toHaveBeenCalledWith(
        "trial-expiry-cron",
        locked("org-recent", "trial", "2026-06-03T00:00:00.000Z"),
      );
      const lockedOrgs = dispatchNotificationEvent.mock.calls
        .map(([, event]) => event as { action: string; orgId: string })
        .filter((event) => event.action === "billing_access_locked")
        .map((event) => event.orgId);
      expect(lockedOrgs).toEqual(["org-recent"]);
    });

    it("alerts once an overdue payment's grace has run out", async () => {
      overdueQuery.mockResolvedValueOnce({
        data: [
          // 14 days from 2026-05-20T12:00Z is 2026-06-03T12:00Z.
          { id: "org-overdue", payment_grace_started_at: "2026-05-20T12:00:00Z" },
          { id: "org-not-yet", payment_grace_started_at: "2026-05-30T00:00:00Z" },
          {
            id: "org-own-grace",
            payment_grace_started_at: "2026-05-30T00:00:00Z",
            payment_grace_days_override: 5,
          },
        ],
        error: null,
      });

      const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

      expect(dispatchNotificationEvent).toHaveBeenCalledWith(
        "trial-expiry-cron",
        locked("org-overdue", "payment", "2026-06-03T12:00:00.000Z"),
      );
      expect(dispatchNotificationEvent).toHaveBeenCalledWith(
        "trial-expiry-cron",
        locked("org-own-grace", "payment", "2026-06-04T00:00:00.000Z"),
      );
      await expect(res.json()).resolves.toMatchObject({ lockedDispatched: 2 });
    });

    it("skips paused organizations when looking for overdue payments", async () => {
      await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

      expect(isFilter).toHaveBeenCalledWith(2, "billing_paused_at", null);
      expect(isFilter).toHaveBeenCalledWith(2, "suspended_at", null);
    });
  });
});
