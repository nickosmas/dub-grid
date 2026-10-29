import AuditLogView from "@/components/gridmaster/AuditLogView";
import CustomSelect from "@/components/CustomSelect";
import { Button } from "@/components/Button";
import { useGridmasterBillingActions } from "@/components/gridmaster/useGridmasterBillingActions";
import { OrganizationBillingPolicyCard } from "@/components/gridmaster/BillingPolicyCards";
import { OrgSeatHistoryCard } from "@/components/gridmaster/BillingHistoryCards";
import {
  billingActionStates,
  disabledActionSummary,
  displayStatusFor,
  holdControlsFor,
  stripeDashboardUrl,
  summarizeReasons,
  trialActionReasons,
} from "@/components/gridmaster/gridmaster-billing-rules";
import { InfoRow } from "@/components/gridmaster/organization-detail/shared";
import { fetchGridmasterOrgBilling } from "@/features/gridmaster/client";
import { formatBillingStatusLabel, formatClientErrorMessage } from "@/lib/client-facing";
import { evaluateOrganizationBillingAccess, trialControls } from "@dubgrid/domain";
import { queryKeys } from "@/lib/query-keys";
import { sectionBodyStyle, sectionHeaderStyle, sectionStyle } from "@/lib/styles";
import { type Organization } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";

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
  return value ? new Date(value).toLocaleDateString() : "-";
}

export function billingStatusTone(status: string | null) {
  if (status === "active" || status === "trialing") return "var(--dg-color-success-text)";
  if (status === "billing_paused") return "var(--dg-color-info-text)";
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
      ? "var(--dg-color-success-text)"
      : tone === "warning"
        ? "var(--dg-color-warning-text)"
        : tone === "danger"
          ? "var(--dg-color-danger-text)"
          : "var(--dg-color-text-primary)";

  return (
    <div data-stat-card style={{ ...sectionStyle, padding: "14px 16px" }}>
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

const actionNoteStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--dg-fs-caption)",
  color: "var(--dg-color-text-muted)",
};

export function BillingTab({ organization }: { organization: Organization }) {
  const [status, setStatus] = useState<string>("");
  const actions = useGridmasterBillingActions();
  const billingQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgBilling(organization.id),
    queryFn: () => fetchGridmasterOrgBilling(organization.id),
    staleTime: 30_000,
  });
  const billingOrg = billingQuery.data?.organization ?? null;
  const busy = actions.busyOrgId !== null;
  const running = (...kinds: NonNullable<typeof actions.busyAction>[]) =>
    actions.busyAction !== null && kinds.includes(actions.busyAction);

  // Start the override select on the current status, never on a default that
  // one click would apply.
  useEffect(() => {
    setStatus(billingOrg?.status ?? "");
  }, [billingOrg?.status]);

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
          Loading billing
        </div>
      </div>
    );
  }

  if (billingQuery.error instanceof Error) {
    return (
      <Banner tone="danger">
        {formatClientErrorMessage(
          billingQuery.error,
          "We couldn't load your billing details. Refresh and try again.",
        )}
      </Banner>
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

  const { values: policy } = billingOrg.policy;
  const displayStatus = displayStatusFor(billingOrg);
  const hold = billingOrg.billingHold;
  const access = evaluateOrganizationBillingAccess({
    subscriptionStatus: billingOrg.status,
    trialEndsAt: billingOrg.trialEndsAt,
    billingPausedAt: hold?.pausedAt ?? null,
    paymentGraceStartedAt: billingOrg.paymentGraceStartedAt,
    trialGraceDays: policy.trialGraceDays,
    trialAdminNoticeDays: policy.trialReminderDays,
    paymentGraceDays: policy.paymentGraceDays,
  });
  const mode = billingQuery.data?.stripeMode ?? null;
  const stripeActions = billingActionStates(billingOrg);
  const stripeActionNotes = disabledActionSummary(stripeActions);
  const trial = trialControls({
    status: billingOrg.status,
    trialEndsAt: billingOrg.trialEndsAt,
    hasStripeSubscription: Boolean(billingOrg.stripeSubscriptionId),
    billingPausedAt: hold?.pausedAt ?? null,
  });
  const trialReasons = trialActionReasons(trial);
  const holdControls = holdControlsFor(billingOrg);
  const holdNotes = summarizeReasons([
    [hold ? "Resume billing" : "Pause billing", hold ? null : holdControls.pause.reason],
    ["Extend grace", holdControls.extendGrace.reason],
  ]);
  const trialNotes = summarizeReasons([
    ["Change trial", trialReasons.change],
    ["End trial", trialReasons.end],
  ]);
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
        <BillingMetric label="Stripe seats" value={billingOrg.seats ?? "-"} />
        <BillingMetric label="App users" value={billingOrg.appUsers} />
        <BillingMetric label="Seat delta" value={billingOrg.seatDelta ?? "-"} tone={deltaTone} />
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
                <span style={{ color: billingStatusTone(displayStatus), fontWeight: 600 }}>
                  {formatBillingStatusLabel(displayStatus)}
                </span>
              }
            />
            <InfoRow
              label="Access"
              value={
                access.isLocked
                  ? "Locked"
                  : access.state === "paused"
                    ? "Open while billing is paused"
                    : access.state === "payment_attention_required" && access.paymentGraceEndsAt
                      ? `Open until ${formatBillingDate(access.paymentGraceEndsAt)}, then locks`
                      : access.state === "trial_grace" && access.trialGraceEndsAt
                        ? `Open until ${formatBillingDate(access.trialGraceEndsAt)}, then locks`
                        : "Open"
              }
            />
            {hold && (
              <InfoRow
                label="Paused"
                value={
                  <span>
                    Since {formatBillingDate(hold.pausedAt)}
                    {hold.reason && (
                      <span style={{ display: "block", color: "var(--dg-color-text-muted)" }}>
                        {hold.reason}
                      </span>
                    )}
                  </span>
                }
              />
            )}
            <InfoRow
              label="Trial started"
              value={
                billingOrg.trialStartedAt
                  ? new Date(billingOrg.trialStartedAt).toLocaleDateString()
                  : billingOrg.status === "trialing" || !billingOrg.status
                    ? "Not started"
                    : "-"
              }
            />
            <InfoRow
              label="Trial ends"
              value={
                billingOrg.trialEndsAt
                  ? new Date(billingOrg.trialEndsAt).toLocaleDateString()
                  : billingOrg.status === "trialing" || !billingOrg.status
                    ? "Not started"
                    : "-"
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
                    href={stripeDashboardUrl(mode, "customers", billingOrg.stripeCustomerId)}
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
              value={
                billingOrg.stripeSubscriptionId ? (
                  <a
                    href={stripeDashboardUrl(
                      mode,
                      "subscriptions",
                      billingOrg.stripeSubscriptionId,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--dg-color-brand)", fontWeight: 700 }}
                  >
                    {billingOrg.stripeSubscriptionId}
                  </a>
                ) : (
                  "Not connected"
                )
              }
            />
            <InfoRow label="Org slug" value={billingOrg.orgSlug ?? "-"} />
          </div>
        </div>
      </div>

      <OrganizationBillingPolicyCard org={billingOrg} />

      <OrgSeatHistoryCard orgId={billingOrg.orgId} />

      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Billing Actions</div>
        <div style={{ ...sectionBodyStyle, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={busy || !stripeActions.sync.enabled}
              onClick={() => actions.confirm({ kind: "sync_billing", org: billingOrg })}
            >
              Sync Stripe
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={busy || !stripeActions.trueUp.enabled}
              loading={running("sync_seats")}
              onClick={() => actions.confirm({ kind: "sync_seats", org: billingOrg })}
            >
              True up seats
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={busy || !stripeActions.cancelAtPeriodEnd.enabled}
              loading={running("cancel_at_period_end")}
              onClick={() => actions.confirm({ kind: "cancel_at_period_end", org: billingOrg })}
            >
              Cancel at period end
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-danger dg-btn-sm"
              disabled={busy || !stripeActions.cancel.enabled}
              loading={running("cancel")}
              onClick={() => actions.confirm({ kind: "cancel", org: billingOrg })}
            >
              Cancel
            </Button>
          </div>
          {stripeActionNotes.length > 0 && (
            <div style={{ display: "grid", gap: 2, marginTop: -6 }}>
              {stripeActionNotes.map((note) => (
                <p key={note} style={actionNoteStyle}>
                  {note}
                </p>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Button
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                disabled={busy || !trial.change}
                loading={running("set_trial_days")}
                onClick={() => actions.changeTrial(billingOrg)}
              >
                Change trial
              </Button>
              <Button
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                disabled={busy || Boolean(trialReasons.end)}
                loading={running("end_trial", "expire_trial")}
                onClick={() => actions.endTrial(billingOrg)}
              >
                End trial
              </Button>
            </div>
            {trialNotes.map((note) => (
              <p key={note} style={actionNoteStyle}>
                {note}
              </p>
            ))}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {hold ? (
                <Button
                  type="button"
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                  disabled={busy}
                  loading={running("resume_billing")}
                  onClick={() => actions.confirm({ kind: "resume_billing", org: billingOrg })}
                >
                  Resume billing
                </Button>
              ) : (
                <Button
                  type="button"
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                  disabled={busy || !holdControls.pause.allowed}
                  loading={running("pause_billing")}
                  onClick={() => actions.pauseBilling(billingOrg)}
                >
                  Pause billing
                </Button>
              )}
              <Button
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                disabled={busy || !holdControls.extendGrace.allowed}
                loading={running("extend_grace")}
                onClick={() => actions.extendGrace(billingOrg)}
              >
                Extend grace
              </Button>
            </div>
            {holdNotes.map((note) => (
              <p key={note} style={actionNoteStyle}>
                {note}
              </p>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <CustomSelect
              ariaLabel={`Billing status for ${billingOrg.orgName}`}
              value={status}
              placeholder="Choose a status"
              disabled={busy}
              onChange={setStatus}
              options={BILLING_STATUSES.map((nextStatus) => ({
                value: nextStatus,
                label: formatBillingStatusLabel(nextStatus),
              }))}
              height={34}
              fontSize="var(--dg-fs-label)"
            />
            <Button
              type="button"
              className="dg-btn dg-btn-primary dg-btn-sm"
              disabled={busy || !status || status === billingOrg.status}
              loading={running("override_status")}
              onClick={() => actions.confirm({ kind: "override_status", org: billingOrg, status })}
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
        timeZone={organization.timezone ?? null}
      />
      {actions.dialogs}
    </div>
  );
}
