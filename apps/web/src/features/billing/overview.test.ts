import { describe, expect, it } from "vitest";
import type { OrganizationBillingSummary } from "@/types";
import {
  describeBillingOverview,
  describeSeatGap,
  formatLongDate,
  formatShortDate,
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
      "2 seats in use aren't paid for yet. DubGrid Support updates your paid seats to match the seats in use, and the change is prorated on your next invoice.",
    );
    expect(describeSeatGap(29, 30)).toMatch(/^You're paying for 1 seat that nobody is using\./);
    expect(describeSeatGap(30, 30)).toBe(
      "Every seat in use is paid for, and you aren't paying for any unused seats.",
    );
    expect(describeSeatGap(30, null)).toBeNull();
  });
});

describe("describeBillingOverview", () => {
  it("counts down a running trial from its own start", () => {
    const overview = describeBillingOverview(
      summary({ trialStartedAt: at(9, 21), trialEndsAt: at(10, 4) }),
      now,
    );
    expect(overview.title).toBe(`Your free trial ends on ${formatLongDate(at(10, 4))}.`);
    expect(overview.lead).toBe(
      "That's 8 days from today. You can start a subscription at any time, and you won't be charged until the trial ends.",
    );
    expect(overview.visual).toEqual({
      kind: "ring",
      value: 8,
      total: 14,
      unit: "days",
      caption: "Left in your free trial",
      tone: "info",
    });
    expect(overview.banner).toBeNull();
    expect(overview.timeline.map((step) => [step.label, step.state])).toEqual([
      ["Trial started", "done"],
      ["Today", "now"],
      ["Trial ends", "upcoming"],
      ["Grace period ends", "upcoming"],
    ]);
    expect(overview.action).toEqual({ kind: "checkout", label: "Start subscription" });
  });

  it("warns once the trial ends within a week, with the grace that follows", () => {
    const overview = describeBillingOverview(
      summary({
        trialEndsAt: at(9, 28),
        billingAccess: { ...summary({}).billingAccess, state: "trial_ending_soon" },
      }),
      now,
    );
    expect(overview.status).toEqual({ label: "Trial ending soon", tone: "warning" });
    expect(overview.banner).toEqual({
      tone: "warning",
      icon: "alarm",
      message: `Your free trial ends tomorrow, ${formatLongDate(at(9, 28))}. If no subscription has been started by then, you'll have 3 days of grace before your organization is locked.`,
    });
    expect(overview.visual).toMatchObject({ value: 1, unit: "day", tone: "warning" });
  });

  it("explains seats against paid seats for an active subscription and counts down to renewal", () => {
    const overview = describeBillingOverview(
      summary({
        status: "active",
        subscriptionSeats: 30,
        currentPeriodEnd: at(10, 1),
        hasStripeCustomer: true,
        hasStripeSubscription: true,
        lastPayment: {
          kind: "paid",
          amountCents: 45000,
          currency: "usd",
          occurredAt: at(9, 1),
        },
        billingAccess: { ...summary({}).billingAccess, state: "active" },
      }),
      now,
    );
    expect(overview.title).toBe(
      `Your subscription is active and renews on ${formatLongDate(at(10, 1))}.`,
    );
    expect(overview.stats.map((stat) => [stat.label, stat.value, stat.detail])).toEqual([
      ["Seats in use", "32", "2 more than your paid seats."],
      ["Paid seats", "30", "The seats you're charged for each month."],
      ["Next renewal", formatShortDate(at(10, 1)), `${formatLongDate(at(10, 1))}.`],
      ["Last payment", "$450.00", `Paid on ${formatLongDate(at(9, 1))}.`],
    ]);
    expect(overview.action).toEqual({ kind: "portal", label: "Manage billing" });
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
    expect(overview.banner?.icon).toBe("calendar-x");
    expect(overview.action).toEqual({ kind: "portal", label: "Resume subscription" });
  });

  it("names the failed payment and the date the organization locks", () => {
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
    expect(overview.title).toBe(
      `Your payment of $450.00 on ${formatLongDate(at(9, 24))} didn't go through.`,
    );
    expect(overview.banner?.message).toBe(
      `Update your payment method by ${formatLongDate(at(9, 31))} to keep your organization open. If the payment still hasn't been made by then, your organization will be locked until it is.`,
    );
    expect(overview.visual).toMatchObject({ kind: "ring", value: 4, total: 7 });
    expect(overview.action).toEqual({ kind: "portal", label: "Update payment method" });
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
    expect(overview.banner?.message).toBe(
      "Your organization stays locked until a subscription is started. Your schedules, people, and settings are all kept.",
    );
    expect(overview.visual).toEqual({
      kind: "icon",
      icon: "locked",
      caption: "Organization locked",
      tone: "danger",
    });
  });

  it("offers no action while billing is paused", () => {
    const overview = describeBillingOverview(
      summary({
        status: "active",
        subscriptionSeats: 30,
        billingPausedAt: at(9, 20),
        billingAccess: { ...summary({}).billingAccess, state: "paused", reason: "billing_paused" },
      }),
      now,
    );
    expect(overview.action).toBeNull();
    expect(overview.banner?.message).toBe(
      `DubGrid Support paused billing on ${formatLongDate(at(9, 20))}. Your organization stays open, and you won't be charged while billing is paused.`,
    );
    expect(overview.stats.find((stat) => stat.key === "paused-for")?.value).toBe("7 days");
  });
});
