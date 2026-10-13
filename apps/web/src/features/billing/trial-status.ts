import type { BillingAccessResult } from "@dubgrid/domain";
import { formatBillingStatusLabel } from "@/lib/client-facing";

/**
 * Blue while a trial runs, amber once it ends within a week, red once access
 * is at risk or gone, green when paid.
 */
export type BillingTone = "success" | "info" | "warning" | "danger";

export interface BillingToneColors {
  bg: string;
  border: string;
  text: string;
}

// Text uses the *-text tokens: the base hues fall below 4.5:1 on their tinted
// fills in light mode (amber is 2.1:1).
const TONE_COLORS: Record<BillingTone, BillingToneColors> = {
  success: {
    bg: "var(--dg-color-success-bg)",
    border: "var(--dg-color-success-border)",
    text: "var(--dg-color-success-text)",
  },
  info: {
    bg: "var(--dg-color-info-bg)",
    border: "var(--dg-color-info-border)",
    text: "var(--dg-color-info-text)",
  },
  warning: {
    bg: "var(--dg-color-warning-bg)",
    border: "var(--dg-color-warning-border)",
    text: "var(--dg-color-warning-text)",
  },
  danger: {
    bg: "var(--dg-color-danger-bg)",
    border: "var(--dg-color-danger-border)",
    text: "var(--dg-color-danger-text)",
  },
};

export function billingToneColors(tone: BillingTone): BillingToneColors {
  return TONE_COLORS[tone];
}

export interface BillingStateInput {
  status: string | null;
  trialEndsAt: string | null;
  billingAccess: Pick<BillingAccessResult, "state" | "reason" | "trialGraceEndsAt"> &
    Partial<Pick<BillingAccessResult, "daysUntilTrialEnd">>;
}

const ENDING_SOON_DAYS = 7;

/**
 * Calendar days from `now` to `target` in the viewer's time zone: 0 is today,
 * 1 is tomorrow. A trial ending in two hours ends today, not "in 1 day".
 */
export function calendarDaysUntil(target: Date, now: Date = new Date()): number {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000);
}

export function formatBillingDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isTrialRunning(input: BillingStateInput) {
  const { state } = input.billingAccess;
  return (state === "trialing" || state === "trial_ending_soon") && Boolean(input.trialEndsAt);
}

function trialDaysLeft(input: BillingStateInput, now: Date): number | null {
  if (!isTrialRunning(input)) return null;
  return Math.max(0, calendarDaysUntil(new Date(input.trialEndsAt!), now));
}

function trialEndsPhrase(days: number, trialEndsAt: string): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `on ${formatBillingDate(trialEndsAt)}`;
}

/** The organization's billing status as its own admins see it. */
export function describeBillingStatus(
  input: BillingStateInput,
  now: Date = new Date(),
): { label: string; tone: BillingTone } {
  const { state, reason } = input.billingAccess;
  switch (state) {
    case "active":
      return { label: "Active", tone: "success" };
    case "trial_pending":
      return { label: "Trial not started", tone: "info" };
    case "trialing":
    case "trial_ending_soon": {
      const days = trialDaysLeft(input, now);
      return days != null && days <= ENDING_SOON_DAYS
        ? { label: "Trial ending soon", tone: "warning" }
        : { label: "Free trial", tone: "info" };
    }
    case "trial_grace":
      return { label: "Trial ended", tone: "danger" };
    case "locked":
      return reason === "trial_expired"
        ? { label: "Trial expired", tone: "danger" }
        : { label: formatBillingStatusLabel(input.status), tone: "danger" };
    case "suspended":
      return { label: "Suspended", tone: "danger" };
    case "paused":
      return { label: "Billing paused", tone: "info" };
    default:
      return { label: formatBillingStatusLabel(input.status), tone: "warning" };
  }
}

export interface HeaderBillingNotice {
  label: string;
  compactLabel: string;
  ariaLabel: string;
  tone: BillingTone;
}

/** The header pill linking a Super Admin to billing; null when there is nothing to say. */
export function describeHeaderBillingNotice(
  input: BillingStateInput,
  now: Date = new Date(),
): HeaderBillingNotice | null {
  const { state, reason, trialGraceEndsAt } = input.billingAccess;

  if (state === "suspended") {
    return {
      label: "Organization suspended",
      compactLabel: "Suspended",
      ariaLabel: "Organization suspended",
      tone: "danger",
    };
  }
  if (state === "locked") {
    return reason === "trial_expired"
      ? {
          label: "Trial expired",
          compactLabel: "Expired",
          ariaLabel: "Trial expired. Add a payment method to reopen your organization.",
          tone: "danger",
        }
      : {
          label: "Billing on hold",
          compactLabel: "On hold",
          ariaLabel: "Billing on hold. Update your payment details to reopen your organization.",
          tone: "danger",
        };
  }
  if (state === "payment_attention_required") {
    return {
      label: "Update payment",
      compactLabel: "Billing",
      ariaLabel: "Billing needs attention. Update your payment details.",
      tone: "warning",
    };
  }
  if (state === "trial_grace") {
    const by = trialGraceEndsAt ? ` by ${formatBillingDate(trialGraceEndsAt)}` : "";
    return {
      label: "Trial ended",
      compactLabel: "Ended",
      ariaLabel: `Trial ended. Add a payment method${by} to keep your organization open.`,
      tone: "danger",
    };
  }
  if (state === "trial_pending") {
    return {
      label: "Trial not started",
      compactLabel: "Trial",
      ariaLabel: "Trial not started",
      tone: "info",
    };
  }

  const days = trialDaysLeft(input, now);
  if (days == null) return null;
  const tone: BillingTone = days <= ENDING_SOON_DAYS ? "warning" : "info";
  if (days === 0) {
    return {
      label: "Trial ends today",
      compactLabel: "Ends today",
      ariaLabel: "Trial ends today",
      tone,
    };
  }
  if (days === 1) {
    return {
      label: "Trial ends tomorrow",
      compactLabel: "Tomorrow",
      ariaLabel: "Trial ends tomorrow",
      tone,
    };
  }
  return {
    label: `Trial ends in ${days} days`,
    compactLabel: `Trial ${days}d`,
    ariaLabel: `Trial ends in ${days} days`,
    tone,
  };
}

/** The notice above the billing actions; null while nothing needs the admin's attention. */
export function describeBillingNotice(
  input: BillingStateInput,
  now: Date = new Date(),
): { message: string; tone: BillingTone } | null {
  const { state, reason, trialGraceEndsAt } = input.billingAccess;
  const endedOn = input.trialEndsAt ? ` on ${formatBillingDate(input.trialEndsAt)}` : "";

  switch (state) {
    case "trialing":
    case "trial_ending_soon": {
      const days = trialDaysLeft(input, now);
      if (days == null || days > ENDING_SOON_DAYS) return null;
      return {
        message: `Your free trial ends ${trialEndsPhrase(days, input.trialEndsAt!)}. Add a payment method to keep your organization open.`,
        tone: "warning",
      };
    }
    case "trial_grace": {
      const by = trialGraceEndsAt ? ` by ${formatBillingDate(trialGraceEndsAt)}` : "";
      return {
        message: `Your free trial ended${endedOn}. Add a payment method${by} to keep your organization open.`,
        tone: "danger",
      };
    }
    case "locked":
      return reason === "trial_expired"
        ? {
            message: `Your free trial ended${endedOn}, so your organization is on hold. Add a payment method to reopen it.`,
            tone: "danger",
          }
        : {
            message:
              "Your organization is on hold until billing is restored. Update your payment details to reopen it.",
            tone: "danger",
          };
    case "payment_attention_required":
      return {
        message:
          "Billing needs attention. Update your payment details to keep your organization open.",
        tone: "warning",
      };
    case "suspended":
      return {
        message: "Your organization is suspended. Contact DubGrid Support for help.",
        tone: "danger",
      };
    case "paused":
      return { message: pausedNotice(input), tone: "info" };
    default:
      return null;
  }
}

function pausedNotice(input: BillingStateInput): string {
  if (input.status && input.status !== "trialing") {
    return "Billing is paused. Your organization stays open, and you won't be charged while it's paused.";
  }
  const days = input.billingAccess.daysUntilTrialEnd;
  if (days == null) return "Billing is paused, and your organization stays open.";
  return days > 0
    ? "Billing is paused. Your organization stays open, and your trial days don't count down while it's paused."
    : "Billing is paused. Your organization stays open, and your days to add billing don't count down while it's paused.";
}

export interface TrialMetric {
  key: string;
  label: string;
  value: string;
  tone?: BillingTone;
}

/** The trial cards on the billing page, in display order. */
export function describeTrialMetrics(
  input: BillingStateInput,
  now: Date = new Date(),
): TrialMetric[] {
  const { state, reason, trialGraceEndsAt, daysUntilTrialEnd } = input.billingAccess;
  if (!input.trialEndsAt) return [];
  const trialEnds = formatBillingDate(input.trialEndsAt);

  // The end date moves when billing resumes, so a paused trial shows only the
  // days it has left.
  if (state === "paused") {
    if (daysUntilTrialEnd == null || daysUntilTrialEnd <= 0) return [];
    return [
      {
        key: "trial-time-left",
        label: "Trial time left",
        value: `${daysUntilTrialEnd === 1 ? "1 day" : `${daysUntilTrialEnd} days`}, paused`,
      },
    ];
  }

  const days = trialDaysLeft(input, now);
  if (days != null) {
    return [
      {
        key: "trial-time-left",
        label: "Trial time left",
        value: days === 0 ? "Ends today" : days === 1 ? "1 day" : `${days} days`,
        tone: days <= ENDING_SOON_DAYS ? "warning" : undefined,
      },
      { key: "trial-ends", label: "Trial ends", value: trialEnds },
    ];
  }

  if (state === "trial_grace") {
    return [
      { key: "trial-ended", label: "Trial ended", value: trialEnds },
      ...(trialGraceEndsAt
        ? [
            {
              key: "access-ends",
              label: "Access ends",
              value: formatBillingDate(trialGraceEndsAt),
              tone: "danger" as const,
            },
          ]
        : []),
    ];
  }

  if (state === "locked" && reason === "trial_expired") {
    return [{ key: "trial-ended", label: "Trial ended", value: trialEnds }];
  }

  return [];
}

/** Billed seats minus billable users, said the way an admin reads it. */
export function describeSeatDifference(seatDelta: number): string {
  if (seatDelta < 0) return `${-seatDelta} without a seat`;
  if (seatDelta > 0) return `${seatDelta} unused`;
  return "None";
}
