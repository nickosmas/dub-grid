"use client";

import { useRef, useState } from "react";
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
import { Button } from "@/components/Button";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import { queryKeys } from "@/lib/query-keys";
import { formatBillingStatusLabel, formatClientErrorMessage } from "@/lib/client-facing";
import { sectionStyle } from "@/lib/styles";
import type { GridmasterBillingOrgSummary } from "@/types";
import { gmTableStyle, gmTdStyle, gmThStyle } from "@/components/gridmaster/table-styles";

const BILLING_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
] as const;

// Eleven columns have to fit a 1440px display without a horizontal scroll,
// so the short columns take tighter tracks than the portal default and the
// organization name keeps whatever is left.
const BILLING_COLUMN_WIDTHS: Record<string, number> = {
  Status: 118,
  "Trial Started": 98,
  "Trial Ends": 98,
  "Period End": 98,
  "Cancel At": 98,
  Seats: 64,
  "App Users": 88,
  Delta: 64,
  Stripe: 108,
  Actions: 96,
};

function billingHeaderStyle(heading: string) {
  const width = BILLING_COLUMN_WIDTHS[heading];
  return width ? { ...gmThStyle, width } : gmThStyle;
}

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
      ? "var(--dg-color-danger)"
      : tone === "warning"
        ? "var(--dg-color-warning)"
        : "var(--dg-color-text-primary)";
  return (
    <div style={{ ...sectionStyle, padding: "14px 16px", flex: "1 1 160px" }}>
      <div
        style={{
          fontSize: "var(--dg-fs-card-title)",
          fontWeight: 700,
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
  if (status === "active" || status === "trialing") return "var(--dg-color-success)";
  if (status === "past_due" || status === "incomplete") return "var(--dg-color-warning)";
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired")
    return "var(--dg-color-danger)";
  return "var(--dg-color-text-muted)";
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
  return isTrialPending(org) ? "var(--dg-color-text-muted)" : statusTone(org.status);
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
            <div
              className="dg-skeleton"
              style={{ width: 48, height: 22, borderRadius: "var(--dg-radius-xs)" }}
            />
            <div
              className="dg-skeleton"
              style={{ width: 96, height: 10, borderRadius: "var(--dg-radius-xs)" }}
            />
          </div>
        ))}
      </div>
      <div style={sectionStyle}>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div
                className="dg-skeleton"
                style={{ flex: "1 1 160px", height: 12, borderRadius: "var(--dg-radius-xs)" }}
              />
              <div className="dg-skeleton" style={{ width: 80, height: 18, borderRadius: 999 }} />
              <div
                className="dg-skeleton"
                style={{ width: 90, height: 12, borderRadius: "var(--dg-radius-xs)" }}
              />
              <div
                className="dg-skeleton"
                style={{ width: 60, height: 12, borderRadius: "var(--dg-radius-xs)" }}
              />
              <div
                className="dg-skeleton"
                style={{ width: 120, height: 28, borderRadius: "var(--dg-radius-sm)" }}
              />
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // One overflow menu per row, the control the schedule toolbar uses: seven
  // inline buttons and a status select made the Actions column wider than the
  // table and stacked them five deep on wide displays. The menu is portalled,
  // so the table's horizontal scroll container cannot clip it.
  const items: Array<{ label: string; disabled: boolean; danger?: boolean; run: () => void }> = [
    { label: "Sync Stripe", disabled: busy || !org.stripeCustomerId, run: () => onSync(org) },
    {
      label: "True up seats",
      disabled: busy || !org.stripeSubscriptionId || org.seats === org.appUsers,
      run: () => onSyncSeats(org),
    },
    // Only a trialing org has a trial to extend; for active/canceled/past_due
    // there is no trial clock, so the action would be a no-op.
    {
      label: "Extend trial",
      disabled: busy || org.status !== "trialing",
      run: () => onExtendTrial(org),
    },
    {
      label: "End at period end",
      disabled: busy || !org.stripeSubscriptionId || org.status === "canceled" || !!org.cancelAt,
      run: () => onCancelAtPeriodEnd(org),
    },
    // No Stripe subscription = nothing to cancel; use a status override to
    // change a local-only org's status instead.
    {
      label: "Cancel subscription",
      disabled: busy || org.status === "canceled" || !org.stripeSubscriptionId,
      danger: true,
      run: () => onCancel(org),
    },
  ];
  const overrides = BILLING_STATUSES.filter((status) => status !== org.status);

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Button
        ref={triggerRef}
        type="button"
        className="dg-btn dg-btn-secondary dg-btn-xs"
        aria-label={`Billing actions for ${org.orgName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        Actions
      </Button>
      {open && (
        <Menu open onOpenChange={(nextOpen) => setOpen(nextOpen)}>
          <MenuContent
            anchor={triggerRef}
            side="bottom"
            align="end"
            sideOffset={4}
            positionMethod="fixed"
            collisionPadding={8}
            finalFocus={triggerRef}
            style={{ minWidth: 200 }}
          >
            {items.map((item) => (
              <MenuItem
                key={item.label}
                disabled={item.disabled}
                className={item.danger ? "dg-menu-item--danger" : undefined}
                onClick={item.run}
              >
                {item.label}
              </MenuItem>
            ))}
            <div className="dg-menu-divider" />
            <div
              style={{
                padding: "4px 10px",
                fontSize: "var(--dg-type-field-title-size)",
                fontWeight: "var(--dg-type-field-title-weight)",
                color: "var(--dg-type-field-title-color)",
              }}
            >
              Override status
            </div>
            {overrides.map((status) => (
              <MenuItem key={status} disabled={busy} onClick={() => onOverrideStatus(org, status)}>
                {formatBillingStatusLabel(status)}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      )}
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
              fontSize: "var(--dg-type-page-title-size)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
            }}
          >
            Billing Oversight
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-muted)",
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
            background: "var(--dg-color-danger-bg)",
            color: "var(--dg-color-danger)",
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
                <table style={{ ...gmTableStyle, minWidth: 1080 }}>
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
                        "Actions",
                      ].map((heading) => (
                        <th key={heading} style={billingHeaderStyle(heading)}>
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
                            background: risky ? "var(--dg-color-danger-bg)" : undefined,
                          }}
                        >
                          <td style={{ ...gmTdStyle, fontWeight: 700 }}>{org.orgName}</td>
                          <td style={{ ...gmTdStyle, color: statusToneFor(org), fontWeight: 600 }}>
                            {statusLabelFor(org)}
                          </td>
                          <td style={gmTdStyle}>
                            {org.trialStartedAt
                              ? new Date(org.trialStartedAt).toLocaleDateString()
                              : isTrialPending(org)
                                ? "Not started"
                                : "—"}
                          </td>
                          <td style={gmTdStyle}>{formatTrialEnds(org)}</td>
                          <td style={gmTdStyle}>{formatDate(org.currentPeriodEnd)}</td>
                          <td
                            style={{
                              ...gmTdStyle,
                              color: org.cancelAt
                                ? "var(--dg-color-warning)"
                                : "var(--dg-color-text-muted)",
                              fontWeight: org.cancelAt ? 700 : undefined,
                            }}
                          >
                            {formatDate(org.cancelAt)}
                          </td>
                          <td style={gmTdStyle}>{org.seats ?? "—"}</td>
                          <td style={gmTdStyle}>{org.appUsers}</td>
                          <td
                            style={{
                              ...gmTdStyle,
                              color:
                                org.seatDelta != null && org.seatDelta < 0
                                  ? "var(--dg-color-danger)"
                                  : "var(--dg-color-text-muted)",
                              fontWeight: 700,
                            }}
                          >
                            {org.seatDelta ?? "—"}
                          </td>
                          <td style={gmTdStyle}>
                            {org.stripeCustomerId ? (
                              <a
                                href={`https://dashboard.stripe.com/customers/${org.stripeCustomerId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                style={{ color: "var(--dg-color-brand)", fontWeight: 700 }}
                              >
                                Connected
                              </a>
                            ) : (
                              "Missing"
                            )}
                          </td>
                          <td style={gmTdStyle}>
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
