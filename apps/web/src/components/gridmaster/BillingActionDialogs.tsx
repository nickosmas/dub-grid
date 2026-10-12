"use client";

import { TRIAL_GRACE_DAYS } from "@dubgrid/domain";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatBillingStatusLabel } from "@/lib/client-facing";
import type { GridmasterBillingOrgSummary } from "@/types";
import { NumberField } from "@/components/ui/number-field";

export type BillingConfirmAction =
  | { kind: "sync_billing"; org: GridmasterBillingOrgSummary }
  | { kind: "sync_seats"; org: GridmasterBillingOrgSummary }
  | { kind: "cancel_at_period_end"; org: GridmasterBillingOrgSummary }
  | { kind: "cancel"; org: GridmasterBillingOrgSummary }
  | { kind: "end_trial"; org: GridmasterBillingOrgSummary }
  | { kind: "expire_trial"; org: GridmasterBillingOrgSummary }
  | { kind: "override_status"; org: GridmasterBillingOrgSummary; status: string };

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getConfirmDialogCopy(action: BillingConfirmAction) {
  switch (action.kind) {
    case "sync_billing":
      return {
        title: "Sync Stripe",
        message: `Sync Stripe billing state for ${action.org.orgName}? This updates the local billing snapshot from Stripe.`,
        confirmLabel: "Sync Stripe",
        variant: "warning" as const,
      };
    case "sync_seats":
      return {
        title: "True Up Seats",
        message: `True up ${action.org.orgName} billing seats to ${action.org.appUsers} app users? Stripe may prorate the subscription.`,
        confirmLabel: "True Up Seats",
        variant: "warning" as const,
      };
    case "cancel_at_period_end":
      return {
        title: "End Billing Period",
        message: `Schedule ${action.org.orgName} to cancel at the end of the current billing period? Access remains active until the period ends.`,
        confirmLabel: "End Period",
        variant: "warning" as const,
      };
    case "cancel":
      return {
        title: "Cancel Billing",
        message: `Cancel the Stripe subscription for ${action.org.orgName} now? The organization locks immediately.`,
        confirmLabel: "Cancel Billing",
        variant: "danger" as const,
      };
    case "end_trial": {
      const accessEnds = new Date(Date.now() + TRIAL_GRACE_DAYS * 86_400_000);
      return {
        title: "End trial now",
        message: `End the trial for ${action.org.orgName} now? They keep access for ${TRIAL_GRACE_DAYS} more days, until ${formatDay(accessEnds)}, then the organization locks unless billing is added.`,
        confirmLabel: "End trial",
        variant: "warning" as const,
      };
    }
    case "expire_trial":
      return {
        title: "Expire trial",
        message: `Expire the trial for ${action.org.orgName} now? The organization locks immediately, with no grace period. Members can't use it until billing is added or you give it trial days again.`,
        confirmLabel: "Expire trial",
        variant: "danger" as const,
      };
    case "override_status":
      return {
        title: "Override Billing Status",
        message: `Override ${action.org.orgName} billing status to ${formatBillingStatusLabel(action.status)}?`,
        confirmLabel: "Override Status",
        variant: "warning" as const,
      };
  }
}

export function BillingConfirmDialog({
  action,
  isLoading,
  onConfirm,
  onCancel,
}: {
  action: BillingConfirmAction | null;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!action) return null;

  const copy = getConfirmDialogCopy(action);

  return (
    <ConfirmDialog
      title={copy.title}
      message={copy.message}
      confirmLabel={copy.confirmLabel}
      variant={copy.variant}
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** Whole days left on a running trial, for the dialog's starting value. */
export function trialDaysLeft(trialEndsAt: string | null, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null;
  const left = Math.ceil((Date.parse(trialEndsAt) - now.getTime()) / 86_400_000);
  return left > 0 ? left : null;
}

export function TrialDaysDialog({
  org,
  days,
  isLoading,
  onDaysChange,
  onConfirm,
  onCancel,
}: {
  org: GridmasterBillingOrgSummary | null;
  days: number | null;
  isLoading: boolean;
  onDaysChange: (days: number | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!org) return null;

  const valid = days !== null && days >= 1;
  const restarts = trialDaysLeft(org.trialEndsAt) === null && Boolean(org.trialEndsAt);

  return (
    <ConfirmDialog
      title="Change trial"
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span>
            How many days should {org.orgName} have left?
            {restarts ? " This puts the organization back on its trial." : ""}
          </span>
          <NumberField
            nullable
            min={1}
            value={days}
            onChange={onDaysChange}
            aria-label="Trial days left"
          />
          <span className="dg-tabular-nums" style={{ color: "var(--dg-color-text-muted)" }}>
            {valid
              ? `The trial will end on ${formatDay(new Date(Date.now() + days * 86_400_000))}.`
              : "Enter at least 1 day."}
          </span>
        </div>
      }
      confirmLabel="Save trial"
      variant="warning"
      isLoading={isLoading}
      confirmDisabled={!valid}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
