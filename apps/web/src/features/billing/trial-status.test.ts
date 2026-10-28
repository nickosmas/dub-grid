import { describe, expect, it } from "vitest";
import {
  calendarDaysUntil,
  describeBillingStatus,
  describeHeaderBillingNotice,
  type BillingStateInput,
} from "./trial-status";

// Local wall-clock dates, so the calendar-day math holds in any runner zone.
const now = new Date(2026, 9, 12, 9, 0);
const at = (month: number, day: number, hour = 12) =>
  new Date(2026, month, day, hour).toISOString();

function trial(
  trialEndsAt: string,
  state: BillingStateInput["billingAccess"]["state"] = "trialing",
): BillingStateInput {
  return {
    status: "trialing",
    trialEndsAt,
    billingAccess: { state, reason: "trial_active", trialGraceEndsAt: null },
  };
}

const grace: BillingStateInput = {
  status: "trialing",
  trialEndsAt: at(9, 9, 6),
  billingAccess: { state: "trial_grace", reason: "trial_grace", trialGraceEndsAt: at(9, 12, 6) },
};

const expired: BillingStateInput = {
  status: "trialing",
  trialEndsAt: at(9, 1),
  billingAccess: { state: "locked", reason: "trial_expired", trialGraceEndsAt: at(9, 4) },
};

describe("calendarDaysUntil", () => {
  it("counts calendar days, not 24-hour blocks", () => {
    expect(calendarDaysUntil(new Date(2026, 9, 12, 23), now)).toBe(0);
    expect(calendarDaysUntil(new Date(2026, 9, 13, 1), now)).toBe(1);
    expect(calendarDaysUntil(new Date(2026, 9, 20, 0), now)).toBe(8);
  });
});

describe("describeBillingStatus", () => {
  it("steps blue, amber, red as the trial runs out", () => {
    expect(describeBillingStatus(trial(at(9, 30)), now)).toEqual({
      label: "Free trial",
      tone: "info",
    });
    expect(describeBillingStatus(trial(at(9, 19), "trial_ending_soon"), now)).toEqual({
      label: "Trial ending soon",
      tone: "warning",
    });
    expect(describeBillingStatus(grace, now)).toEqual({ label: "Trial ended", tone: "danger" });
    expect(describeBillingStatus(expired, now)).toEqual({ label: "Trial expired", tone: "danger" });
  });

  it("names payment states from the subscription status", () => {
    expect(
      describeBillingStatus({
        status: "past_due",
        trialEndsAt: null,
        billingAccess: {
          state: "payment_attention_required",
          reason: "payment_status",
          trialGraceEndsAt: null,
        },
      }),
    ).toEqual({ label: "Past due", tone: "warning" });
    expect(
      describeBillingStatus({
        status: "active",
        trialEndsAt: null,
        billingAccess: { state: "active", reason: "active_subscription", trialGraceEndsAt: null },
      }),
    ).toEqual({ label: "Active", tone: "success" });
  });
});

describe("describeHeaderBillingNotice", () => {
  it("says today and tomorrow by the calendar", () => {
    expect(describeHeaderBillingNotice(trial(at(9, 12, 23)), now)?.label).toBe("Trial ends today");
    expect(describeHeaderBillingNotice(trial(at(9, 13, 2)), now)?.label).toBe(
      "Trial ends tomorrow",
    );
    expect(describeHeaderBillingNotice(trial(at(9, 22)), now)).toMatchObject({
      label: "Trial ends in 10 days",
      tone: "info",
    });
    expect(describeHeaderBillingNotice(trial(at(9, 19)), now)?.tone).toBe("warning");
  });

  it("calls an ended trial ended and gives the date to act by", () => {
    const notice = describeHeaderBillingNotice(grace, now);
    expect(notice).toMatchObject({ label: "Trial ended", tone: "danger" });
    expect(notice?.ariaLabel).toMatch(/^Trial ended\. Add a payment method by Oct 1[12], 2026 /);
  });
});

describe("a paused organization", () => {
  const paused = (status: string, daysUntilTrialEnd: number | null): BillingStateInput => ({
    status,
    trialEndsAt: status === "trialing" ? at(9, 15) : null,
    billingAccess: {
      state: "paused",
      reason: "billing_paused",
      trialGraceEndsAt: null,
      daysUntilTrialEnd,
    },
  });

  it("reads as paused", () => {
    expect(describeBillingStatus(paused("trialing", 3))).toEqual({
      label: "Billing paused",
      tone: "info",
    });
  });

  it("puts nothing in the header", () => {
    expect(describeHeaderBillingNotice(paused("trialing", 3), now)).toBeNull();
  });
});
