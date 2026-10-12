"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DEFAULT_TRIAL_DAYS } from "@dubgrid/domain";
import {
  BillingConfirmDialog,
  TrialDaysDialog,
  trialDaysLeft,
  type BillingConfirmAction,
} from "@/components/gridmaster/BillingActionDialogs";
import {
  syncGridmasterBilling,
  updateGridmasterSubscription,
  type GridmasterSubscriptionInput,
} from "@/features/gridmaster/client";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import type { GridmasterBillingOrgSummary } from "@/types";

const SUCCESS_MESSAGES: Record<GridmasterSubscriptionInput["action"], string> = {
  set_trial_days: "Trial updated",
  end_trial: "Trial ended",
  expire_trial: "Trial expired",
  cancel: "Subscription canceled",
  cancel_at_period_end: "Cancellation scheduled",
  sync_seats: "Seats synced",
  override_status: "Billing status overridden",
};

export interface GridmasterBillingActions {
  /** The organization an action is running for, if any. */
  busyOrgId: string | null;
  confirm: (action: BillingConfirmAction) => void;
  changeTrial: (org: GridmasterBillingOrgSummary) => void;
  /** The confirmation, trial and identity-check dialogs; render once. */
  dialogs: ReactNode;
}

/**
 * One home for the billing actions the Gridmaster table and the organization
 * Billing tab share. The server asks for fresh proof on actions that lock an
 * organization or rewrite its billing; the identity check then runs here.
 */
export function useGridmasterBillingActions(): GridmasterBillingActions {
  const queryClient = useQueryClient();
  const stepUp = useStepUpAction();
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<BillingConfirmAction | null>(null);
  const [trialOrg, setTrialOrg] = useState<GridmasterBillingOrgSummary | null>(null);
  const [trialDays, setTrialDays] = useState<number | null>(DEFAULT_TRIAL_DAYS);

  function invalidateBilling() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.billing() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.overview() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.dashboard() });
    // Every action writes an audit row the Billing Activity list should show.
    void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.auditAll() });
  }

  async function runSync(orgId: string) {
    setBusyOrgId(orgId);
    try {
      await syncGridmasterBilling(orgId);
      toast.success("Billing synced");
      invalidateBilling();
    } catch (error) {
      toast.error(
        formatClientErrorMessage(error, "We couldn't refresh the billing details. Try again."),
      );
    } finally {
      setBusyOrgId(null);
      setConfirmAction(null);
    }
  }

  async function runSubscription(input: GridmasterSubscriptionInput) {
    setBusyOrgId(input.orgId);
    // The confirmation steps aside so the identity check is the only dialog.
    setConfirmAction(null);
    setTrialOrg(null);
    try {
      const completed = await stepUp.run((accessToken) =>
        updateGridmasterSubscription(input, accessToken),
      );
      if (!completed) return;
      toast.success(SUCCESS_MESSAGES[input.action]);
      invalidateBilling();
    } catch (error) {
      toast.error(formatClientErrorMessage(error, "Billing action failed"));
    } finally {
      setBusyOrgId(null);
    }
  }

  function handleConfirm() {
    if (!confirmAction) return;
    const { org } = confirmAction;
    switch (confirmAction.kind) {
      case "sync_billing":
        void runSync(org.orgId);
        break;
      case "override_status":
        void runSubscription({
          orgId: org.orgId,
          action: "override_status",
          status: confirmAction.status,
        });
        break;
      default:
        void runSubscription({ orgId: org.orgId, action: confirmAction.kind });
    }
  }

  function handleSaveTrial() {
    if (!trialOrg || trialDays === null) return;
    void runSubscription({ orgId: trialOrg.orgId, action: "set_trial_days", trialDays });
  }

  return {
    busyOrgId,
    confirm: setConfirmAction,
    changeTrial: (org) => {
      setTrialDays(trialDaysLeft(org.trialEndsAt) ?? DEFAULT_TRIAL_DAYS);
      setTrialOrg(org);
    },
    dialogs: (
      <>
        <BillingConfirmDialog
          action={confirmAction}
          isLoading={busyOrgId !== null}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
        <TrialDaysDialog
          org={trialOrg}
          days={trialDays}
          isLoading={busyOrgId !== null}
          onDaysChange={setTrialDays}
          onConfirm={handleSaveTrial}
          onCancel={() => setTrialOrg(null)}
        />
        {stepUp.dialog}
      </>
    ),
  };
}
