import { describe, expect, it } from "vitest";
import type { OrganizationBillingSummary } from "@/types";
import {
  describeBillingOverview,
  describeSeatGap,
  formatLongDate,
  formatShortDate,
  type BillingOverview,
} from "./overview";

// Local wall-clock dates, so the calendar-day math holds in any runner zone.
const now = new Date(2026, 9, 27, 9, 0);
const at = (month: number, day: number, hour = 12) =>
  new Date(2026, month, day, hour).toISOString();

type Summary = Parameters<typeof describeBillingOverview>[0];

function summary(overrides: Partial<OrganizationBillingSummary>): Summary {
  return {
    status: "trialing",
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAt: null,
    canceledAt: null,
    subscriptionSeats: null,
    appUserCount: 32,
    hasStripeCustomer: false,
    hasStripeSubscription: false,
    billingAccess: {
      state: "trialing",
      reason: "trial_active",
      isLocked: false,
      shouldNotifyAdmins: false,
      daysUntilTrialEnd: null,
      trialGraceEndsAt: null,
    },
    billingPolicy: { trialDays: 14, trialGraceDays: 3, paymentGraceDays: 7 },
    lastPayment: null,
    outstandingPayment: null,
    ...overrides,
  };
}

describe("describeSeatGap", () => {
  it("says what the difference between seats in use and paid seats means", () => {
    expect(describeSeatGap(32, 30)).toBe(
      "2 seats in use aren't paid for yet. Paid seats don't change on their own. When we update them to match the seats in use, the change is prorated on your next invoice.",
    );
    expect(describeSeatGap(29, 30)).toMatch(/^You're paying for 1 seat that nobody is using\./);
    expect(describeSeatGap(30, 30)).toBe(
      "Every seat in use is paid for, and you aren't paying for any unused seats.",
    );
    expect(describeSeatGap(30, null)).toBeNull();
  });
});

/** The ring and timeline carry the dates, so the words never repeat them. */
function expectNoDatesInWords(overview: BillingOverview, ...dates: string[]) {
  for (const date of dates) {
    for (const words of [overview.title, overview.lead]) {
      expect(words).not.toContain(formatLongDate(date));
      expect(words).not.toContain(formatShortDate(date));
    }
  }
}

describe("describeBillingOverview", () => {
  it("counts down a running trial from its own start", () => {
    const overview = describeBillingOverview(
      summary({ trialStartedAt: at(9, 21), trialEndsAt: at(10, 4) }),
      now,
    );
    expect(overview.title).toBe("Your free trial is running.");
    expect(overview.lead).toBe(
      "You can start a subscription at any time, and you won't be charged until the trial ends.",
    );
    expect(overview.visual).toEqual({
      kind: "ring",
      value: 8,
      total: 14,
      unit: "days",
      caption: "Left in your free trial",
      tone: "info",
    });
    expect(overview.timeline.map((step) => [step.label, step.state])).toEqual([
      ["Trial started", "done"],
      ["Today", "now"],
      ["Trial ends", "upcoming"],
      ["Grace period ends", "upcoming"],
    ]);
    expect(overview.action).toEqual({ kind: "checkout", label: "Start subscription" });
    expect(overview.pricingNote).toBe(true);
    expectNoDatesInWords(overview, at(9, 21), at(10, 4));
  });

  it("warns once the trial ends within a week, saying what happens without a subscription", () => {
    const overview = describeBillingOverview(
      summary({
        trialEndsAt: at(9, 30),
        billingAccess: { ...summary({}).billingAccess, state: "trial_ending_soon" },
      }),
      now,
    );
    expect(overview.status).toEqual({ label: "Trial ending soon", tone: "warning" });
    expect(overview.title).toBe("Start a subscription to keep your organization open.");
    expect(overview.lead).toBe(
      "You won't be charged until the trial ends. Without a subscription, your organization locks once the grace period ends.",
    );
    expect(overview.visual).toMatchObject({ value: 3, unit: "days", tone: "warning" });
    expect(overview.timeline.at(-1)).toMatchObject({ label: "Grace period ends", alert: true });
    expectNoDatesInWords(overview, at(9, 30));
  });

  it("says the organization locks when the trial ends if there is no grace period", () => {
    const overview = describeBillingOverview(
      summary({
        trialEndsAt: at(9, 30),
        billingPolicy: { trialDays: 14, trialGraceDays: 0, paymentGraceDays: 7 },
        billingAccess: { ...summary({}).billingAccess, state: "trial_ending_soon" },
      }),
      now,
    );
    expect(overview.lead).toBe(
      "You won't be charged until the trial ends. Without a subscription, your organization locks when it does.",
    );
  });

  it("says a subscription started in the last two days of the trial is charged right away", () => {
    const overview = describeBillingOverview(
      summary({
        trialEndsAt: at(9, 28),
        billingAccess: { ...summary({}).billingAccess, state: "trial_ending_soon" },
      }),
      now,
    );
    expect(overview.lead).toBe(
      "Less than two days of the trial are left, so a subscription started now is charged right away. Without a subscription, your organization locks once the grace period ends.",
    );
  });

  it("says a subscription started during the trial starts billing when the trial ends", () => {
    const overview = describeBillingOverview(
      summary({
        trialStartedAt: at(9, 21),
        trialEndsAt: at(9, 30),
        hasStripeCustomer: true,
        hasStripeSubscription: true,
        subscriptionSeats: 32,
        billingAccess: { ...summary({}).billingAccess, state: "trial_ending_soon" },
      }),
      now,
    );
    expect(overview.status).toEqual({ label: "Subscribed", tone: "success" });
    expect(overview.title).toBe("Your subscription starts when the free trial ends.");
    expect(overview.lead).toBe(
      "You won't be charged until then. After that, payments are collected automatically each month for your paid seats.",
    );
    expect(overview.visual).toMatchObject({ kind: "ring", value: 3, tone: "info" });
    expect(overview.timeline.map((step) => [step.label, step.when])).toEqual([
      ["Trial started", formatShortDate(at(9, 21))],
      ["Today", formatShortDate(now.toISOString())],
      ["Billing starts", formatShortDate(at(9, 30))],
    ]);
    expect(overview.action).toEqual({ kind: "portal", label: "Manage billing" });
    expect(overview.pricingNote).toBe(false);
    expectNoDatesInWords(overview, at(9, 30));
  });

  it("counts down to renewal for an active subscription without repeating the date", () => {
    const overview = describeBillingOverview(
      summary({
        status: "active",
        subscriptionSeats: 30,
        currentPeriodEnd: at(10, 1),
        hasStripeCustomer: true,
        hasStripeSubscription: true,
        billingAccess: { ...summary({}).billingAccess, state: "active" },
      }),
      now,
    );
    expect(overview.title).toBe("Your subscription is active.");
    expect(overview.lead).toBe(
      "Payments are collected automatically each month for your paid seats.",
    );
    expect(overview.timeline.at(-1)).toMatchObject({
      label: "Renews",
      when: formatShortDate(at(10, 1)),
    });
    expect(overview.action).toEqual({ kind: "portal", label: "Manage billing" });
    expect(overview.pricingNote).toBe(false);
    expectNoDatesInWords(overview, at(10, 1));
  });

  it("offers to resume a subscription that is set to end", () => {
    const overview = describeBillingOverview(
      summary({
        status: "active",
        subscriptionSeats: 30,
        cancelAt: at(10, 1),
        hasStripeCustomer: true,
        hasStripeSubscription: true,
        billingAccess: { ...summary({}).billingAccess, state: "active" },
      }),
      now,
    );
    expect(overview.status).toEqual({
      label: `Ends ${formatShortDate(at(10, 1))}`,
      tone: "warning",
    });
    expect(overview.title).toBe("Your subscription won't renew.");
    expect(overview.action).toEqual({ kind: "portal", label: "Resume subscription" });
    expectNoDatesInWords(overview, at(10, 1));
  });

  it("names the failed payment, with the dates left to the timeline", () => {
    const overview = describeBillingOverview(
      summary({
        status: "past_due",
        subscriptionSeats: 30,
        hasStripeCustomer: true,
        hasStripeSubscription: true,
        outstandingPayment: {
          kind: "failed",
          amountCents: 45000,
          currency: "usd",
          occurredAt: at(9, 24),
        },
        billingAccess: {
          ...summary({}).billingAccess,
          state: "payment_attention_required",
          reason: "payment_status",
          paymentGraceEndsAt: at(9, 31),
        },
      }),
      now,
    );
    expect(overview.title).toBe("Your payment of $450.00 didn't go through.");
    expect(overview.lead).toBe(
      "The payment provider retries it automatically, and updating your payment method retries it right away. If it still isn't paid, your organization locks until it is.",
    );
    expect(overview.visual).toMatchObject({ kind: "ring", value: 4, total: 7 });
    expect(overview.timeline.map((step) => step.label)).toEqual([
      "Payment failed",
      "Today",
      "Organization locks",
    ]);
    expect(overview.action).toEqual({ kind: "portal", label: "Update payment method" });
    expectNoDatesInWords(overview, at(9, 24), at(9, 31));
  });

  it("says a locked organization keeps its data and how to reopen it", () => {
    const overview = describeBillingOverview(
      summary({
        trialEndsAt: at(9, 21),
        billingAccess: {
          ...summary({}).billingAccess,
          state: "locked",
          reason: "trial_expired",
          isLocked: true,
          trialGraceEndsAt: at(9, 24),
        },
      }),
      now,
    );
    expect(overview.title).toBe(
      "Your organization is locked because the free trial ended without a subscription.",
    );
    expect(overview.lead).toBe(
      "Your schedules, people, and settings are all kept. Start a subscription to open it again.",
    );
    expect(overview.visual).toEqual({
      kind: "icon",
      icon: "locked",
      caption: "Organization locked",
      tone: "danger",
    });
    expectNoDatesInWords(overview, at(9, 21), at(9, 24));
  });

  it("reopens an overdue organization through the payment method it already has", () => {
    const overview = describeBillingOverview(
      summary({
        status: "unpaid",
        hasStripeCustomer: true,
        hasStripeSubscription: true,
        billingAccess: {
          ...summary({}).billingAccess,
          state: "locked",
          reason: "payment_grace_expired",
          isLocked: true,
        },
      }),
      now,
    );
    expect(overview.lead).toBe(
      "A payment still hasn't been made. Your schedules, people, and settings are all kept. Update your payment method to open it again.",
    );
    expect(overview.action).toEqual({ kind: "portal", label: "Update payment method" });
  });

  it("offers no action while billing is paused, and keeps the pause date in the timeline", () => {
    const overview = describeBillingOverview(
      summary({
        status: "active",
        subscriptionSeats: 30,
        hasStripeSubscription: true,
        billingPausedAt: at(9, 20),
        billingAccess: { ...summary({}).billingAccess, state: "paused", reason: "billing_paused" },
      }),
      now,
    );
    expect(overview.action).toBeNull();
    expect(overview.lead).toBe(
      "Your organization stays open, and you won't be charged while it's paused. If you have questions, contact us.",
    );
    expect(overview.timeline[0]).toMatchObject({
      label: "Billing paused",
      when: formatShortDate(at(9, 20)),
    });
    expectNoDatesInWords(overview, at(9, 20));
  });

  it("says a paused trial keeps its days", () => {
    const overview = describeBillingOverview(
      summary({
        billingPausedAt: at(9, 20),
        billingAccess: {
          ...summary({}).billingAccess,
          state: "paused",
          reason: "billing_paused",
          daysUntilTrialEnd: 6,
        },
      }),
      now,
    );
    expect(overview.lead).toBe(
      "Your organization stays open, you won't be charged, and your trial days don't count down while it's paused. If you have questions, contact us.",
    );
    expect(overview.pricingNote).toBe(true);
  });

  it("leaves out the per-seat pricing line once suspended", () => {
    const overview = describeBillingOverview(
      summary({
        billingAccess: {
          ...summary({}).billingAccess,
          state: "suspended",
          reason: "suspended",
          isLocked: true,
        },
      }),
      now,
    );
    expect(overview.title).toBe("Your organization is suspended.");
    expect(overview.pricingNote).toBe(false);
  });
});
