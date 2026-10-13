"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DEFAULT_TRIAL_DAYS, trialControls } from "@dubgrid/domain";
import {
  BillingConfirmDialog,
  EndTrialDialog,
  ExtendGraceDialog,
  OverrideStatusDialog,
  PauseBillingDialog,
  TrialDaysDialog,
  type EndTrialChoice,
  trialDaysLeft,
  type BillingConfirmAction,
} from "@/components/gridmaster/BillingActionDialogs";
import {
  syncGridmasterBilling,
  updateGridmasterSubscription,
  type GridmasterSubscriptionInput,
} from "@/features/gridmaster/client";
import { trialActionReasons } from "@/components/gridmaster/gridmaster-billing-rules";
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
  pause_billing: "Billing paused",
  resume_billing: "Billing resumed",
  extend_grace: "Grace extended",
};

export interface GridmasterBillingActions {
  /** The organization an action is running for, if any. */
  busyOrgId: string | null;
  confirm: (action: BillingConfirmAction) => void;
  changeTrial: (org: GridmasterBillingOrgSummary) => void;
  /** Ends the trial, with the grace period or by locking now, as the dialog asks. */
  endTrial: (org: GridmasterBillingOrgSummary) => void;
  pauseBilling: (org: GridmasterBillingOrgSummary) => void;
  extendGrace: (org: GridmasterBillingOrgSummary) => void;
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
  const [overrideReason, setOverrideReason] = useState("");
  const [endTrialOrg, setEndTrialOrg] = useState<GridmasterBillingOrgSummary | null>(null);
  const [endTrialChoice, setEndTrialChoice] = useState<EndTrialChoice>("grace");
  const endTrialReasons = endTrialOrg ? reasonsFor(endTrialOrg) : null;
  const [pauseOrg, setPauseOrg] = useState<GridmasterBillingOrgSummary | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [graceOrg, setGraceOrg] = useState<GridmasterBillingOrgSummary | null>(null);
  const [graceDays, setGraceDays] = useState<number | null>(null);
  const [graceReason, setGraceReason] = useState("");

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
    setEndTrialOrg(null);
    setPauseOrg(null);
    setGraceOrg(null);
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
          reason: overrideReason.trim(),
        });
        break;
      case "resume_billing":
        void runSubscription({ orgId: org.orgId, action: "resume_billing" });
        break;
      default:
        void runSubscription({ orgId: org.orgId, action: confirmAction.kind });
    }
  }

  function handleEndTrial() {
    if (!endTrialOrg) return;
    void runSubscription({
      orgId: endTrialOrg.orgId,
      action: endTrialChoice === "lock" ? "expire_trial" : "end_trial",
    });
  }

  function handlePause() {
    if (!pauseOrg || !pauseReason.trim()) return;
    void runSubscription({
      orgId: pauseOrg.orgId,
      action: "pause_billing",
      reason: pauseReason.trim(),
    });
  }

  function handleExtendGrace() {
    if (!graceOrg || graceDays === null || !graceReason.trim()) return;
    void runSubscription({
      orgId: graceOrg.orgId,
      action: "extend_grace",
      days: graceDays,
      reason: graceReason.trim(),
    });
  }

  function handleSaveTrial() {
    if (!trialOrg || trialDays === null) return;
    void runSubscription({ orgId: trialOrg.orgId, action: "set_trial_days", trialDays });
  }

  return {
    busyOrgId,
    confirm: (action) => {
      setOverrideReason("");
      setConfirmAction(action);
    },
    changeTrial: (org) => {
      setTrialDays(trialDaysLeft(org.trialEndsAt) ?? DEFAULT_TRIAL_DAYS);
      setTrialOrg(org);
    },
    endTrial: (org) => {
      setEndTrialChoice(reasonsFor(org).grace ? "lock" : "grace");
      setEndTrialOrg(org);
    },
    pauseBilling: (org) => {
      setPauseReason("");
      setPauseOrg(org);
    },
    extendGrace: (org) => {
      setGraceDays(null);
      setGraceReason("");
      setGraceOrg(org);
    },
    dialogs: (
      <>
        <EndTrialDialog
          org={endTrialOrg}
          choice={endTrialChoice}
          graceReason={endTrialReasons?.grace ?? null}
          lockReason={endTrialReasons?.lock ?? null}
          isLoading={busyOrgId !== null}
          onChoiceChange={setEndTrialChoice}
          onConfirm={handleEndTrial}
          onCancel={() => setEndTrialOrg(null)}
        />
        <BillingConfirmDialog
          action={confirmAction}
          isLoading={busyOrgId !== null}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
        <OverrideStatusDialog
          org={confirmAction?.kind === "override_status" ? confirmAction.org : null}
          status={confirmAction?.kind === "override_status" ? confirmAction.status : ""}
          reason={overrideReason}
          isLoading={busyOrgId !== null}
          onReasonChange={setOverrideReason}
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
        <PauseBillingDialog
          org={pauseOrg}
          reason={pauseReason}
          isLoading={busyOrgId !== null}
          onReasonChange={setPauseReason}
          onConfirm={handlePause}
          onCancel={() => setPauseOrg(null)}
        />
        <ExtendGraceDialog
          org={graceOrg}
          days={graceDays}
          reason={graceReason}
          isLoading={busyOrgId !== null}
          onDaysChange={setGraceDays}
          onReasonChange={setGraceReason}
          onConfirm={handleExtendGrace}
          onCancel={() => setGraceOrg(null)}
        />
        {stepUp.dialog}
      </>
    ),
  };
}

function reasonsFor(org: GridmasterBillingOrgSummary) {
  return trialActionReasons(
    trialControls({
      status: org.status,
      trialEndsAt: org.trialEndsAt,
      hasStripeSubscription: Boolean(org.stripeSubscriptionId),
      billingPausedAt: org.billingHold?.pausedAt ?? null,
    }),
  );
}
