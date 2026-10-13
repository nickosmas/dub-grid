import { describe, expect, it } from "vitest";
import {
  calendarDaysUntil,
  describeBillingNotice,
  describeBillingStatus,
  describeHeaderBillingNotice,
  describeSeatDifference,
  describeTrialMetrics,
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

describe("describeBillingNotice", () => {
  it("stays quiet until the last week of the trial", () => {
    expect(describeBillingNotice(trial(at(9, 30)), now)).toBeNull();
    expect(describeBillingNotice(trial(at(9, 13)), now)).toEqual({
      message:
        "Your free trial ends tomorrow. Add a payment method to keep your organization open.",
      tone: "warning",
    });
  });

  it("dates the end of the trial and of access", () => {
    expect(describeBillingNotice(grace, now)?.message).toMatch(
      /^Your free trial ended on Oct \d+, 2026\. Add a payment method by Oct \d+, 2026 to keep your organization open\.$/,
    );
    expect(describeBillingNotice(expired, now)).toEqual({
      message:
        "Your free trial ended on Oct 1, 2026, so your organization is on hold. Add a payment method to reopen it.",
      tone: "danger",
    });
  });

  it("explains a suspension instead of showing an empty notice", () => {
    expect(
      describeBillingNotice({
        status: "active",
        trialEndsAt: null,
        billingAccess: { state: "suspended", reason: "suspended", trialGraceEndsAt: null },
      })?.message,
    ).toBe("Your organization is suspended. Contact DubGrid Support for help.");
  });
});

describe("describeTrialMetrics", () => {
  it("counts down while the trial runs", () => {
    expect(describeTrialMetrics(trial(at(9, 12, 23)), now)[0]).toMatchObject({
      label: "Trial time left",
      value: "Ends today",
      tone: "warning",
    });
    expect(describeTrialMetrics(trial(at(9, 30)), now)[0]).toMatchObject({
      value: "18 days",
      tone: undefined,
    });
  });

  it("never shows time left once the trial has ended", () => {
    expect(describeTrialMetrics(grace, now).map((metric) => metric.label)).toEqual([
      "Trial ended",
      "Access ends",
    ]);
    expect(describeTrialMetrics(expired, now).map((metric) => metric.label)).toEqual([
      "Trial ended",
    ]);
  });
});

describe("describeSeatDifference", () => {
  it("says how many users lack a seat, or how many seats go unused", () => {
    expect(describeSeatDifference(-2)).toBe("2 without a seat");
    expect(describeSeatDifference(3)).toBe("3 unused");
    expect(describeSeatDifference(0)).toBe("None");
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

  it("reads as paused and says what that means", () => {
    expect(describeBillingStatus(paused("trialing", 3))).toEqual({
      label: "Billing paused",
      tone: "info",
    });
    expect(describeBillingNotice(paused("trialing", 3))?.message).toBe(
      "Billing is paused. Your organization stays open, and your trial days don't count down while it's paused.",
    );
    expect(describeBillingNotice(paused("active", null))?.message).toBe(
      "Billing is paused. Your organization stays open, and you won't be charged while it's paused.",
    );
  });

  it("names the grace days when the trial had ended before the pause", () => {
    expect(describeBillingNotice(paused("trialing", -2))?.message).toBe(
      "Billing is paused. Your organization stays open, and your days to add billing don't count down while it's paused.",
    );
  });

  it("shows the trial days it has left, not an end date that will move", () => {
    expect(describeTrialMetrics(paused("trialing", 3), now)).toEqual([
      { key: "trial-time-left", label: "Trial time left", value: "3 days, paused" },
    ]);
  });

  it("puts nothing in the header", () => {
    expect(describeHeaderBillingNotice(paused("trialing", 3), now)).toBeNull();
  });
});
