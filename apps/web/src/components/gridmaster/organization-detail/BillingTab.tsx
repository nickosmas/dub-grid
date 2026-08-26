import AuditLogView from "@/components/gridmaster/AuditLogView";
import CustomSelect from "@/components/CustomSelect";
import { Button } from "@/components/Button";
import {
  BillingConfirmDialog,
  ExtendTrialDialog,
  type BillingConfirmAction,
} from "@/components/gridmaster/BillingActionDialogs";
import { InfoRow } from "@/components/gridmaster/organization-detail/shared";
import {
  fetchGridmasterBilling,
  syncGridmasterBilling,
  updateGridmasterSubscription,
} from "@/features/gridmaster/client";
import { formatBillingStatusLabel, formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { sectionBodyStyle, sectionHeaderStyle, sectionStyle } from "@/lib/styles";
import { type GridmasterBillingOrgSummary, type Organization } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Billing tab for the gridmaster OrganizationDetail view.

export const BILLING_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
] as const;

export function formatBillingDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export function billingStatusTone(status: string | null) {
  if (status === "active" || status === "trialing") return "var(--dg-color-success)";
  if (status === "past_due" || status === "incomplete") return "var(--dg-color-warning)";
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired")
    return "var(--dg-color-danger)";
  return "var(--dg-color-text-muted)";
}

export function billingStatusIsPending(status: string | null, trialEndsAt: string | null) {
  return status === "trialing" && !trialEndsAt;
}

export function BillingMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  const color =
    tone === "good"
      ? "var(--dg-color-success)"
      : tone === "warning"
        ? "var(--dg-color-warning)"
        : tone === "danger"
          ? "var(--dg-color-danger)"
          : "var(--dg-color-text-primary)";

  return (
    <div style={{ ...sectionStyle, padding: "14px 16px" }}>
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
          color: "var(--dg-color-text-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function BillingTab({ organization }: { organization: Organization }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("active");
  const [confirmAction, setConfirmAction] = useState<BillingConfirmAction | null>(null);
  const [extendTrialOrg, setExtendTrialOrg] = useState<GridmasterBillingOrgSummary | null>(null);
  const [trialDays, setTrialDays] = useState("14");
  const billingQuery = useQuery({
    queryKey: queryKeys.gridmaster.billing(),
    queryFn: fetchGridmasterBilling,
    staleTime: 30_000,
  });
  const billingOrg =
    billingQuery.data?.organizations.find((org) => org.orgId === organization.id) ?? null;

  useEffect(() => {
    if (!billingOrg?.status) return;
    setStatus(
      BILLING_STATUSES.includes(billingOrg.status as (typeof BILLING_STATUSES)[number])
        ? billingOrg.status
        : "active",
    );
  }, [billingOrg?.status]);

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
      setBusy(false);
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
      setBusy(false);
      setConfirmAction(null);
      setExtendTrialOrg(null);
    },
  });

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
    setBusy(true);
    subscriptionMutation.mutate({
      orgId: extendTrialOrg.orgId,
      action: "extend_trial",
      trialDays: days,
    });
  }

  function handleSync(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "sync_billing", org });
  }

  function handleSyncSeats(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "sync_seats", org });
  }

  function handleCancelAtPeriodEnd(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "cancel_at_period_end", org });
  }

  function handleCancel(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "cancel", org });
  }

  function handleOverrideStatus(org: GridmasterBillingOrgSummary) {
    setConfirmAction({ kind: "override_status", org, status });
  }

  function handleConfirmAction() {
    if (!confirmAction) return;

    setBusy(true);
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

  if (billingQuery.isLoading) {
    return (
      <div style={sectionStyle}>
        <div
          style={{
            padding: 24,
            color: "var(--dg-color-text-muted)",
            fontSize: "var(--dg-fs-label)",
          }}
        >
          Loading billing…
        </div>
      </div>
    );
  }

  if (billingQuery.error instanceof Error) {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: "var(--dg-color-danger-bg)",
          color: "var(--dg-color-danger)",
          borderRadius: "var(--dg-radius-lg)",
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
        }}
      >
        {formatClientErrorMessage(
          billingQuery.error,
          "We couldn't load your billing details. Refresh and try again.",
        )}
      </div>
    );
  }

  if (!billingOrg) {
    return (
      <div style={sectionStyle}>
        <div style={{ padding: 24 }}>
          <h3
            style={{
              margin: "0 0 6px",
              fontSize: "var(--dg-fs-section-title)",
              color: "var(--dg-color-text-primary)",
            }}
          >
            Billing summary unavailable
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-muted)",
            }}
          >
            Refresh billing oversight to rebuild this organization&apos;s billing snapshot.
          </p>
        </div>
      </div>
    );
  }

  const deltaTone =
    billingOrg.seatDelta == null
      ? "neutral"
      : billingOrg.seatDelta < 0
        ? "danger"
        : billingOrg.seatDelta > 0
          ? "warning"
          : "good";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
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
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
            }}
          >
            Billing
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-muted)",
              fontWeight: 600,
            }}
          >
            Manage this organization&apos;s Stripe status, trial timing, cancellation state, and
            billable app-user seat count.
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <BillingMetric label="Stripe seats" value={billingOrg.seats ?? "—"} />
        <BillingMetric label="App users" value={billingOrg.appUsers} />
        <BillingMetric label="Seat delta" value={billingOrg.seatDelta ?? "—"} tone={deltaTone} />
        <BillingMetric label="Employees" value={billingOrg.employeeCount} />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}
      >
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Subscription State</div>
          <div style={sectionBodyStyle}>
            <InfoRow
              label="Status"
              value={
                billingStatusIsPending(billingOrg.status, billingOrg.trialEndsAt) ? (
                  <span style={{ color: "var(--dg-color-text-muted)", fontWeight: 800 }}>
                    Trial pending
                  </span>
                ) : (
                  <span style={{ color: billingStatusTone(billingOrg.status), fontWeight: 800 }}>
                    {formatBillingStatusLabel(billingOrg.status)}
                  </span>
                )
              }
            />
            <InfoRow
              label="Trial started"
              value={
                billingOrg.trialStartedAt
                  ? new Date(billingOrg.trialStartedAt).toLocaleDateString()
                  : billingOrg.status === "trialing" || !billingOrg.status
                    ? "Not started"
                    : "—"
              }
            />
            <InfoRow
              label="Trial ends"
              value={
                billingOrg.trialEndsAt
                  ? new Date(billingOrg.trialEndsAt).toLocaleDateString()
                  : billingOrg.status === "trialing" || !billingOrg.status
                    ? "Not started"
                    : "—"
              }
            />
            <InfoRow label="Period end" value={formatBillingDate(billingOrg.currentPeriodEnd)} />
            <InfoRow label="Cancel at" value={formatBillingDate(billingOrg.cancelAt)} />
            <InfoRow label="Canceled at" value={formatBillingDate(billingOrg.canceledAt)} />
            <InfoRow label="Updated" value={formatBillingDate(billingOrg.updatedAt)} />
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Stripe Links</div>
          <div style={sectionBodyStyle}>
            <InfoRow
              label="Customer"
              value={
                billingOrg.stripeCustomerId ? (
                  <a
                    href={`https://dashboard.stripe.com/customers/${billingOrg.stripeCustomerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--dg-color-brand)", fontWeight: 700 }}
                  >
                    {billingOrg.stripeCustomerId}
                  </a>
                ) : (
                  "Not connected"
                )
              }
            />
            <InfoRow
              label="Subscription"
              value={billingOrg.stripeSubscriptionId ?? "Not connected"}
            />
            <InfoRow label="Org slug" value={billingOrg.orgSlug ?? "—"} />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Billing Actions</div>
        <div style={{ ...sectionBodyStyle, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={busy || !billingOrg.stripeCustomerId}
              onClick={() => handleSync(billingOrg)}
            >
              Sync Stripe
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={
                busy || !billingOrg.stripeSubscriptionId || billingOrg.seats === billingOrg.appUsers
              }
              onClick={() => handleSyncSeats(billingOrg)}
            >
              True up seats
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={busy}
              onClick={() => handleExtendTrial(billingOrg)}
            >
              Extend trial
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={
                busy ||
                !billingOrg.stripeSubscriptionId ||
                billingOrg.status === "canceled" ||
                !!billingOrg.cancelAt
              }
              onClick={() => handleCancelAtPeriodEnd(billingOrg)}
            >
              End period
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-danger dg-btn-sm"
              disabled={busy || billingOrg.status === "canceled"}
              onClick={() => handleCancel(billingOrg)}
            >
              Cancel
            </Button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <CustomSelect
              ariaLabel={`Billing status for ${billingOrg.orgName}`}
              value={status}
              disabled={busy}
              onChange={setStatus}
              options={BILLING_STATUSES.map((nextStatus) => ({
                value: nextStatus,
                label: formatBillingStatusLabel(nextStatus),
              }))}
              style={{ width: 180 }}
              height={34}
              fontSize="var(--dg-fs-label)"
            />
            <Button
              type="button"
              className="dg-btn dg-btn-primary dg-btn-sm"
              disabled={busy || status === billingOrg.status}
              onClick={() => handleOverrideStatus(billingOrg)}
            >
              Override status
            </Button>
          </div>
        </div>
      </div>

      <AuditLogView
        orgId={organization.id}
        title="Billing Activity"
        initialActionFilter="billing"
      />
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
    </div>
  );
}
