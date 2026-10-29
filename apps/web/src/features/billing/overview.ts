import type { OrganizationBillingSummary } from "@/types";
import { calendarDaysUntil, describeBillingStatus, type BillingTone } from "./trial-status";

export type BillingStatTone = BillingTone | "neutral";

export type BillingIconKey =
  | "pending"
  | "paused"
  | "locked"
  | "suspended"
  | "card"
  | "alarm"
  | "calendar-x"
  | "info"
  | "users"
  | "seat"
  | "clock"
  | "calendar"
  | "receipt"
  | "data"
  | "check"
  | "user-plus"
  | "user-minus";

export type BillingVisual =
  | { kind: "ring"; value: number; total: number; unit: string; caption: string; tone: BillingTone }
  | { kind: "icon"; icon: BillingIconKey; caption: string; tone: BillingStatTone };

export interface BillingTimelineStep {
  key: string;
  label: string;
  when: string;
  state: "done" | "now" | "upcoming";
  alert?: boolean;
}

export interface BillingBanner {
  tone: BillingTone;
  icon: BillingIconKey;
  message: string;
}

export interface BillingStat {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: BillingStatTone;
  icon: BillingIconKey;
}

export interface BillingAction {
  kind: "portal" | "checkout";
  label: string;
}

export interface BillingOverview {
  status: { label: string; tone: BillingTone };
  title: string;
  lead: string;
  visual: BillingVisual;
  timeline: BillingTimelineStep[];
  banner: BillingBanner | null;
  stats: BillingStat[];
  action: BillingAction | null;
}

type Summary = Pick<
  OrganizationBillingSummary,
  | "status"
  | "trialEndsAt"
  | "currentPeriodEnd"
  | "currentPeriodStart"
  | "cancelAt"
  | "canceledAt"
  | "subscriptionSeats"
  | "appUserCount"
  | "seatBreakdown"
  | "hasStripeCustomer"
  | "hasStripeSubscription"
  | "billingAccess"
  | "trialStartedAt"
  | "billingPausedAt"
  | "paymentGraceStartedAt"
  | "billingPolicy"
  | "lastPayment"
  | "outstandingPayment"
>;

const ENDING_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

function seats(count: number): string {
  return `${count} ${count === 1 ? "seat" : "seats"}`;
}

function addDays(iso: string, count: number): string {
  return new Date(new Date(iso).getTime() + count * DAY_MS).toISOString();
}

function daysBetween(from: string, to: string): number {
  return Math.max(1, calendarDaysUntil(new Date(to), new Date(from)));
}

/** What the difference between seats in use and paid seats means, or null before a subscription. */
export function describeSeatGap(seatsInUse: number, paidSeats: number | null): string | null {
  if (paidSeats == null) return null;
  const gap = seatsInUse - paidSeats;
  const sync =
    "DubGrid Support updates your paid seats to match the seats in use, and the change is prorated on your next invoice.";
  if (gap > 0) {
    return `${gap === 1 ? "1 seat in use isn't" : `${gap} seats in use aren't`} paid for yet. ${sync}`;
  }
  if (gap < 0) {
    return `You're paying for ${seats(-gap)} that nobody is using. ${sync}`;
  }
  return "Every seat in use is paid for, and you aren't paying for any unused seats.";
}

function seatsInUseStat(summary: Summary, detail: string): BillingStat {
  return {
    key: "in-use",
    label: "Seats in use",
    value: String(summary.appUserCount),
    detail,
    tone: "info",
    icon: "users",
  };
}

function paidSeatsStat(summary: Summary, detail: string): BillingStat | null {
  if (summary.subscriptionSeats == null) return null;
  return {
    key: "paid",
    label: "Paid seats",
    value: String(summary.subscriptionSeats),
    detail,
    tone: "info",
    icon: "seat",
  };
}

function lastPaymentStat(summary: Summary, noneDetail: string): BillingStat {
  const payment = summary.lastPayment;
  return payment
    ? {
        key: "last-payment",
        label: "Last payment",
        value: formatMoney(payment.amountCents, payment.currency),
        detail: `Paid on ${formatLongDate(payment.occurredAt)}.`,
        tone: "success",
        icon: "receipt",
      }
    : {
        key: "last-payment",
        label: "Last payment",
        value: "None",
        detail: noneDetail,
        tone: "neutral",
        icon: "receipt",
      };
}

function dataKeptStat(): BillingStat {
  return {
    key: "data",
    label: "Your data",
    value: "Kept",
    detail: "Schedules, people, and settings.",
    tone: "success",
    icon: "data",
  };
}

function todayStep(now: Date): BillingTimelineStep {
  return { key: "today", label: "Today", when: formatShortDate(now.toISOString()), state: "now" };
}

function portalOrCheckout(summary: Summary, portalLabel: string): BillingAction {
  return summary.hasStripeCustomer && summary.hasStripeSubscription
    ? { kind: "portal", label: portalLabel }
    : { kind: "checkout", label: "Start subscription" };
}

function compact(stats: Array<BillingStat | null>): BillingStat[] {
  return stats.filter((stat): stat is BillingStat => stat !== null);
}

function trialPending(summary: Summary, now: Date): Partial<BillingOverview> {
  const { trialDays, trialGraceDays } = summary.billingPolicy ?? {
    trialDays: 14,
    trialGraceDays: 3,
  };
  return {
    title: "Your free trial hasn't started yet.",
    lead: `Your ${trialDays}-day free trial begins the first time a Super Admin signs in. You won't be charged until you start a subscription.`,
    visual: { kind: "icon", icon: "pending", caption: "Trial not started", tone: "info" },
    timeline: [
      todayStep(now),
      { key: "starts", label: "Trial starts", when: "At first sign-in", state: "upcoming" },
      { key: "ends", label: "Trial ends", when: `${days(trialDays)} later`, state: "upcoming" },
      ...(trialGraceDays > 0
        ? [
            {
              key: "grace",
              label: "Grace period ends",
              when: `${days(trialGraceDays)} after that`,
              state: "upcoming" as const,
            },
          ]
        : []),
    ],
    stats: [
      seatsInUseStat(summary, "People who would take a seat if billing started today."),
      {
        key: "not-billed",
        label: "Not billed",
        value: String(
          (summary.seatBreakdown?.awayNotBilled ?? 0) + (summary.seatBreakdown?.archived ?? 0),
        ),
        detail: "People on staff who don't take a seat.",
        tone: "neutral",
        icon: "users",
      },
      {
        key: "trial-length",
        label: "Trial length",
        value: days(trialDays),
        detail:
          trialGraceDays > 0
            ? `Followed by ${days(trialGraceDays)} of grace.`
            : "There's no grace period after it.",
        tone: "info",
        icon: "clock",
      },
      lastPaymentStat(summary, "No payments have been made yet."),
    ],
    action: null,
  };
}

function trialRunning(summary: Summary, now: Date): Partial<BillingOverview> {
  const trialEndsAt = summary.trialEndsAt!;
  const left = Math.max(0, calendarDaysUntil(new Date(trialEndsAt), now));
  const graceDays = summary.billingPolicy?.trialGraceDays ?? 0;
  const total = summary.trialStartedAt
    ? daysBetween(summary.trialStartedAt, trialEndsAt)
    : Math.max(left, summary.billingPolicy?.trialDays ?? left);
  const ending = left <= ENDING_SOON_DAYS;
  const phrase =
    left === 0
      ? "today"
      : left === 1
        ? `tomorrow, ${formatLongDate(trialEndsAt)}`
        : `on ${formatLongDate(trialEndsAt)}`;
  const afterwards =
    graceDays > 0
      ? `If no subscription has been started by then, you'll have ${days(graceDays)} of grace before your organization is locked.`
      : "If no subscription has been started by then, your organization will be locked.";
  return {
    title: ending
      ? "Start a subscription to keep your organization open."
      : `Your free trial ends on ${formatLongDate(trialEndsAt)}.`,
    lead: ending
      ? `You won't be charged until the trial ends ${left === 0 ? "today" : `on ${formatLongDate(trialEndsAt)}`}.`
      : `That's ${days(left)} from today. You can start a subscription at any time, and you won't be charged until the trial ends.`,
    banner: ending
      ? {
          tone: "warning",
          icon: "alarm",
          message: `Your free trial ends ${phrase}. ${afterwards}`,
        }
      : null,
    visual: {
      kind: "ring",
      value: left,
      total,
      unit: left === 1 ? "day" : "days",
      caption: "Left in your free trial",
      tone: ending ? "warning" : "info",
    },
    timeline: [
      ...(summary.trialStartedAt
        ? [
            {
              key: "started",
              label: "Trial started",
              when: formatShortDate(summary.trialStartedAt),
              state: "done" as const,
            },
          ]
        : []),
      todayStep(now),
      { key: "ends", label: "Trial ends", when: formatShortDate(trialEndsAt), state: "upcoming" },
      ...(graceDays > 0
        ? [
            {
              key: "grace",
              label: "Grace period ends",
              when: formatShortDate(addDays(trialEndsAt, graceDays)),
              state: "upcoming" as const,
              alert: ending,
            },
          ]
        : []),
    ],
    stats: [
      seatsInUseStat(summary, "People who would take a seat if the trial ended today."),
      {
        key: "trial-left",
        label: "Trial days left",
        value: String(left),
        detail: `Out of the ${days(total)} in your trial.`,
        tone: ending ? "warning" : "info",
        icon: "clock",
      },
      {
        key: "trial-ends",
        label: "Trial ends",
        value: formatShortDate(trialEndsAt),
        detail: `${formatLongDate(trialEndsAt)}.`,
        tone: ending ? "warning" : "info",
        icon: "calendar",
      },
      lastPaymentStat(summary, "You won't be charged during the trial."),
    ],
    action: { kind: "checkout", label: "Start subscription" },
  };
}

function trialGrace(summary: Summary, now: Date): Partial<BillingOverview> {
  const graceEnds = summary.billingAccess.trialGraceEndsAt;
  const left = graceEnds ? Math.max(0, calendarDaysUntil(new Date(graceEnds), now)) : null;
  const graceDays = summary.billingPolicy?.trialGraceDays ?? left ?? 0;
  const endedOn = summary.trialEndsAt ? ` on ${formatLongDate(summary.trialEndsAt)}` : "";
  return {
    title: "Start a subscription to keep your organization open.",
    lead:
      left != null
        ? `You have ${days(left)} left before your organization is locked. Your schedules, people, and settings are kept either way.`
        : "Your schedules, people, and settings are kept either way.",
    banner: {
      tone: "danger",
      icon: "alarm",
      message: graceEnds
        ? `Your free trial ended${endedOn}. Start a subscription by ${formatLongDate(graceEnds)}, or your organization locks until you do.`
        : `Your free trial ended${endedOn}.`,
    },
    visual:
      left != null
        ? {
            kind: "ring",
            value: left,
            total: Math.max(graceDays, left, 1),
            unit: left === 1 ? "day" : "days",
            caption: "Left before your organization is locked",
            tone: "danger",
          }
        : { kind: "icon", icon: "alarm", caption: "Trial ended", tone: "danger" },
    timeline: [
      ...(summary.trialStartedAt
        ? [
            {
              key: "started",
              label: "Trial started",
              when: formatShortDate(summary.trialStartedAt),
              state: "done" as const,
            },
          ]
        : []),
      ...(summary.trialEndsAt
        ? [
            {
              key: "ended",
              label: "Trial ended",
              when: formatShortDate(summary.trialEndsAt),
              state: "done" as const,
            },
          ]
        : []),
      todayStep(now),
      ...(graceEnds
        ? [
            {
              key: "locks",
              label: "Organization locks",
              when: formatShortDate(graceEnds),
              state: "upcoming" as const,
              alert: true,
            },
          ]
        : []),
    ],
    stats: compact([
      seatsInUseStat(summary, "People who will take a seat when you subscribe."),
      left != null
        ? {
            key: "days-left",
            label: "Days left",
            value: String(left),
            detail: "Before your organization is locked.",
            tone: "danger",
            icon: "clock",
          }
        : null,
      graceEnds
        ? {
            key: "locks",
            label: "Locks on",
            value: formatShortDate(graceEnds),
            detail: `${formatLongDate(graceEnds)}.`,
            tone: "danger",
            icon: "calendar",
          }
        : null,
      lastPaymentStat(summary, "No payments have been made yet."),
    ]),
    action: { kind: "checkout", label: "Start subscription" },
  };
}

function periodStartFor(periodEnd: string): string {
  const end = new Date(periodEnd);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  return start.toISOString();
}

function active(summary: Summary, now: Date): Partial<BillingOverview> {
  const inUseDetail =
    summary.subscriptionSeats == null
      ? "People who take a seat right now."
      : summary.appUserCount > summary.subscriptionSeats
        ? `${summary.appUserCount - summary.subscriptionSeats} more than your paid seats.`
        : summary.appUserCount < summary.subscriptionSeats
          ? `${summary.subscriptionSeats - summary.appUserCount} fewer than your paid seats.`
          : "The same as your paid seats.";
  const stats = (third: BillingStat): BillingStat[] =>
    compact([
      {
        ...seatsInUseStat(summary, inUseDetail),
        tone:
          summary.subscriptionSeats != null && summary.appUserCount !== summary.subscriptionSeats
            ? "warning"
            : "info",
      },
      paidSeatsStat(summary, "The seats you're charged for each month."),
      third,
      lastPaymentStat(summary, "No payments have been recorded yet."),
    ]);

  if (summary.cancelAt) {
    const left = Math.max(0, calendarDaysUntil(new Date(summary.cancelAt), now));
    const periodStart = summary.currentPeriodStart ?? periodStartFor(summary.cancelAt);
    return {
      status: { label: `Ends ${formatShortDate(summary.cancelAt)}`, tone: "warning" },
      title: `Your subscription ends on ${formatLongDate(summary.cancelAt)}.`,
      lead: "You'll keep full access until then, and you won't be charged again.",
      banner: {
        tone: "warning",
        icon: "calendar-x",
        message: `Your subscription won't renew. To keep using the app after ${formatLongDate(summary.cancelAt)}, resume your subscription in the billing portal before that date.`,
      },
      visual: {
        kind: "ring",
        value: left,
        total: daysBetween(periodStart, summary.cancelAt),
        unit: left === 1 ? "day" : "days",
        caption: "Of access left before it ends",
        tone: "warning",
      },
      timeline: [
        {
          key: "period",
          label: "Period started",
          when: formatShortDate(periodStart),
          state: "done",
        },
        todayStep(now),
        {
          key: "ends",
          label: "Subscription ends",
          when: formatShortDate(summary.cancelAt),
          state: "upcoming",
          alert: true,
        },
      ],
      stats: stats({
        key: "access-ends",
        label: "Access ends",
        value: formatShortDate(summary.cancelAt),
        detail: `${formatLongDate(summary.cancelAt)}.`,
        tone: "warning",
        icon: "calendar",
      }),
      action: portalOrCheckout(summary, "Resume subscription"),
    };
  }

  const renews = summary.currentPeriodEnd;
  if (!renews) {
    return {
      title: "Your subscription is active.",
      lead: "Your payments are collected automatically each month.",
      visual: { kind: "icon", icon: "card", caption: "Subscription active", tone: "success" },
      timeline: [],
      stats: stats(dataKeptStat()),
      action: portalOrCheckout(summary, "Manage billing"),
    };
  }
  const left = Math.max(0, calendarDaysUntil(new Date(renews), now));
  const periodStart = summary.currentPeriodStart ?? periodStartFor(renews);
  return {
    title: `Your subscription is active and renews on ${formatLongDate(renews)}.`,
    lead: "Your next payment is collected automatically on that date for your paid seats.",
    visual: {
      kind: "ring",
      value: left,
      total: daysBetween(periodStart, renews),
      unit: left === 1 ? "day" : "days",
      caption: "Until your subscription renews",
      tone: "success",
    },
    timeline: [
      { key: "period", label: "Period started", when: formatShortDate(periodStart), state: "done" },
      todayStep(now),
      { key: "renews", label: "Renews", when: formatShortDate(renews), state: "upcoming" },
    ],
    stats: stats({
      key: "renews",
      label: "Next renewal",
      value: formatShortDate(renews),
      detail: `${formatLongDate(renews)}.`,
      tone: "success",
      icon: "calendar",
    }),
    action: portalOrCheckout(summary, "Manage billing"),
  };
}

function paymentNeeded(summary: Summary, now: Date): Partial<BillingOverview> {
  const due = summary.outstandingPayment;
  const locksAt = summary.billingAccess.paymentGraceEndsAt ?? null;
  const left = locksAt ? Math.max(0, calendarDaysUntil(new Date(locksAt), now)) : null;
  const failedAt = summary.paymentGraceStartedAt ?? due?.occurredAt ?? null;
  return {
    status: { label: "Payment needed", tone: "danger" },
    title: due
      ? `Your payment of ${formatMoney(due.amountCents, due.currency)} on ${formatLongDate(due.occurredAt)} didn't go through.`
      : "Your latest payment didn't go through.",
    lead: "The payment provider retries the charge automatically. Updating your payment method retries it right away.",
    banner: {
      tone: "danger",
      icon: "card",
      message: locksAt
        ? `Update your payment method by ${formatLongDate(locksAt)} to keep your organization open. If the payment still hasn't been made by then, your organization will be locked until it is.`
        : "Update your payment method to keep your organization open.",
    },
    visual:
      left != null
        ? {
            kind: "ring",
            value: left,
            total: Math.max(summary.billingPolicy?.paymentGraceDays ?? left, left, 1),
            unit: left === 1 ? "day" : "days",
            caption: "Left to make the payment",
            tone: "danger",
          }
        : { kind: "icon", icon: "card", caption: "Payment needed", tone: "danger" },
    timeline: [
      ...(failedAt
        ? [
            {
              key: "failed",
              label: "Payment failed",
              when: formatShortDate(failedAt),
              state: "done" as const,
              alert: true,
            },
          ]
        : []),
      todayStep(now),
      ...(locksAt
        ? [
            {
              key: "locks",
              label: "Organization locks",
              when: formatShortDate(locksAt),
              state: "upcoming" as const,
              alert: true,
            },
          ]
        : []),
    ],
    stats: compact([
      seatsInUseStat(summary, "People who take a seat right now."),
      due
        ? {
            key: "due",
            label: "Amount due",
            value: formatMoney(due.amountCents, due.currency),
            detail: `Due since ${formatLongDate(due.occurredAt)}.`,
            tone: "danger",
            icon: "card",
          }
        : paidSeatsStat(summary, "The seats you're charged for each month."),
      left != null
        ? {
            key: "days-left",
            label: "Days to pay",
            value: String(left),
            detail: `Your organization locks on ${formatLongDate(locksAt!)}.`,
            tone: "danger",
            icon: "clock",
          }
        : null,
      { ...lastPaymentStat(summary, "No payments have been recorded yet."), tone: "neutral" },
    ]),
    action: portalOrCheckout(summary, "Update payment method"),
  };
}

function locked(summary: Summary, now: Date): Partial<BillingOverview> {
  const { reason, trialGraceEndsAt } = summary.billingAccess;
  const kept = "Your schedules, people, and settings are all kept.";
  const base = {
    visual: {
      kind: "icon",
      icon: "locked",
      caption: "Organization locked",
      tone: "danger",
    } as const,
    stats: compact([
      seatsInUseStat(summary, "People who will take a seat when you subscribe."),
      paidSeatsStat(summary, "The seats on your subscription."),
      dataKeptStat(),
      lastPaymentStat(summary, "No payments have been made yet."),
    ]).slice(0, 4),
  };

  if (reason === "trial_expired") {
    const lockedAt = trialGraceEndsAt ?? summary.trialEndsAt;
    return {
      ...base,
      title: "Your organization is locked because the free trial ended without a subscription.",
      lead: summary.trialEndsAt
        ? `Your free trial ended on ${formatLongDate(summary.trialEndsAt)}${
            trialGraceEndsAt
              ? `, and the grace period ended on ${formatLongDate(trialGraceEndsAt)}`
              : ""
          }.`
        : "Your free trial ended without a subscription.",
      banner: {
        tone: "danger",
        icon: "locked",
        message: `Your organization stays locked until a subscription is started. ${kept}`,
      },
      timeline: [
        ...(summary.trialStartedAt
          ? [
              {
                key: "started",
                label: "Trial started",
                when: formatShortDate(summary.trialStartedAt),
                state: "done" as const,
              },
            ]
          : []),
        ...(summary.trialEndsAt && trialGraceEndsAt
          ? [
              {
                key: "ended",
                label: "Trial ended",
                when: formatShortDate(summary.trialEndsAt),
                state: "done" as const,
              },
            ]
          : []),
        ...(lockedAt
          ? [
              {
                key: "locked",
                label: "Organization locked",
                when: formatShortDate(lockedAt),
                state: "done" as const,
                alert: true,
              },
            ]
          : []),
        todayStep(now),
      ],
      action: { kind: "checkout", label: "Start subscription" },
    };
  }

  if (reason === "payment_grace_expired") {
    const due = summary.outstandingPayment;
    return {
      ...base,
      title: "Your organization is locked because a payment is overdue.",
      lead: due
        ? `The payment of ${formatMoney(due.amountCents, due.currency)} from ${formatLongDate(due.occurredAt)} still hasn't been made.`
        : "A payment still hasn't been made.",
      banner: {
        tone: "danger",
        icon: "locked",
        message: `Update your payment method to reopen your organization. ${kept}`,
      },
      timeline: [
        ...(summary.paymentGraceStartedAt
          ? [
              {
                key: "failed",
                label: "Payment failed",
                when: formatShortDate(summary.paymentGraceStartedAt),
                state: "done" as const,
                alert: true,
              },
            ]
          : []),
        todayStep(now),
      ],
      action: portalOrCheckout(summary, "Update payment method"),
    };
  }

  return {
    ...base,
    title: "Your organization is locked because the subscription has ended.",
    lead: summary.canceledAt
      ? `The subscription was canceled on ${formatLongDate(summary.canceledAt)}.`
      : "The subscription is no longer active.",
    banner: {
      tone: "danger",
      icon: "locked",
      message: `Start a new subscription to reopen your organization. ${kept}`,
    },
    timeline: [
      ...(summary.canceledAt
        ? [
            {
              key: "ended",
              label: "Subscription ended",
              when: formatShortDate(summary.canceledAt),
              state: "done" as const,
              alert: true,
            },
          ]
        : []),
      todayStep(now),
    ],
    action: portalOrCheckout(summary, "Update payment method"),
  };
}

function paused(summary: Summary, now: Date): Partial<BillingOverview> {
  const pausedAt = summary.billingPausedAt;
  const pausedFor = pausedAt ? Math.max(0, -calendarDaysUntil(new Date(pausedAt), now)) : null;
  const trialLeft = summary.billingAccess.daysUntilTrialEnd;
  const inTrial = !summary.status || summary.status === "trialing";
  const trialNote =
    inTrial && trialLeft != null && trialLeft > 0
      ? " Your trial days don't count down while it's paused."
      : "";
  return {
    title: "Billing for your organization is paused.",
    lead: "If you have questions about the pause, contact DubGrid Support.",
    banner: {
      tone: "info",
      icon: "paused",
      message: `${
        pausedAt
          ? `DubGrid Support paused billing on ${formatLongDate(pausedAt)}.`
          : "DubGrid Support paused billing."
      } Your organization stays open, and you won't be charged while billing is paused.${trialNote}`,
    },
    visual: { kind: "icon", icon: "paused", caption: "Billing paused", tone: "info" },
    timeline: [
      ...(pausedAt
        ? [
            {
              key: "paused",
              label: "Billing paused",
              when: formatShortDate(pausedAt),
              state: "done" as const,
            },
          ]
        : []),
      todayStep(now),
      {
        key: "resumes",
        label: "Billing resumes",
        when: "When DubGrid Support resumes it",
        state: "upcoming",
      },
    ],
    stats: compact([
      seatsInUseStat(summary, "People who take a seat right now."),
      inTrial && trialLeft != null && trialLeft > 0
        ? {
            key: "trial-left",
            label: "Trial days left",
            value: String(trialLeft),
            detail: "They don't count down while billing is paused.",
            tone: "info",
            icon: "clock",
          }
        : paidSeatsStat(summary, "Kept while billing is paused."),
      pausedFor != null
        ? {
            key: "paused-for",
            label: "Paused for",
            value: days(pausedFor),
            detail: `Since ${formatLongDate(pausedAt!)}.`,
            tone: "neutral",
            icon: "paused",
          }
        : null,
      { ...lastPaymentStat(summary, "No payments have been made yet."), tone: "neutral" },
    ]),
    action: null,
  };
}

function suspended(summary: Summary): Partial<BillingOverview> {
  return {
    title: "Your organization is suspended.",
    lead: "Contact DubGrid Support to find out why and what happens next.",
    visual: { kind: "icon", icon: "suspended", caption: "Organization suspended", tone: "danger" },
    timeline: [],
    stats: compact([
      seatsInUseStat(summary, "People who take a seat right now."),
      paidSeatsStat(summary, "The seats on your subscription."),
      dataKeptStat(),
      lastPaymentStat(summary, "No payments have been made yet."),
    ]).slice(0, 4),
    action: null,
  };
}

/** Everything the billing page's overview says for the organization's current state. */
export function describeBillingOverview(summary: Summary, now: Date = new Date()): BillingOverview {
  const status = describeBillingStatus(summary, now);
  const { state } = summary.billingAccess;
  const part =
    state === "trial_pending"
      ? trialPending(summary, now)
      : (state === "trialing" || state === "trial_ending_soon") && summary.trialEndsAt
        ? trialRunning(summary, now)
        : state === "trial_grace"
          ? trialGrace(summary, now)
          : state === "active"
            ? active(summary, now)
            : state === "payment_attention_required"
              ? paymentNeeded(summary, now)
              : state === "locked"
                ? locked(summary, now)
                : state === "paused"
                  ? paused(summary, now)
                  : state === "suspended"
                    ? suspended(summary)
                    : {
                        title: "Your subscription needs attention.",
                        lead: "Open the billing portal to see what's needed.",
                        visual: {
                          kind: "icon" as const,
                          icon: "info" as const,
                          caption: status.label,
                          tone: status.tone,
                        },
                        timeline: [],
                        stats: compact([
                          seatsInUseStat(summary, "People who take a seat right now."),
                          paidSeatsStat(summary, "The seats you're charged for each month."),
                          lastPaymentStat(summary, "No payments have been recorded yet."),
                        ]),
                        action: portalOrCheckout(summary, "Manage billing"),
                      };
  return {
    status: part.status ?? status,
    title: part.title ?? "",
    lead: part.lead ?? "",
    visual: part.visual ?? { kind: "icon", icon: "info", caption: status.label, tone: status.tone },
    timeline: part.timeline ?? [],
    banner: part.banner ?? null,
    stats: part.stats ?? [],
    action: part.action ?? null,
  };
}
