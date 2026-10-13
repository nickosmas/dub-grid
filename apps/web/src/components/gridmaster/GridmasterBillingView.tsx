"use client";

import { Fragment, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGridmasterBilling } from "@/features/gridmaster/client";
import {
  useGridmasterBillingActions,
  type GridmasterBillingActions,
} from "@/components/gridmaster/useGridmasterBillingActions";
import { Button } from "@/components/Button";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import { queryKeys } from "@/lib/query-keys";
import { formatBillingStatusLabel, formatClientErrorMessage } from "@/lib/client-facing";
import { effectiveBillingStatus, trialControls } from "@dubgrid/domain";
import {
  billingActionStates,
  stripeDashboardUrl,
  trialActionReasons,
} from "@/components/gridmaster/gridmaster-billing-rules";
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
      ? "var(--dg-color-danger-text)"
      : tone === "warning"
        ? "var(--dg-color-warning-text)"
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
  if (status === "active" || status === "trialing") return "var(--dg-color-success-text)";
  if (status === "past_due" || status === "incomplete" || status === "trial_grace")
    return "var(--dg-color-warning-text)";
  if (
    status === "canceled" ||
    status === "unpaid" ||
    status === "incomplete_expired" ||
    status === "trial_expired"
  )
    return "var(--dg-color-danger-text)";
  return "var(--dg-color-text-muted)";
}

function isTrialPending(org: GridmasterBillingOrgSummary) {
  return org.status === "trialing" && !org.trialEndsAt;
}

function statusLabelFor(org: GridmasterBillingOrgSummary) {
  return formatBillingStatusLabel(effectiveBillingStatus(org.status, org.trialEndsAt));
}

function statusToneFor(org: GridmasterBillingOrgSummary) {
  return statusTone(effectiveBillingStatus(org.status, org.trialEndsAt));
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
  actions,
}: {
  org: GridmasterBillingOrgSummary;
  busy: boolean;
  actions: GridmasterBillingActions;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trial = trialControls({
    status: org.status,
    trialEndsAt: org.trialEndsAt,
    hasStripeSubscription: Boolean(org.stripeSubscriptionId),
  });

  // One overflow menu per row, the control the schedule toolbar uses: seven
  // inline buttons and a status select made the Actions column wider than the
  // table and stacked them five deep on wide displays. The menu is portalled,
  // so the table's horizontal scroll container cannot clip it.
  const stripe = billingActionStates(org);
  const trialReasons = trialActionReasons(trial);
  const menuId = useId();
  const items: Array<{
    label: string;
    disabled: boolean;
    reason?: string | null;
    danger?: boolean;
    run: () => void;
  }> = [
    {
      label: "Sync Stripe",
      disabled: busy || !stripe.sync.enabled,
      reason: stripe.sync.reason,
      run: () => actions.confirm({ kind: "sync_billing", org }),
    },
    {
      label: "True up seats",
      disabled: busy || !stripe.trueUp.enabled,
      reason: stripe.trueUp.reason,
      run: () => actions.confirm({ kind: "sync_seats", org }),
    },
    {
      label: "Change trial",
      disabled: busy || !trial.change,
      reason: trialReasons.change,
      run: () => actions.changeTrial(org),
    },
    {
      label: "End trial…",
      disabled: busy || Boolean(trialReasons.end),
      reason: trialReasons.end,
      run: () => actions.endTrial(org),
    },
    {
      label: "Cancel at period end",
      disabled: busy || !stripe.cancelAtPeriodEnd.enabled,
      reason: stripe.cancelAtPeriodEnd.reason,
      run: () => actions.confirm({ kind: "cancel_at_period_end", org }),
    },
    {
      label: "Cancel subscription",
      disabled: busy || !stripe.cancel.enabled,
      reason: stripe.cancel.reason,
      danger: true,
      run: () => actions.confirm({ kind: "cancel", org }),
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
            {items.map((item, index) => {
              const reasonId =
                item.disabled && item.reason ? `${menuId}-reason-${index}` : undefined;
              return (
                <Fragment key={item.label}>
                  <MenuItem
                    disabled={item.disabled}
                    className={item.danger ? "dg-menu-item--danger" : undefined}
                    aria-describedby={reasonId}
                    onClick={item.run}
                  >
                    {item.label}
                  </MenuItem>
                  {/* Outside the item, which fades when disabled, so it stays readable. */}
                  {reasonId && (
                    <div
                      id={reasonId}
                      style={{
                        padding: "0 10px 6px",
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {item.reason}
                    </div>
                  )}
                </Fragment>
              );
            })}
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
              <MenuItem
                key={status}
                disabled={busy}
                onClick={() => actions.confirm({ kind: "override_status", org, status })}
              >
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
  const actions = useGridmasterBillingActions();
  const { busyOrgId } = actions;
  const billingQuery = useQuery({
    queryKey: queryKeys.gridmaster.billing(),
    queryFn: fetchGridmasterBilling,
    staleTime: 30_000,
  });
  const billing = billingQuery.data;

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
            color: "var(--dg-color-danger-text)",
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
                          <td style={{ ...gmTdStyle, fontWeight: 700 }}>
                            {/* The row opens on click; this is the keyboard way in. */}
                            <button
                              type="button"
                              className="dg-table-row-link"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectOrg(org.orgId, "billing");
                              }}
                            >
                              {org.orgName}
                            </button>
                          </td>
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
                                ? "var(--dg-color-warning-text)"
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
                                  ? "var(--dg-color-danger-text)"
                                  : "var(--dg-color-text-muted)",
                              fontWeight: 700,
                            }}
                          >
                            {org.seatDelta ?? "—"}
                          </td>
                          <td style={gmTdStyle}>
                            {org.stripeCustomerId ? (
                              <a
                                href={stripeDashboardUrl(
                                  billing?.stripeMode ?? null,
                                  "customers",
                                  org.stripeCustomerId,
                                )}
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
                              actions={actions}
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
      {actions.dialogs}
    </>
  );
}
