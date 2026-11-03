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

export interface BillingAction {
  kind: "portal" | "checkout";
  label: string;
}

/**
 * The billing page's overview card. Each fact appears once: dates and
 * countdowns live in the ring and the timeline, so the title and lead say
 * what it means and what to do.
 */
export interface BillingOverview {
  status: { label: string; tone: BillingTone };
  title: string;
  lead: string;
  visual: BillingVisual;
  timeline: BillingTimelineStep[];
  action: BillingAction | null;
  /** Show "billed monthly for each seat" while there's no subscription yet. */
  pricingNote: boolean;
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
const DATA_KEPT = "Your schedules, people, and settings are all kept.";

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
    "We update your paid seats to match the seats in use, and the change is prorated on your next invoice.";
  if (gap > 0) {
    return `${gap === 1 ? "1 seat in use isn't" : `${gap} seats in use aren't`} paid for yet. ${sync}`;
  }
  if (gap < 0) {
    return `You're paying for ${seats(-gap)} that nobody is using. ${sync}`;
  }
  return "Every seat in use is paid for, and you aren't paying for any unused seats.";
}

function todayStep(now: Date): BillingTimelineStep {
  return { key: "today", label: "Today", when: formatShortDate(now.toISOString()), state: "now" };
}

function portalOrCheckout(summary: Summary, portalLabel: string): BillingAction {
  return summary.hasStripeCustomer && summary.hasStripeSubscription
    ? { kind: "portal", label: portalLabel }
    : { kind: "checkout", label: "Start subscription" };
}

function reopenWith(action: BillingAction): string {
  return action.kind === "portal"
    ? "Update your payment method to open it again."
    : "Start a subscription to open it again.";
}

function trialPending(summary: Summary, now: Date): Partial<BillingOverview> {
  const { trialDays, trialGraceDays } = summary.billingPolicy ?? {
    trialDays: 14,
    trialGraceDays: 3,
  };
  return {
    title: "Your free trial hasn't started yet.",
    lead: "It begins the first time a Super Admin signs in. You won't be charged until you start a subscription.",
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
  return {
    title: ending
      ? "Start a subscription to keep your organization open."
      : "Your free trial is running.",
    lead: ending
      ? `You won't be charged until the trial ends. Without a subscription, your organization locks ${
          graceDays > 0 ? "once the grace period ends" : "when it does"
        }.`
      : "You can start a subscription at any time, and you won't be charged until the trial ends.",
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
    action: { kind: "checkout", label: "Start subscription" },
  };
}

function trialGrace(summary: Summary, now: Date): Partial<BillingOverview> {
  const graceEnds = summary.billingAccess.trialGraceEndsAt;
  const left = graceEnds ? Math.max(0, calendarDaysUntil(new Date(graceEnds), now)) : null;
  const graceDays = summary.billingPolicy?.trialGraceDays ?? left ?? 0;
  return {
    title: "Start a subscription to keep your organization open.",
    lead: "Your free trial has ended. Your schedules, people, and settings are kept either way.",
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
  if (summary.cancelAt) {
    const left = Math.max(0, calendarDaysUntil(new Date(summary.cancelAt), now));
    const periodStart = summary.currentPeriodStart ?? periodStartFor(summary.cancelAt);
    return {
      status: { label: `Ends ${formatShortDate(summary.cancelAt)}`, tone: "warning" },
      title: "Your subscription won't renew.",
      lead: "You keep full access until it ends, and you won't be charged again. Resume it before then to keep using the app.",
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
      action: portalOrCheckout(summary, "Resume subscription"),
    };
  }

  const renews = summary.currentPeriodEnd;
  if (!renews) {
    return {
      title: "Your subscription is active.",
      lead: "Payments are collected automatically each month for your paid seats.",
      visual: { kind: "icon", icon: "card", caption: "Subscription active", tone: "success" },
      timeline: [],
      action: portalOrCheckout(summary, "Manage billing"),
    };
  }
  const left = Math.max(0, calendarDaysUntil(new Date(renews), now));
  const periodStart = summary.currentPeriodStart ?? periodStartFor(renews);
  return {
    title: "Your subscription is active.",
    lead: "Payments are collected automatically each month for your paid seats.",
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
      ? `Your payment of ${formatMoney(due.amountCents, due.currency)} didn't go through.`
      : "Your latest payment didn't go through.",
    lead: `The payment provider retries it automatically, and updating your payment method retries it right away.${
      locksAt ? " If it still isn't paid, your organization locks until it is." : ""
    }`,
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
    action: portalOrCheckout(summary, "Update payment method"),
  };
}

function locked(summary: Summary, now: Date): Partial<BillingOverview> {
  const { reason, trialGraceEndsAt } = summary.billingAccess;
  const visual = {
    kind: "icon",
    icon: "locked",
    caption: "Organization locked",
    tone: "danger",
  } as const;

  if (reason === "trial_expired") {
    const lockedAt = trialGraceEndsAt ?? summary.trialEndsAt;
    return {
      visual,
      title: "Your organization is locked because the free trial ended without a subscription.",
      lead: `${DATA_KEPT} Start a subscription to open it again.`,
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
    const action = portalOrCheckout(summary, "Update payment method");
    return {
      visual,
      title: "Your organization is locked because a payment is overdue.",
      lead: `${
        due
          ? `The payment of ${formatMoney(due.amountCents, due.currency)} still hasn't been made.`
          : "A payment still hasn't been made."
      } ${DATA_KEPT} ${reopenWith(action)}`,
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
      action,
    };
  }

  const action = portalOrCheckout(summary, "Update payment method");
  return {
    visual,
    title: "Your organization is locked because the subscription has ended.",
    lead: `${DATA_KEPT} ${reopenWith(action)}`,
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
    action,
  };
}

function paused(summary: Summary, now: Date): Partial<BillingOverview> {
  const pausedAt = summary.billingPausedAt;
  const trialLeft = summary.billingAccess.daysUntilTrialEnd;
  const inTrial = !summary.status || summary.status === "trialing";
  return {
    title: "Billing for your organization is paused.",
    lead: `${
      inTrial && trialLeft != null && trialLeft > 0
        ? "Your organization stays open, you won't be charged, and your trial days don't count down while it's paused."
        : "Your organization stays open, and you won't be charged while it's paused."
    } If you have questions, contact us.`,
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
        when: "When we resume it",
        state: "upcoming",
      },
    ],
    action: null,
  };
}

function suspended(): Partial<BillingOverview> {
  return {
    title: "Your organization is suspended.",
    lead: "Contact us to find out why and what happens next.",
    visual: { kind: "icon", icon: "suspended", caption: "Organization suspended", tone: "danger" },
    timeline: [],
    action: null,
  };
}

function needsAttention(
  summary: Summary,
  status: BillingOverview["status"],
): Partial<BillingOverview> {
  return {
    title: "Your subscription needs attention.",
    lead: "Open the billing portal to see what's needed.",
    visual: { kind: "icon", icon: "info", caption: status.label, tone: status.tone },
    timeline: [],
    action: portalOrCheckout(summary, "Manage billing"),
  };
}

function describeState(
  summary: Summary,
  now: Date,
  status: BillingOverview["status"],
): Partial<BillingOverview> {
  switch (summary.billingAccess.state) {
    case "trial_pending":
      return trialPending(summary, now);
    case "trialing":
    case "trial_ending_soon":
      return summary.trialEndsAt ? trialRunning(summary, now) : needsAttention(summary, status);
    case "trial_grace":
      return trialGrace(summary, now);
    case "active":
      return active(summary, now);
    case "payment_attention_required":
      return paymentNeeded(summary, now);
    case "locked":
      return locked(summary, now);
    case "paused":
      return paused(summary, now);
    case "suspended":
      return suspended();
    default:
      return needsAttention(summary, status);
  }
}

/** Everything the billing page's overview says for the organization's current state. */
export function describeBillingOverview(summary: Summary, now: Date = new Date()): BillingOverview {
  const status = describeBillingStatus(summary, now);
  const part = describeState(summary, now, status);
  return {
    status: part.status ?? status,
    title: part.title ?? "",
    lead: part.lead ?? "",
    visual: part.visual ?? { kind: "icon", icon: "info", caption: status.label, tone: status.tone },
    timeline: part.timeline ?? [],
    action: part.action ?? null,
    pricingNote: !summary.hasStripeSubscription && summary.billingAccess.state !== "suspended",
  };
}
