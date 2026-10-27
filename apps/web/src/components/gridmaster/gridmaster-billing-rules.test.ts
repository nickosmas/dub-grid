import { describe, expect, it } from "vitest";
import { DEFAULT_BILLING_POLICY, resolveBillingPolicy } from "@dubgrid/domain";
import {
  billingActionStates,
  describeOverrideOutcome,
  describePauseOutcome,
  describeResumeOutcome,
  displayStatusFor,
  holdControlsFor,
  disabledActionSummary,
  stripeDashboardUrl,
  trialActionReasons,
} from "./gridmaster-billing-rules";

const now = new Date("2026-10-12T12:00:00Z");
const localTrial = { trialEndsAt: "2026-10-20T00:00:00Z", stripeSubscriptionId: null };

describe("describeOverrideOutcome", () => {
  it("says Active grants open access without payment", () => {
    expect(describeOverrideOutcome(localTrial, "active", now)).toEqual([
      "The organization stays open with full access.",
      "No payment is needed.",
    ]);
  });

  it("says Canceled locks the organization", () => {
    expect(describeOverrideOutcome(localTrial, "canceled", now)).toEqual([
      "The organization locks.",
      "Members can't use it until billing changes again.",
    ]);
  });

  it("says a trial override keeps the trial's own end date", () => {
    expect(describeOverrideOutcome(localTrial, "trialing", now)).toEqual([
      "The organization stays open on its trial.",
      "The trial end date doesn't change.",
    ]);
    expect(
      describeOverrideOutcome(
        { ...localTrial, trialEndsAt: "2026-10-11T00:00:00Z" },
        "trialing",
        now,
      )[0],
    ).toMatch(/^The trial has already ended/);
  });

  it("asks for payment on a past-due override", () => {
    expect(describeOverrideOutcome(localTrial, "past_due", now)).toEqual([
      "The organization stays open.",
      "Its Super Admins are asked to update payment.",
    ]);
  });

  it("warns that Stripe replaces an override on a subscribed organization", () => {
    expect(
      describeOverrideOutcome({ ...localTrial, stripeSubscriptionId: "sub_123" }, "active", now),
    ).toContain("Stripe's next update for this subscription replaces this override.");
  });
});

const noStripe = {
  status: "trialing",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  cancelAt: null,
  seats: null,
  appUsers: 12,
};
const subscribed = {
  ...noStripe,
  status: "active",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  seats: 10,
};

describe("billingActionStates", () => {
  it("explains every Stripe action on an organization with no Stripe account", () => {
    expect(billingActionStates(noStripe)).toEqual({
      sync: { enabled: false, reason: "No Stripe customer yet." },
      trueUp: { enabled: false, reason: "No Stripe subscription." },
      cancelAtPeriodEnd: { enabled: false, reason: "No Stripe subscription." },
      cancel: { enabled: false, reason: "No Stripe subscription." },
    });
  });

  it("allows every action on a live subscription with a seat gap", () => {
    const states = billingActionStates(subscribed);
    expect(Object.values(states).every((entry) => entry.enabled)).toBe(true);
  });

  it("says why seats, scheduling, and canceling are off", () => {
    expect(billingActionStates({ ...subscribed, seats: 12 }).trueUp.reason).toBe(
      "Stripe seats already match app users.",
    );
    expect(billingActionStates({ ...subscribed, appUsers: 0, seats: 1 }).trueUp.enabled).toBe(
      false,
    );
    expect(
      billingActionStates({ ...subscribed, cancelAt: "2026-11-01T00:00:00Z" }).cancelAtPeriodEnd
        .reason,
    ).toBe("A cancellation is already scheduled.");
    expect(billingActionStates({ ...subscribed, status: "canceled" }).cancel.reason).toBe(
      "The subscription is already canceled.",
    );
  });
});

describe("disabledActionSummary", () => {
  it("groups the disabled actions under each reason", () => {
    expect(disabledActionSummary(billingActionStates(noStripe))).toEqual([
      "Sync Stripe: No Stripe customer yet.",
      "True up seats, Cancel at period end, Cancel: No Stripe subscription.",
    ]);
  });
});

describe("stripeDashboardUrl", () => {
  it("opens test-mode pages on a test key and live pages otherwise", () => {
    expect(stripeDashboardUrl("test", "customers", "cus_1")).toBe(
      "https://dashboard.stripe.com/test/customers/cus_1",
    );
    expect(stripeDashboardUrl("live", "subscriptions", "sub_1")).toBe(
      "https://dashboard.stripe.com/subscriptions/sub_1",
    );
    expect(stripeDashboardUrl(null, "customers", "cus_1")).toBe(
      "https://dashboard.stripe.com/customers/cus_1",
    );
  });
});

describe("trialActionReasons", () => {
  it("offers both ways to end a running trial", () => {
    expect(trialActionReasons({ change: true, end: true, expire: true, reason: null })).toEqual({
      change: null,
      end: null,
      grace: null,
      lock: null,
    });
  });

  it("offers only locking once the trial is in its grace period", () => {
    expect(trialActionReasons({ change: true, end: false, expire: true, reason: null })).toEqual({
      change: null,
      end: null,
      grace: "The trial has already ended.",
      lock: null,
    });
  });

  it("turns End trial off for an expired trial", () => {
    expect(trialActionReasons({ change: true, end: false, expire: false, reason: null }).end).toBe(
      "The trial has already expired.",
    );
  });

  it("uses the shared rule's reason for a paying organization", () => {
    const reason = "This organization isn't on a trial.";
    expect(trialActionReasons({ change: false, end: false, expire: false, reason })).toEqual({
      change: reason,
      end: reason,
      grace: reason,
      lock: reason,
    });
  });
});

describe("billing holds in Gridmaster views", () => {
  const policy = resolveBillingPolicy(DEFAULT_BILLING_POLICY, {});
  const hold = { pausedAt: "2026-10-02T12:00:00Z", reason: "Renewal" };

  it("shows a paused organization as paused unless its status locks it", () => {
    expect(
      displayStatusFor(
        { status: "trialing", trialEndsAt: "2026-09-01T00:00:00Z", billingHold: hold, policy },
        now,
      ),
    ).toBe("billing_paused");
    expect(
      displayStatusFor({ status: "canceled", trialEndsAt: null, billingHold: hold, policy }, now),
    ).toBe("canceled");
  });

  it("offers resume, not pause, while paused", () => {
    const controls = holdControlsFor(
      {
        status: "trialing",
        trialEndsAt: "2026-10-20T00:00:00Z",
        suspendedAt: null,
        billingHold: hold,
        policy,
      },
      now,
    );
    expect(controls.pause.allowed).toBe(false);
    expect(controls.resume.allowed).toBe(true);
  });

  it("says which clock a pause stops", () => {
    const org = { status: "trialing", stripeSubscriptionId: null };
    expect(describePauseOutcome({ ...org, trialEndsAt: "2026-10-20T00:00:00Z" }, now)).toEqual([
      "The organization keeps full access while billing is paused.",
      "The trial stops counting down.",
      "Resuming gives back the paused days.",
    ]);
    expect(describePauseOutcome({ ...org, trialEndsAt: "2026-10-11T00:00:00Z" }, now)[1]).toBe(
      "The grace period stops counting down.",
    );
  });

  it("says when a short pause moves the trial by under a day", () => {
    expect(
      describeResumeOutcome(
        {
          status: "trialing",
          trialEndsAt: "2026-10-20T00:00:00Z",
          trialStartedAt: "2026-10-06T00:00:00Z",
          stripeSubscriptionId: null,
          billingHold: { pausedAt: "2026-10-12T11:58:00Z", reason: null },
        },
        now,
      ),
    ).toEqual(["The trial end moves later by the paused time, which is less than half a day."]);
  });

  it("says a subscriber's resume collects again", () => {
    expect(
      describeResumeOutcome(
        {
          status: "active",
          trialEndsAt: null,
          trialStartedAt: null,
          stripeSubscriptionId: "sub_123",
          billingHold: hold,
        },
        now,
      ),
    ).toEqual(["Stripe starts collecting payment again."]);
  });
});
