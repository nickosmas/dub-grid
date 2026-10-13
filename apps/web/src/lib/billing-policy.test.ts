import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheStore = new Map<string, unknown>();
const cacheDel = vi.fn(async (key: string) => {
  cacheStore.delete(key);
});
const captureException = vi.fn();

vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...actual,
    cacheThrough: async <T>(key: string, _ttl: number, fetcher: () => Promise<T>) => {
      if (cacheStore.has(key)) return cacheStore.get(key) as T;
      const value = await fetcher();
      cacheStore.set(key, value);
      return value;
    },
    cacheDel: (key: string) => cacheDel(key),
  };
});

vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import {
  evaluateOrgBillingAccess,
  getPlatformBillingPolicy,
  invalidatePlatformBillingPolicyCache,
  resetBillingPolicyMemoForTests,
} from "./billing-policy";

function clientReturning(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(async () => result);
  return {
    maybeSingle,
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  };
}

const platformRow = {
  default_trial_days: 21,
  trial_grace_days: 5,
  trial_reminder_days: 10,
  payment_grace_days: 7,
};

beforeEach(() => {
  cacheStore.clear();
  vi.clearAllMocks();
  resetBillingPolicyMemoForTests();
  vi.useRealTimers();
});

describe("getPlatformBillingPolicy", () => {
  it("reads the platform row once and serves it from the memo", async () => {
    const client = clientReturning({ data: platformRow, error: null });

    const first = await getPlatformBillingPolicy(client);
    const second = await getPlatformBillingPolicy(client);

    expect(first).toEqual({
      trialDays: 21,
      trialGraceDays: 5,
      trialReminderDays: 10,
      paymentGraceDays: 7,
    });
    expect(second).toBe(first);
    expect(client.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("falls back to the built-in defaults on a read error, without caching them", async () => {
    const failing = clientReturning({ data: null, error: { message: "down" } });

    await expect(getPlatformBillingPolicy(failing)).resolves.toMatchObject({
      trialDays: 14,
      trialGraceDays: 3,
    });
    expect(captureException).toHaveBeenCalled();
    expect(cacheStore.size).toBe(0);
  });

  it("asks again once the memo expires and after an invalidation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const client = clientReturning({ data: platformRow, error: null });
    await getPlatformBillingPolicy(client);

    vi.setSystemTime(Date.now() + 11_000);
    cacheStore.clear();
    await getPlatformBillingPolicy(client);
    expect(client.maybeSingle).toHaveBeenCalledTimes(2);

    await invalidatePlatformBillingPolicyCache();
    await getPlatformBillingPolicy(client);
    expect(client.maybeSingle).toHaveBeenCalledTimes(3);
  });
});

describe("evaluateOrgBillingAccess", () => {
  it("keeps an organization open through its own longer grace period", async () => {
    const client = clientReturning({ data: platformRow, error: null });
    const now = new Date("2026-10-15T12:00:00Z");
    const org = {
      subscription_status: "trialing",
      trial_ends_at: "2026-10-10T12:00:00Z",
      trial_grace_days_override: 10,
    };

    await expect(evaluateOrgBillingAccess(client, org, { now })).resolves.toMatchObject({
      state: "trial_grace",
      isLocked: false,
    });
    await expect(
      evaluateOrgBillingAccess(client, { ...org, trial_grace_days_override: null }, { now }),
    ).resolves.toMatchObject({ state: "locked", reason: "trial_expired" });
  });

  it("reads a suspension from the row", async () => {
    const client = clientReturning({ data: platformRow, error: null });

    await expect(
      evaluateOrgBillingAccess(client, {
        subscription_status: "active",
        suspended_at: "2026-10-01T00:00:00Z",
      }),
    ).resolves.toMatchObject({ state: "suspended" });
  });
});
