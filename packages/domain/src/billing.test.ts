import { describe, expect, it } from "vitest";
import {
  effectiveBillingStatus,
  evaluateOrganizationBillingAccess,
  isLiveSubscriptionStatus,
  trialControls,
} from "./billing";

const now = new Date("2026-10-12T12:00:00Z");

describe("effectiveBillingStatus", () => {
  it("keeps a running trial as trialing", () => {
    expect(effectiveBillingStatus("trialing", "2026-10-20T00:00:00Z", now)).toBe("trialing");
  });

  it("reads a trial past its end date as its grace period", () => {
    expect(effectiveBillingStatus("trialing", "2026-10-10T00:00:00Z", now)).toBe("trial_grace");
  });

  it("honors an organization's own grace length", () => {
    expect(effectiveBillingStatus("trialing", "2026-10-09T00:00:00Z", now, 10)).toBe("trial_grace");
  });

  it("reads a trial past its grace period as expired", () => {
    expect(effectiveBillingStatus("trialing", "2026-10-09T00:00:00Z", now)).toBe("trial_expired");
    expect(effectiveBillingStatus(null, "2026-10-01T00:00:00Z", now)).toBe("trial_expired");
  });

  it("reads a trial with no end date as pending", () => {
    expect(effectiveBillingStatus("trialing", null, now)).toBe("trial_pending");
  });

  it("leaves Stripe statuses and a missing subscription alone", () => {
    expect(effectiveBillingStatus("active", "2026-10-01T00:00:00Z", now)).toBe("active");
    expect(effectiveBillingStatus("past_due", null, now)).toBe("past_due");
    expect(effectiveBillingStatus(null, null, now)).toBeNull();
  });
});

describe("a trial a Gridmaster expired", () => {
  it("locks with no grace period and keeps its label", () => {
    const access = evaluateOrganizationBillingAccess({
      subscriptionStatus: "trial_expired",
      trialEndsAt: "2026-10-12T10:00:00Z",
      now,
    });
    expect(access).toMatchObject({
      state: "locked",
      reason: "trial_expired",
      isLocked: true,
      trialGraceEndsAt: null,
    });
    expect(effectiveBillingStatus("trial_expired", "2026-10-12T10:00:00Z", now)).toBe(
      "trial_expired",
    );
  });
});

describe("trialControls", () => {
  const base = { hasStripeSubscription: false, now };

  it("offers every control on a running local trial", () => {
    expect(
      trialControls({ ...base, status: "trialing", trialEndsAt: "2026-10-20T00:00:00Z" }),
    ).toEqual({ change: true, end: true, expire: true, reason: null });
    expect(trialControls({ ...base, status: null, trialEndsAt: null })).toMatchObject({
      change: true,
      end: true,
      expire: true,
    });
  });

  it("can only expire or reopen a trial already in its grace period", () => {
    expect(
      trialControls({ ...base, status: "trialing", trialEndsAt: "2026-10-11T00:00:00Z" }),
    ).toMatchObject({ change: true, end: false, expire: true });
  });

  it("can only reopen an expired trial", () => {
    expect(trialControls({ ...base, status: "trial_expired", trialEndsAt: null })).toMatchObject({
      change: true,
      end: false,
      expire: false,
    });
  });

  it("never touches a paying organization", () => {
    for (const status of ["active", "past_due", "canceled", "unpaid"]) {
      expect(trialControls({ ...base, status, trialEndsAt: null })).toEqual({
        change: false,
        end: false,
        expire: false,
        reason: "This organization isn't on a trial.",
      });
    }
  });

  it("leaves ending a Stripe-billed trial to Stripe", () => {
    expect(
      trialControls({
        status: "trialing",
        trialEndsAt: "2026-10-20T00:00:00Z",
        hasStripeSubscription: true,
        now,
      }),
    ).toMatchObject({ change: true, end: false, expire: false });
  });
});

describe("isLiveSubscriptionStatus", () => {
  it("counts every subscription Stripe can still change as live", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
      expect(isLiveSubscriptionStatus(status)).toBe(true);
    }
  });

  it("treats an ended or missing subscription as not live", () => {
    expect(isLiveSubscriptionStatus("canceled")).toBe(false);
    expect(isLiveSubscriptionStatus("incomplete_expired")).toBe(false);
    expect(isLiveSubscriptionStatus(null)).toBe(false);
  });
});
