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
    Partial<Pick<BillingAccessResult, "daysUntilTrialEnd" | "paymentGraceEndsAt">>;
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
