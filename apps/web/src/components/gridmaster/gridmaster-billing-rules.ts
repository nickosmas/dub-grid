import {
  evaluateOrganizationBillingAccess,
  type BillingPolicyKey,
  type TrialControls,
} from "@dubgrid/domain";
import type { GridmasterBillingOrgSummary } from "@/types";

export const OVERRIDE_REASON_MAX_LENGTH = 500;

/** What overriding to `status` does to the organization, said before it happens. */
export function describeOverrideOutcome(
  org: Pick<GridmasterBillingOrgSummary, "trialEndsAt" | "stripeSubscriptionId"> & {
    policy?: GridmasterBillingOrgSummary["policy"];
  },
  status: string,
  now: Date = new Date(),
): string[] {
  const access = evaluateOrganizationBillingAccess({
    subscriptionStatus: status,
    trialEndsAt: org.trialEndsAt,
    now,
    trialGraceDays: org.policy?.values.trialGraceDays,
    trialAdminNoticeDays: org.policy?.values.trialReminderDays,
  });
  const lines: string[] = [];
  if (access.isLocked) {
    lines.push("The organization locks. Members can't use it until billing changes again.");
  } else if (access.state === "active") {
    lines.push("The organization stays open with full access, without a payment.");
  } else if (access.state === "payment_attention_required") {
    lines.push("The organization stays open, and its Super Admins are asked to update payment.");
  } else if (access.state === "trial_pending") {
    lines.push("The trial hasn't started. It starts the next time a Super Admin signs in.");
  } else if (access.state === "trial_grace") {
    lines.push(
      "The trial has already ended, so the organization stays open only until its grace period runs out.",
    );
  } else {
    lines.push("The organization stays open on its trial. The trial end date doesn't change.");
  }
  if (org.stripeSubscriptionId) {
    lines.push("Stripe's next update for this subscription replaces this override.");
  }
  return lines;
}

export type StripeBillingAction = "sync" | "trueUp" | "cancelAtPeriodEnd" | "cancel";

export const STRIPE_ACTION_LABELS: Record<StripeBillingAction, string> = {
  sync: "Sync Stripe",
  trueUp: "True up seats",
  cancelAtPeriodEnd: "Cancel at period end",
  cancel: "Cancel",
};

export interface BillingActionState {
  enabled: boolean;
  /** Why the action is off; null when it is available. */
  reason: string | null;
}

const NO_CUSTOMER = "No Stripe customer yet.";
const NO_SUBSCRIPTION = "No Stripe subscription.";
const ALREADY_CANCELED = "The subscription is already canceled.";

function state(reason: string | null): BillingActionState {
  return { enabled: reason === null, reason };
}

/** Whether each Stripe action applies to an organization, and why not when it doesn't. */
export function billingActionStates(
  org: Pick<
    GridmasterBillingOrgSummary,
    "status" | "stripeCustomerId" | "stripeSubscriptionId" | "cancelAt" | "seats" | "appUsers"
  >,
): Record<StripeBillingAction, BillingActionState> {
  const canceled = org.status === "canceled";
  const subscriptionReason = !org.stripeSubscriptionId
    ? NO_SUBSCRIPTION
    : canceled
      ? ALREADY_CANCELED
      : null;
  // The server never bills fewer than one seat.
  const seatsMatch = org.seats === Math.max(org.appUsers, 1);
  return {
    sync: state(org.stripeCustomerId ? null : NO_CUSTOMER),
    trueUp: state(
      subscriptionReason ?? (seatsMatch ? "Stripe seats already match app users." : null),
    ),
    cancelAtPeriodEnd: state(
      subscriptionReason ?? (org.cancelAt ? "A cancellation is already scheduled." : null),
    ),
    cancel: state(subscriptionReason),
  };
}

/** Labels grouped under each reason they share, for one line per reason. */
export function summarizeReasons(entries: Array<[label: string, reason: string | null]>): string[] {
  const byReason = new Map<string, string[]>();
  for (const [label, reason] of entries) {
    if (!reason) continue;
    byReason.set(reason, [...(byReason.get(reason) ?? []), label]);
  }
  return [...byReason].map(([reason, labels]) => `${labels.join(", ")}: ${reason}`);
}

/** Disabled Stripe actions grouped by their reason. */
export function disabledActionSummary(
  states: Record<StripeBillingAction, BillingActionState>,
): string[] {
  return summarizeReasons(
    (Object.keys(states) as StripeBillingAction[]).map((action) => [
      STRIPE_ACTION_LABELS[action],
      states[action].reason,
    ]),
  );
}

/** Why each trial action is off; the shared trial rule only names the paying and Stripe cases. */
export function trialActionReasons(trial: TrialControls): {
  change: string | null;
  /** The End trial button, available while either way of ending applies. */
  end: string | null;
  grace: string | null;
  lock: string | null;
} {
  const grace = trial.end ? null : (trial.reason ?? "The trial has already ended.");
  const lock = trial.expire ? null : (trial.reason ?? "The trial has already expired.");
  return {
    change: trial.change ? null : trial.reason,
    end: trial.end || trial.expire ? null : lock,
    grace,
    lock,
  };
}

export type StripeMode = "test" | "live" | null;

/** A Stripe dashboard page, in test mode when the platform runs on a test key. */
export function stripeDashboardUrl(
  mode: StripeMode,
  kind: "customers" | "subscriptions",
  id: string,
): string {
  return `https://dashboard.stripe.com/${mode === "test" ? "test/" : ""}${kind}/${encodeURIComponent(id)}`;
}

export const BILLING_POLICY_LABELS: Record<BillingPolicyKey, { label: string; help: string }> = {
  trialDays: { label: "Trial length", help: "How long a new organization's trial lasts." },
  trialGraceDays: {
    label: "Grace after the trial",
    help: "How long an organization stays open after its trial ends.",
  },
  trialReminderDays: {
    label: "Trial reminder",
    help: "How many days before the trial ends admins are reminded.",
  },
  paymentGraceDays: {
    label: "Payment grace",
    help: "How long a past-due subscription stays open.",
  },
};

export function formatPolicyDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}
