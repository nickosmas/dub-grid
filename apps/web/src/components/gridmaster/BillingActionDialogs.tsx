"use client";

import ConfirmDialog from "@/components/ConfirmDialog";
import { formatBillingStatusLabel } from "@/lib/client-facing";
import type { GridmasterBillingOrgSummary } from "@/types";

export type BillingConfirmAction =
  | { kind: "sync_billing"; org: GridmasterBillingOrgSummary }
  | { kind: "sync_seats"; org: GridmasterBillingOrgSummary }
  | { kind: "cancel_at_period_end"; org: GridmasterBillingOrgSummary }
  | { kind: "cancel"; org: GridmasterBillingOrgSummary }
  | { kind: "override_status"; org: GridmasterBillingOrgSummary; status: string };

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
        message: `Cancel billing for ${action.org.orgName}? This immediately cancels the Stripe subscription when one exists.`,
        confirmLabel: "Cancel Billing",
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

export function ExtendTrialDialog({
  org,
  days,
  isLoading,
  onDaysChange,
  onConfirm,
  onCancel,
}: {
  org: GridmasterBillingOrgSummary | null;
  days: string;
  isLoading: boolean;
  onDaysChange: (days: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!org) return null;

  return (
    <ConfirmDialog
      title="Extend trial"
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span>Extend the trial for {org.orgName} by how many days?</span>
          <input
            className="dg-input"
            inputMode="numeric"
            min={1}
            type="number"
            value={days}
            onChange={(event) => onDaysChange(event.target.value)}
            aria-label="Trial extension days"
          />
        </div>
      }
      confirmLabel="Extend trial"
      variant="warning"
      isLoading={isLoading}
      confirmDisabled={!days.trim()}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
