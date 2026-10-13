import { describe, expect, it } from "vitest";
import {
  billingHoldControls,
  effectiveBillingStatus,
  evaluateOrganizationBillingAccess,
  isLiveSubscriptionStatus,
  resumedTrialEndsAt,
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

describe("a paused organization", () => {
  const pausedAt = "2026-10-02T12:00:00Z";

  it("stays open after its trial and grace would have ended", () => {
    const access = evaluateOrganizationBillingAccess({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-10-05T12:00:00Z",
      billingPausedAt: pausedAt,
      now,
    });
    expect(access).toMatchObject({
      state: "paused",
      reason: "billing_paused",
      isLocked: false,
      shouldNotifyAdmins: false,
      trialGraceEndsAt: null,
    });
  });

  it("freezes the trial days left at the pause", () => {
    const access = evaluateOrganizationBillingAccess({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-10-05T12:00:00Z",
      billingPausedAt: pausedAt,
      now,
    });
    expect(access.daysUntilTrialEnd).toBe(3);
  });

  it("reads as paused for a paying subscriber", () => {
    const access = evaluateOrganizationBillingAccess({
      subscriptionStatus: "active",
      billingPausedAt: pausedAt,
      now,
    });
    expect(access).toMatchObject({ state: "paused", isLocked: false, daysUntilTrialEnd: null });
  });

  it.each(["canceled", "unpaid", "incomplete_expired", "trial_expired"])(
    "still locks when the status is %s",
    (status) => {
      const access = evaluateOrganizationBillingAccess({
        subscriptionStatus: status,
        billingPausedAt: pausedAt,
        now,
      });
      expect(access.isLocked).toBe(true);
    },
  );

  it("still locks when suspended", () => {
    const access = evaluateOrganizationBillingAccess({
      subscriptionStatus: "active",
      suspendedAt: "2026-10-03T00:00:00Z",
      billingPausedAt: pausedAt,
      now,
    });
    expect(access.state).toBe("suspended");
  });

  it("can't have its trial changed", () => {
    expect(
      trialControls({
        status: "trialing",
        trialEndsAt: "2026-10-20T00:00:00Z",
        hasStripeSubscription: false,
        billingPausedAt: pausedAt,
        now,
      }),
    ).toEqual({
      change: false,
      end: false,
      expire: false,
      reason: "Billing is paused. Resume it to change the trial.",
    });
  });
});

describe("billingHoldControls", () => {
  const trialing = { status: "trialing", trialEndsAt: "2026-10-20T00:00:00Z", now };

  it("pauses an open organization and nothing else", () => {
    const controls = billingHoldControls(trialing);
    expect(controls.pause).toEqual({ allowed: true, reason: null });
    expect(controls.resume).toEqual({ allowed: false, reason: "Billing isn't paused." });
    expect(controls.extendGrace).toEqual({
      allowed: false,
      reason: "The trial hasn't ended yet.",
    });
  });

  it("only resumes a paused organization", () => {
    const controls = billingHoldControls({ ...trialing, billingPausedAt: "2026-10-01T00:00:00Z" });
    expect(controls.pause.allowed).toBe(false);
    expect(controls.resume.allowed).toBe(true);
    expect(controls.extendGrace.allowed).toBe(false);
  });

  it("won't pause a locked or suspended organization", () => {
    expect(billingHoldControls({ status: "canceled", trialEndsAt: null, now }).pause.reason).toBe(
      "This organization is locked. Reopen it before pausing billing.",
    );
    expect(
      billingHoldControls({ ...trialing, suspendedAt: "2026-10-01T00:00:00Z" }).pause.reason,
    ).toBe("This organization is suspended.");
  });

  it("extends grace for a trial in grace or one that ran out", () => {
    const inGrace = { status: "trialing", trialEndsAt: "2026-10-11T12:00:00Z", now };
    const ranOut = { status: "trialing", trialEndsAt: "2026-09-01T00:00:00Z", now };
    expect(billingHoldControls(inGrace).extendGrace.allowed).toBe(true);
    expect(billingHoldControls(ranOut).extendGrace.allowed).toBe(true);
    expect(billingHoldControls(ranOut).pause.allowed).toBe(false);
  });

  it("won't extend grace for an expired trial or a subscriber", () => {
    expect(
      billingHoldControls({ status: "trial_expired", trialEndsAt: "2026-10-01T00:00:00Z", now })
        .extendGrace.reason,
    ).toBe("The trial was expired with no grace period. Change the trial to reopen it.");
    expect(
      billingHoldControls({ status: "active", trialEndsAt: null, now }).extendGrace.reason,
    ).toBe("This organization isn't on a trial.");
  });
});

describe("resumedTrialEndsAt", () => {
  it("gives the trial back the paused time", () => {
    expect(
      resumedTrialEndsAt({
        status: "trialing",
        trialEndsAt: "2026-10-05T12:00:00Z",
        trialStartedAt: "2026-09-21T12:00:00Z",
        billingPausedAt: "2026-10-02T12:00:00Z",
        now,
      }),
    ).toBe("2026-10-15T12:00:00.000Z");
  });

  it("gives back only the time since a trial that started during the pause", () => {
    expect(
      resumedTrialEndsAt({
        status: "trialing",
        trialEndsAt: "2026-10-22T12:00:00Z",
        trialStartedAt: "2026-10-08T12:00:00Z",
        billingPausedAt: "2026-10-02T12:00:00Z",
        now,
      }),
    ).toBe("2026-10-26T12:00:00.000Z");
  });

  it("moves nothing for a subscriber or a trial that never started", () => {
    const base = { trialStartedAt: null, billingPausedAt: "2026-10-02T12:00:00Z", now };
    expect(
      resumedTrialEndsAt({ ...base, status: "active", trialEndsAt: "2026-10-05T00:00:00Z" }),
    ).toBe(null);
    expect(resumedTrialEndsAt({ ...base, status: "trialing", trialEndsAt: null })).toBe(null);
  });
});
