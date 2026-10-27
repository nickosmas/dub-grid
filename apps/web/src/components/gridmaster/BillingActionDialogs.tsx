"use client";

import { BILLING_POLICY_LIMITS, TRIAL_GRACE_DAYS } from "@dubgrid/domain";
import ConfirmDialog, { type ConfirmSummary } from "@/components/ConfirmDialog";
import { formatBillingStatusLabel } from "@/lib/client-facing";
import type { GridmasterBillingOrgSummary } from "@/types";
import { NumberField } from "@/components/ui/number-field";
import {
  describeOverrideOutcome,
  describePauseOutcome,
  describeResumeOutcome,
  OVERRIDE_REASON_MAX_LENGTH,
} from "@/components/gridmaster/gridmaster-billing-rules";

export type BillingConfirmAction =
  | { kind: "sync_billing"; org: GridmasterBillingOrgSummary }
  | { kind: "sync_seats"; org: GridmasterBillingOrgSummary }
  | { kind: "cancel_at_period_end"; org: GridmasterBillingOrgSummary }
  | { kind: "cancel"; org: GridmasterBillingOrgSummary }
  | { kind: "resume_billing"; org: GridmasterBillingOrgSummary }
  | { kind: "override_status"; org: GridmasterBillingOrgSummary; status: string };

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A box earns its place with two or more consequences; a lone one reads
 * better as a sentence in the message.
 */
function splitOutcome(points: string[]): {
  sentence: string | null;
  summary: ConfirmSummary | undefined;
} {
  if (points.length >= 2) return { sentence: null, summary: { points } };
  return { sentence: points[0] ?? null, summary: undefined };
}

function getConfirmDialogCopy(action: Exclude<BillingConfirmAction, { kind: "override_status" }>) {
  const { orgName, appUsers } = action.org;
  switch (action.kind) {
    case "sync_billing":
      return {
        title: `Sync ${orgName}'s billing from Stripe?`,
        confirmLabel: "Sync Stripe",
        variant: "warning" as const,
      };
    case "sync_seats":
      return {
        title: `True up ${orgName}'s seats?`,
        message: `Billing seats are set to ${appUsers} app ${appUsers === 1 ? "user" : "users"}, and Stripe may prorate the subscription.`,
        confirmLabel: "True Up Seats",
        variant: "warning" as const,
      };
    case "cancel_at_period_end":
      return {
        title: `Cancel ${orgName}'s subscription at period end?`,
        message: "The organization stays open until the end of the current billing period.",
        confirmLabel: "Cancel at period end",
        variant: "warning" as const,
      };
    case "cancel":
      return {
        title: `Cancel ${orgName}'s billing?`,
        message: "The Stripe subscription is canceled now, and the organization locks right away.",
        confirmLabel: "Cancel Billing",
        variant: "danger" as const,
      };
    case "resume_billing": {
      const { sentence, summary } = splitOutcome(describeResumeOutcome(action.org));
      return {
        title: `Resume billing for ${orgName}?`,
        message: sentence ?? undefined,
        summary,
        confirmLabel: "Resume billing",
        variant: "warning" as const,
      };
    }
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
  // An override asks for a reason, so it has its own dialog.
  if (!action || action.kind === "override_status") return null;

  const copy = getConfirmDialogCopy(action);

  return (
    <ConfirmDialog
      title={copy.title}
      message={copy.message}
      summary={"summary" in copy ? copy.summary : undefined}
      confirmLabel={copy.confirmLabel}
      variant={copy.variant}
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function OverrideStatusDialog({
  org,
  status,
  reason,
  isLoading,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  org: GridmasterBillingOrgSummary | null;
  status: string;
  reason: string;
  isLoading: boolean;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!org) return null;

  const outcome = splitOutcome(describeOverrideOutcome(org, status));
  const reasonFieldId = `override-reason-${org.orgId}`;

  return (
    <ConfirmDialog
      title={`Set ${org.orgName}'s billing status to ${formatBillingStatusLabel(status)}?`}
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {outcome.sentence ? <span>{outcome.sentence}</span> : null}
          <label htmlFor={reasonFieldId} style={{ fontWeight: 600 }}>
            Reason <span style={{ color: "var(--dg-color-danger-text)" }}>*</span>
          </label>
          <textarea
            id={reasonFieldId}
            className="dg-input"
            value={reason}
            maxLength={OVERRIDE_REASON_MAX_LENGTH}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Why are you overriding this organization's billing status?"
            rows={3}
            style={{ resize: "vertical", width: "100%" }}
          />
        </div>
      }
      summary={outcome.summary}
      confirmLabel="Override status"
      variant="warning"
      isLoading={isLoading}
      confirmDisabled={!reason.trim()}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export type EndTrialChoice = "grace" | "lock";

const RADIO_CLASS =
  "appearance-none aspect-square w-4 h-4 shrink-0 mt-0.5 rounded-full border-2 border-[var(--dg-color-border)] box-border cursor-pointer relative disabled:cursor-not-allowed disabled:opacity-50";

export function EndTrialDialog({
  org,
  choice,
  graceReason,
  lockReason,
  isLoading,
  onChoiceChange,
  onConfirm,
  onCancel,
}: {
  org: GridmasterBillingOrgSummary | null;
  choice: EndTrialChoice;
  /** Why the grace choice doesn't apply; null when it does. */
  graceReason: string | null;
  /** Why locking doesn't apply; null when it does. */
  lockReason: string | null;
  isLoading: boolean;
  onChoiceChange: (choice: EndTrialChoice) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!org) return null;

  const graceDays = org.policy?.values.trialGraceDays ?? TRIAL_GRACE_DAYS;
  const accessEnds = formatDay(new Date(Date.now() + graceDays * 86_400_000));
  const options: Array<{
    value: EndTrialChoice;
    title: string;
    points: string[];
    reason: string | null;
    checkedClass: string;
  }> = [
    {
      value: "grace",
      title: `Give the usual ${graceDays} ${graceDays === 1 ? "day" : "days"} to add billing`,
      points: [
        `The organization stays open until ${accessEnds}.`,
        "After that, it locks unless it subscribes.",
      ],
      reason: graceReason,
      checkedClass:
        "checked:border-[var(--dg-color-warning)] checked:before:absolute checked:before:inset-[2px] checked:before:rounded-full checked:before:bg-[var(--dg-color-warning)]",
    },
    {
      value: "lock",
      title: "Lock now, with no grace period",
      points: [
        "Members can't use DubGrid until billing is added.",
        "Your password is needed to confirm.",
      ],
      reason: lockReason,
      checkedClass:
        "checked:border-[var(--dg-color-danger)] checked:before:absolute checked:before:inset-[2px] checked:before:rounded-full checked:before:bg-[var(--dg-color-danger)]",
    },
  ];
  const chosen = options.find((option) => option.value === choice);

  return (
    <ConfirmDialog
      title={`End ${org.orgName}'s trial?`}
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {graceReason && !lockReason ? (
            <span>The trial has already ended, so it can only be locked now.</span>
          ) : null}
          {options.map((option) => (
            <label
              key={option.value}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                cursor: option.reason ? "not-allowed" : "pointer",
              }}
            >
              <input
                type="radio"
                name={`end-trial-${org.orgId}`}
                value={option.value}
                checked={choice === option.value}
                disabled={Boolean(option.reason)}
                onChange={() => onChoiceChange(option.value)}
                className={`${RADIO_CLASS} ${option.checkedClass}`}
              />
              <span>
                <span style={{ display: "block", fontWeight: 600 }}>{option.title}</span>
                {option.reason ? (
                  <span
                    style={{
                      display: "block",
                      fontSize: "var(--dg-fs-label)",
                      color: "var(--dg-color-text-muted)",
                    }}
                  >
                    {option.reason}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      }
      summary={chosen && !chosen.reason ? { points: chosen.points } : undefined}
      confirmLabel={choice === "lock" ? "Lock now" : "End trial"}
      variant={choice === "lock" ? "danger" : "warning"}
      isLoading={isLoading}
      confirmDisabled={Boolean(choice === "lock" ? lockReason : graceReason)}
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
  const longerThanAYear = valid && days > 365;
  const restarts = trialDaysLeft(org.trialEndsAt) === null && Boolean(org.trialEndsAt);

  return (
    <ConfirmDialog
      title={`Change ${org.orgName}'s trial?`}
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span>
            How many days should the trial have left?
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
          {longerThanAYear && (
            <span style={{ color: "var(--dg-color-warning-text)", fontWeight: 600 }}>
              That&apos;s more than a year of free access.
            </span>
          )}
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

function ReasonField({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={id} style={{ fontWeight: 600 }}>
        Reason <span style={{ color: "var(--dg-color-danger-text)" }}>*</span>
      </label>
      <textarea
        id={id}
        className="dg-input"
        value={value}
        maxLength={OVERRIDE_REASON_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{ resize: "vertical", width: "100%" }}
      />
    </>
  );
}

export function PauseBillingDialog({
  org,
  reason,
  isLoading,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  org: GridmasterBillingOrgSummary | null;
  reason: string;
  isLoading: boolean;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!org) return null;

  const outcome = splitOutcome(describePauseOutcome(org));

  return (
    <ConfirmDialog
      title={`Pause billing for ${org.orgName}?`}
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {outcome.sentence ? <span>{outcome.sentence}</span> : null}
          <ReasonField
            id={`pause-reason-${org.orgId}`}
            value={reason}
            placeholder="Why are you pausing this organization's billing?"
            onChange={onReasonChange}
          />
        </div>
      }
      summary={outcome.summary}
      confirmLabel="Pause billing"
      variant="warning"
      isLoading={isLoading}
      confirmDisabled={!reason.trim()}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function ExtendGraceDialog({
  org,
  days,
  reason,
  isLoading,
  onDaysChange,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  org: GridmasterBillingOrgSummary | null;
  days: number | null;
  reason: string;
  isLoading: boolean;
  onDaysChange: (days: number | null) => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!org) return null;

  const current = org.policy.values.trialGraceDays;
  const maxDays = BILLING_POLICY_LIMITS.trialGraceDays.max - current;
  const valid = days !== null && days >= 1 && days <= maxDays;
  const opensUntil =
    valid && org.trialEndsAt
      ? formatDay(new Date(Date.parse(org.trialEndsAt) + (current + days) * 86_400_000))
      : null;

  return (
    <ConfirmDialog
      title={`Extend ${org.orgName}'s grace?`}
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span>How many days should be added to the {current}-day grace period?</span>
          <NumberField
            nullable
            min={1}
            max={maxDays}
            value={days}
            onChange={onDaysChange}
            aria-label="Grace days to add"
          />
          {opensUntil ? null : (
            <span className="dg-tabular-nums" style={{ color: "var(--dg-color-text-muted)" }}>
              {maxDays < 1
                ? "Grace is already at its limit. Change the trial instead."
                : `Enter 1 to ${maxDays} days.`}
            </span>
          )}
          <ReasonField
            id={`grace-reason-${org.orgId}`}
            value={reason}
            placeholder="Why does this organization need more time?"
            onChange={onReasonChange}
          />
        </div>
      }
      summary={
        opensUntil
          ? {
              points: [
                <span key="open" className="dg-tabular-nums">
                  The organization stays open until {opensUntil}.
                </span>,
                "This sets the organization's grace override.",
              ],
            }
          : undefined
      }
      confirmLabel="Extend grace"
      variant="warning"
      isLoading={isLoading}
      confirmDisabled={!valid || !reason.trim()}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
