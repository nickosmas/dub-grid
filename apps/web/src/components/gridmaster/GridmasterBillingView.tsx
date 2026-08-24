"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchGridmasterBilling,
  syncGridmasterBilling,
  updateGridmasterSubscription,
} from "@/features/gridmaster/client";
import {
  BillingConfirmDialog,
  ExtendTrialDialog,
  type BillingConfirmAction,
} from "@/components/gridmaster/BillingActionDialogs";
import CustomSelect from "@/components/CustomSelect";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import { queryKeys } from "@/lib/query-keys";
import { formatBillingStatusLabel, formatClientErrorMessage } from "@/lib/client-facing";
import { sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import type { GridmasterBillingOrgSummary } from "@/types";

const BILLING_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
] as const;

function MiniCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "var(--color-danger)"
      : tone === "warning"
        ? "var(--color-warning)"
        : "var(--color-text-primary)";
  return (
    <div style={{ ...sectionStyle, padding: "14px 16px", flex: "1 1 160px" }}>
      <div
        style={{
          fontSize: "var(--dg-fs-card-title)",
          fontWeight: 800,
          color,
          fontFamily: "var(--font-dm-mono), monospace",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 700,
          color: "var(--color-text-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

// A trialing org with no end date hasn't started its trial yet (no super_admin
// has signed in). Show that explicitly rather than an ambiguous dash.
function formatTrialEnds(org: GridmasterBillingOrgSummary) {
  if (org.trialEndsAt) return new Date(org.trialEndsAt).toLocaleDateString();
  if (org.status === "trialing" || !org.status) return "Not started";
  return "—";
}

function statusTone(status: string | null) {
  if (status === "active" || status === "trialing") return "var(--color-success)";
  if (status === "past_due" || status === "incomplete") return "var(--color-warning)";
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired")
    return "var(--color-danger)";
  return "var(--color-text-muted)";
}

// A trialing org with no end date hasn't started its trial yet (no super_admin
// has intentionally accessed it). Surface that as a distinct "pending" status
// instead of the green "Trial active" the bare status maps to.
function isTrialPending(org: GridmasterBillingOrgSummary) {
  return org.status === "trialing" && !org.trialEndsAt;
}

function statusLabelFor(org: GridmasterBillingOrgSummary) {
  return isTrialPending(org) ? "Trial pending" : formatBillingStatusLabel(org.status);
}

function statusToneFor(org: GridmasterBillingOrgSummary) {
  return isTrialPending(org) ? "var(--color-text-muted)" : statusTone(org.status);
}

function BillingOversightSkeleton() {
  return (
    <div aria-hidden>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              ...sectionStyle,
              padding: "14px 16px",
              flex: "1 1 160px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div className="dg-skeleton" style={{ width: 48, height: 22, borderRadius: 4 }} />
            <div className="dg-skeleton" style={{ width: 96, height: 10, borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div style={sectionStyle}>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div
                className="dg-skeleton"
                style={{ flex: "1 1 160px", height: 12, borderRadius: 4 }}
              />
              <div className="dg-skeleton" style={{ width: 80, height: 18, borderRadius: 999 }} />
              <div className="dg-skeleton" style={{ width: 90, height: 12, borderRadius: 4 }} />
              <div className="dg-skeleton" style={{ width: 60, height: 12, borderRadius: 4 }} />
              <div className="dg-skeleton" style={{ width: 120, height: 28, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BillingRowActions({
  org,
  busy,
  onSync,
  onSyncSeats,
  onExtendTrial,
  onCancel,
  onCancelAtPeriodEnd,
  onOverrideStatus,
}: {
  org: GridmasterBillingOrgSummary;
  busy: boolean;
  onSync: (org: GridmasterBillingOrgSummary) => void;
  onSyncSeats: (org: GridmasterBillingOrgSummary) => void;
  onExtendTrial: (org: GridmasterBillingOrgSummary) => void;
  onCancel: (org: GridmasterBillingOrgSummary) => void;
  onCancelAtPeriodEnd: (org: GridmasterBillingOrgSummary) => void;
  onOverrideStatus: (org: GridmasterBillingOrgSummary, status: string) => void;
}) {
  const [status, setStatus] = useState(
    BILLING_STATUSES.includes(org.status as (typeof BILLING_STATUSES)[number])
      ? (org.status ?? "active")
      : "active",
  );

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      <Button
        type="button"
        className="dg-btn dg-btn-secondary dg-btn-xs"
        disabled={busy || !org.stripeCustomerId}
        onClick={() => onSync(org)}
      >
        Sync
      </Button>
      <Button
        type="button"
        className="dg-btn dg-btn-secondary dg-btn-xs"
        disabled={busy || !org.stripeSubscriptionId || org.seats === org.appUsers}
        onClick={() => onSyncSeats(org)}
      >
        True up seats
      </Button>
      <Button
        type="button"
        className="dg-btn dg-btn-secondary dg-btn-xs"
        // Only a trialing org has a trial to extend; for active/canceled/past_due
        // there is no trial clock, so the action would be a no-op.
        disabled={busy || org.status !== "trialing"}
        onClick={() => onExtendTrial(org)}
      >
        Extend trial
      </Button>
      <Button
        type="button"
        className="dg-btn dg-btn-secondary dg-btn-xs"
        disabled={busy || !org.stripeSubscriptionId || org.status === "canceled" || !!org.cancelAt}
        onClick={() => onCancelAtPeriodEnd(org)}
      >
        End period
      </Button>
      <button
        type="button"
        className="dg-btn dg-btn-danger dg-btn-xs"
        // No Stripe subscription = nothing to cancel; use Override to change a
        // local-only org's status instead.
        disabled={busy || org.status === "canceled" || !org.stripeSubscriptionId}
        onClick={() => onCancel(org)}
      >
        Cancel
      </button>
      <CustomSelect
        ariaLabel={`Billing status for ${org.orgName}`}
        value={status}
        disabled={busy}
        onChange={setStatus}
        options={BILLING_STATUSES.map((nextStatus) => ({
          value: nextStatus,
          label: formatBillingStatusLabel(nextStatus),
        }))}
        style={{ width: 150 }}
        height={28}
        fontSize="var(--dg-fs-caption)"
      />
      <Button
        type="button"
        className="dg-btn dg-btn-primary dg-btn-xs"
        disabled={busy || status === org.status}
        onClick={() => onOverrideStatus(org, status)}
      >
        Override
      </Button>
    </div>
  );
}

export default function GridmasterBillingView({
  onSelectOrg,
}: {
  onSelectOrg: (orgId: string, initialTab?: "billing") => void;
}) {
  const queryClient = useQueryClient();
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<BillingConfirmAction | null>(null);
  const [extendTrialOrg, setExtendTrialOrg] = useState<GridmasterBillingOrgSummary | null>(null);
  const [trialDays, setTrialDays] = useState("14");
  const billingQuery = useQuery({
    queryKey: queryKeys.gridmaster.billing(),
    queryFn: fetchGridmasterBilling,
    staleTime: 30_000,
  });
  const billing = billingQuery.data;

  function invalidateBilling() {
    queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.billing() });
    queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.overview() });
    queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.dashboard() });
  }

  const syncMutation = useMutation({
    mutationFn: syncGridmasterBilling,
    onSuccess: () => {
      toast.success("Billing synced");
      invalidateBilling();
    },
    onError: (error) => {
      toast.error(
        formatClientErrorMessage(error, "We couldn't refresh the billing details. Try again."),
      );
    },
    onSettled: () => {
      setBusyOrgId(null);
      setConfirmAction(null);
    },
  });

  const subscriptionMutation = useMutation({
    mutationFn: updateGridmasterSubscription,
    onSuccess: (_result, input) => {
      toast.success(
        input.action === "extend_trial"
          ? "Trial extended"
          : input.action === "cancel"
            ? "Subscription canceled"
            : input.action === "cancel_at_period_end"
              ? "Cancellation scheduled"
              : input.action === "sync_seats"
                ? "Seats synced"
                : "Billing status overridden",
      );
      invalidateBilling();
    },
    onError: (error) => {
      toast.error(formatClientErrorMessage(error, "Billing action failed"));
    },
    onSettled: () => {
      setBusyOrgId(null);
      setConfirmAction(null);
      setExtendTrialOrg(null);
    },
  });

  function handleSync(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "sync_billing", org });
  }

  function handleExtendTrial(org: GridmasterBillingOrgSummary) {
    setTrialDays("14");
    setExtendTrialOrg(org);
  }

  function handleConfirmExtendTrial() {
    if (!extendTrialOrg) return;

    const days = Number.parseInt(trialDays, 10);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Trial extension must be at least 1 day");
      return;
    }

    setBusyOrgId(extendTrialOrg.orgId);
    subscriptionMutation.mutate({
      orgId: extendTrialOrg.orgId,
      action: "extend_trial",
      trialDays: days,
    });
  }

  function handleCancel(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "cancel", org });
  }

  function handleCancelAtPeriodEnd(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "cancel_at_period_end", org });
  }

  function handleSyncSeats(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "sync_seats", org });
  }

  function handleOverrideStatus(org: GridmasterBillingOrgSummary, status: string) {
    setConfirmAction({ kind: "override_status", org, status });
  }

  function handleConfirmAction() {
    if (!confirmAction) return;

    setBusyOrgId(confirmAction.org.orgId);
    switch (confirmAction.kind) {
      case "sync_billing":
        syncMutation.mutate(confirmAction.org.orgId);
        break;
      case "sync_seats":
        subscriptionMutation.mutate({ orgId: confirmAction.org.orgId, action: "sync_seats" });
        break;
      case "cancel_at_period_end":
        subscriptionMutation.mutate({
          orgId: confirmAction.org.orgId,
          action: "cancel_at_period_end",
        });
        break;
      case "cancel":
        subscriptionMutation.mutate({ orgId: confirmAction.org.orgId, action: "cancel" });
        break;
      case "override_status":
        subscriptionMutation.mutate({
          orgId: confirmAction.org.orgId,
          action: "override_status",
          status: confirmAction.status,
        });
        break;
    }
  }

  return (
    <>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-page-title)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Billing Oversight
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "var(--dg-fs-label)",
              color: "var(--color-text-muted)",
              fontWeight: 600,
            }}
          >
            Sync Stripe state, extend trials, cancel subscriptions, and correct local status when
            support needs to intervene.
          </p>
        </div>
        <Button
          type="button"
          className="dg-btn dg-btn-secondary dg-btn-sm"
          onClick={() => billingQuery.refetch()}
          disabled={billingQuery.isFetching}
        >
          Refresh
        </Button>
      </div>

      {billingQuery.error instanceof Error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {formatClientErrorMessage(
            billingQuery.error,
            "We couldn't load your billing details. Refresh and try again.",
          )}
        </div>
      )}

      <ProgressBar loading={billingQuery.isLoading || !billing} />

      {billingQuery.isLoading || !billing ? (
        <BillingOversightSkeleton />
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <MiniCard
              label="Trials Ending"
              value={billing.trialEndingSoon.length}
              tone={billing.trialEndingSoon.length ? "warning" : "neutral"}
            />
            <MiniCard label="Trials Not Started" value={billing.trialsNotStarted.length} />
            <MiniCard
              label="Billing Risk"
              value={billing.riskOrganizations.length}
              tone={billing.riskOrganizations.length ? "danger" : "neutral"}
            />
            <MiniCard
              label="Missing Stripe"
              value={billing.missingStripeCustomer.length}
              tone={billing.missingStripeCustomer.length ? "warning" : "neutral"}
            />
            <MiniCard
              label="Seat Mismatch"
              value={billing.seatMismatches.length}
              tone={billing.seatMismatches.length ? "danger" : "neutral"}
            />
          </div>

          <div style={sectionStyle}>
            {billing.organizations.length === 0 ? (
              <div style={{ padding: 16 }}>
                <EmptyState
                  size="compact"
                  icon={
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                  }
                  title="No organizations to bill"
                  description="Billing rows show up once organizations sign up or start a trial."
                />
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
                  <thead>
                    <tr>
                      {[
                        "Organization",
                        "Status",
                        "Trial Started",
                        "Trial Ends",
                        "Period End",
                        "Cancel At",
                        "Seats",
                        "App Users",
                        "Delta",
                        "Stripe",
                        "Updated",
                        "Actions",
                      ].map((heading) => (
                        <th key={heading} style={thStyle}>
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {billing.organizations.map((org) => {
                      const risky =
                        billing.riskOrganizations.some(
                          (candidate) => candidate.orgId === org.orgId,
                        ) ||
                        (org.seatDelta != null && org.seatDelta < 0);
                      return (
                        <tr
                          key={org.orgId}
                          onClick={() => onSelectOrg(org.orgId, "billing")}
                          style={{
                            cursor: "pointer",
                            background: risky ? "var(--color-danger-bg)" : undefined,
                          }}
                        >
                          <td style={{ ...tdStyle, fontWeight: 700 }}>{org.orgName}</td>
                          <td style={{ ...tdStyle, color: statusToneFor(org), fontWeight: 800 }}>
                            {statusLabelFor(org)}
                          </td>
                          <td style={tdStyle}>
                            {org.trialStartedAt
                              ? new Date(org.trialStartedAt).toLocaleDateString()
                              : isTrialPending(org)
                                ? "Not started"
                                : "—"}
                          </td>
                          <td style={tdStyle}>{formatTrialEnds(org)}</td>
                          <td style={tdStyle}>{formatDate(org.currentPeriodEnd)}</td>
                          <td
                            style={{
                              ...tdStyle,
                              color: org.cancelAt
                                ? "var(--color-warning)"
                                : "var(--color-text-muted)",
                              fontWeight: org.cancelAt ? 700 : undefined,
                            }}
                          >
                            {formatDate(org.cancelAt)}
                          </td>
                          <td style={tdStyle}>{org.seats ?? "—"}</td>
                          <td style={tdStyle}>{org.appUsers}</td>
                          <td
                            style={{
                              ...tdStyle,
                              color:
                                org.seatDelta != null && org.seatDelta < 0
                                  ? "var(--color-danger)"
                                  : "var(--color-text-muted)",
                              fontWeight: 700,
                            }}
                          >
                            {org.seatDelta ?? "—"}
                          </td>
                          <td style={tdStyle}>
                            {org.stripeCustomerId ? (
                              <a
                                href={`https://dashboard.stripe.com/customers/${org.stripeCustomerId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                style={{ color: "var(--color-brand)", fontWeight: 700 }}
                              >
                                Connected
                              </a>
                            ) : (
                              "Missing"
                            )}
                          </td>
                          <td style={tdStyle}>{formatDate(org.updatedAt)}</td>
                          <td style={tdStyle}>
                            <BillingRowActions
                              org={org}
                              busy={busyOrgId === org.orgId}
                              onSync={handleSync}
                              onSyncSeats={handleSyncSeats}
                              onExtendTrial={handleExtendTrial}
                              onCancel={handleCancel}
                              onCancelAtPeriodEnd={handleCancelAtPeriodEnd}
                              onOverrideStatus={handleOverrideStatus}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      <BillingConfirmDialog
        action={confirmAction}
        isLoading={subscriptionMutation.isPending || syncMutation.isPending}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ExtendTrialDialog
        org={extendTrialOrg}
        days={trialDays}
        isLoading={subscriptionMutation.isPending}
        onDaysChange={setTrialDays}
        onConfirm={handleConfirmExtendTrial}
        onCancel={() => setExtendTrialOrg(null)}
      />
    </>
  );
}
