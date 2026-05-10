import { describe, expect, it } from "vitest";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";

const NOW = new Date("2026-05-02T12:00:00.000Z");

describe("evaluateOrganizationBillingAccess", () => {
  it("keeps an active subscription unlocked", () => {
    expect(
      evaluateOrganizationBillingAccess({
        subscriptionStatus: "active",
        now: NOW,
      }),
    ).toMatchObject({
      state: "active",
      isLocked: false,
      shouldNotifyAdmins: false,
    });
  });

  it("notifies admins when a trial is ending soon without locking users", () => {
    expect(
      evaluateOrganizationBillingAccess({
        subscriptionStatus: "trialing",
        trialEndsAt: "2026-05-05T12:00:00.000Z",
        now: NOW,
      }),
    ).toMatchObject({
      state: "trial_ending_soon",
      isLocked: false,
      shouldNotifyAdmins: true,
      daysUntilTrialEnd: 3,
    });
  });

  it("keeps the workspace open during the three-day trial grace period", () => {
    expect(
      evaluateOrganizationBillingAccess({
        subscriptionStatus: "trialing",
        trialEndsAt: "2026-05-01T12:00:00.000Z",
        now: NOW,
      }),
    ).toMatchObject({
      state: "trial_grace",
      isLocked: false,
      shouldNotifyAdmins: true,
    });
  });

  it("locks the workspace after trial expiration plus grace", () => {
    expect(
      evaluateOrganizationBillingAccess({
        subscriptionStatus: "trialing",
        trialEndsAt: "2026-04-28T12:00:00.000Z",
        now: NOW,
      }),
    ).toMatchObject({
      state: "locked",
      reason: "trial_expired",
      isLocked: true,
      shouldNotifyAdmins: true,
    });
  });

  it("locks canceled and unpaid subscriptions", () => {
    for (const subscriptionStatus of ["canceled", "unpaid", "incomplete_expired"]) {
      expect(
        evaluateOrganizationBillingAccess({
          subscriptionStatus,
          now: NOW,
        }),
      ).toMatchObject({
        state: "locked",
        reason: "payment_status",
        isLocked: true,
      });
    }
  });
});
