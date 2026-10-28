import { formatBillingStatusLabel } from "@/lib/client-facing";
import type { BillingOperationSummary } from "@/types";
import { formatLongDate, formatMoney, type BillingIconKey, type BillingStatTone } from "./overview";

export type BillingEventCategory = "payments" | "subscription" | "trial";

export interface BillingEventView {
  category: BillingEventCategory;
  title: string;
  detail: string;
  amount: string | null;
  tone: BillingStatTone;
  icon: BillingIconKey;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function date(value: unknown): string | null {
  const iso = str(value);
  return iso && !Number.isNaN(new Date(iso).getTime()) ? formatLongDate(iso) : null;
}

function amountOf(details: Record<string, unknown>, key: "amount_paid" | "amount_due") {
  const cents = num(details[key]);
  const currency = str(details.currency);
  return cents != null && currency ? formatMoney(cents, currency) : null;
}

function seatsPhrase(count: number): string {
  return `${count} ${count === 1 ? "seat" : "seats"}`;
}

function subscriptionUpdated(details: Record<string, unknown>): BillingEventView {
  const quantity = num(details.quantity);
  const previous = num(details.previous_quantity);
  if (quantity != null && previous != null && quantity !== previous) {
    return {
      category: "subscription",
      title: `Paid seats changed from ${previous} to ${quantity}.`,
      detail: `Your subscription now charges for ${seatsPhrase(quantity)} each month.`,
      amount: null,
      tone: "info",
      icon: "seat",
    };
  }
  const status = str(details.new_status) ?? str(details.status);
  const previousStatus = str(details.previous_status);
  return {
    category: "subscription",
    title: "Subscription updated.",
    detail:
      status && previousStatus && status !== previousStatus
        ? `Its status changed from ${formatBillingStatusLabel(previousStatus)} to ${formatBillingStatusLabel(status)}.`
        : "The subscription's details were updated with the payment provider.",
    amount: null,
    tone: "info",
    icon: "card",
  };
}

/** A billing history row, said as complete sentences. */
export function describeBillingEvent(operation: BillingOperationSummary): BillingEventView {
  const details = operation.details ?? {};
  const view = (
    category: BillingEventCategory,
    title: string,
    detail: string,
    tone: BillingStatTone,
    icon: BillingIconKey,
    amount: string | null = null,
  ): BillingEventView => ({ category, title, detail, amount, tone, icon });

  switch (operation.action) {
    case "billing.subscription_created": {
      const quantity = num(details.quantity);
      return view(
        "subscription",
        quantity != null
          ? `Subscription started with ${seatsPhrase(quantity)}.`
          : "Subscription started.",
        "The monthly subscription began.",
        "info",
        "card",
      );
    }
    case "billing.subscription_updated":
      return subscriptionUpdated(details);
    case "billing.subscription_cancel_scheduled": {
      const endsOn = date(details.cancel_at);
      return view(
        "subscription",
        "Cancellation scheduled.",
        endsOn
          ? `The subscription will end on ${endsOn} and won't renew.`
          : "The subscription won't renew at the end of its billing period.",
        "warning",
        "calendar-x",
      );
    }
    case "billing.subscription_canceled":
      return view(
        "subscription",
        "Subscription canceled.",
        "The subscription ended and won't renew.",
        "danger",
        "calendar-x",
      );
    case "billing.payment_failed":
      return view(
        "payments",
        "Payment failed.",
        "The payment provider retries the charge automatically.",
        "danger",
        "card",
        amountOf(details, "amount_due"),
      );
    case "billing.payment_succeeded":
      return view(
        "payments",
        "Payment received.",
        "The monthly payment for your paid seats was collected.",
        "success",
        "receipt",
        amountOf(details, "amount_paid"),
      );
    case "billing.payment_method_updated": {
      const type = str(details.payment_method_type);
      return view(
        "payments",
        "Payment method updated.",
        type === "card"
          ? "A card was saved as the payment method."
          : "The payment method was changed in the billing portal.",
        "neutral",
        "card",
      );
    }
    case "billing.billing_details_updated":
      return view(
        "subscription",
        "Billing details updated.",
        "The billing address or contact details were changed in the billing portal.",
        "neutral",
        "receipt",
      );
    case "billing.trial_extended":
    case "billing.trial_changed": {
      const endsOn = date(details.trial_ends_at);
      const before = date(details.previous_trial_ends_at);
      return view(
        "trial",
        operation.action === "billing.trial_extended"
          ? "Free trial extended."
          : "Free trial end date changed.",
        endsOn
          ? `The trial now ends on ${endsOn}${before ? ` instead of ${before}` : ""}.`
          : "The trial's end date was changed.",
        "info",
        "calendar",
      );
    }
    case "billing.trial_ended":
      return view(
        "trial",
        "Free trial ended early.",
        "The trial was ended before its end date.",
        "warning",
        "alarm",
      );
    case "billing.trial_expired":
      return view(
        "trial",
        "Free trial ended.",
        "The trial ended without a subscription.",
        "warning",
        "alarm",
      );
    case "billing.grace_extended": {
      const graceDays = num(details.grace_days);
      return view(
        "trial",
        "Grace period extended.",
        graceDays != null
          ? `The grace period after the trial is now ${graceDays} ${graceDays === 1 ? "day" : "days"}.`
          : "The grace period after the trial was extended.",
        "info",
        "clock",
      );
    }
    case "billing.status_overridden": {
      const status = str(details.new_status) ?? str(details.status);
      return view(
        "subscription",
        "Billing status changed.",
        status
          ? `The billing status was set to ${formatBillingStatusLabel(status)}.`
          : "The billing status was changed.",
        "info",
        "info",
      );
    }
    case "billing.paused":
      return view(
        "subscription",
        "Billing paused.",
        "No payments are collected while billing is paused.",
        "neutral",
        "paused",
      );
    case "billing.resumed":
      return view(
        "subscription",
        "Billing resumed.",
        "Payments are collected again from now on.",
        "success",
        "card",
      );
    default:
      return view(
        "subscription",
        `${operation.label}.`,
        "This change was recorded for your billing.",
        "neutral",
        "info",
      );
  }
}
