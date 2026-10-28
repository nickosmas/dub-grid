"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarDays,
  Clock,
  CreditCard,
  ExternalLink,
  LogOut,
  ReceiptText,
  RefreshCw,
  Scale,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { MaybeHint } from "@/components/ui/hint";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import {
  completeBillingCheckout,
  fetchOrganizationBilling,
  openBillingPortal,
  startBillingCheckout,
} from "@/features/billing/client";
import {
  billingToneColors,
  describeBillingNotice,
  describeBillingStatus,
  describeSeatDifference,
  describeTrialMetrics,
  type BillingTone,
} from "@/features/billing/trial-status";
import { useClientFeatureFlags, useIsInSandbox, useLogout, useSandboxSourceOrgId } from "@/hooks";
import { describeAction, formatDetails, formatRelativeTime } from "@/lib/activity-log-utils";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { sectionBodyStyle, sectionHeaderStyle, sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import type { BillingOperationSummary, FullAuditLogEntry, SeatBreakdown } from "@/types";
import { describeSeatBreakdown, type SeatBreakdownLine } from "@/features/billing/seats";
import { ButtonLoading } from "@/components/ButtonSpinner";

function formatDate(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ label, tone }: { label: string; tone: BillingTone }) {
  const colors = billingToneColors(tone);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "0 9px",
        borderRadius: "9999px",
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        fontSize: "var(--dg-fs-caption)",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function NoticeBanner({ tone, children }: { tone: BillingTone; children: ReactNode }) {
  const colors = billingToneColors(tone);
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        padding: "10px 12px",
        borderRadius: "var(--dg-radius-md)",
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        fontSize: "var(--dg-fs-label)",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function SeatLines({
  title,
  lines,
  total,
}: {
  title: string;
  lines: SeatBreakdownLine[];
  /** The billed seats each line is a share of; left out for lines that aren't billed. */
  total?: number;
}) {
  if (lines.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div
        style={{
          fontSize: "var(--dg-type-metadata-size)",
          color: "var(--dg-type-metadata-color)",
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {lines.map((line) => (
          <li
            key={line.key}
            style={{
              padding: "8px 0",
              borderTop: "1px solid var(--dg-color-border-light)",
              fontSize: "var(--dg-fs-label)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "var(--dg-color-text-primary)", fontWeight: 500 }}>
                {line.label}
              </span>
              <span
                className="dg-tabular-nums"
                style={{ color: "var(--dg-color-text-primary)", fontWeight: 600 }}
              >
                {total ? seatShareLabel(line.count, total) : line.count}
              </span>
            </div>
            {total ? (
              <div
                aria-hidden="true"
                style={{
                  marginTop: 6,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--dg-color-border-light)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round((line.count / total) * 100)}%`,
                    height: "100%",
                    background: "var(--dg-color-primary)",
                  }}
                />
              </div>
            ) : null}
            {line.detail && (
              <div
                style={{
                  marginTop: 2,
                  color: "var(--dg-color-text-muted)",
                  fontSize: "var(--dg-fs-caption)",
                }}
              >
                {line.detail}
              </div>
            )}
          </li>
        ))}
        {total ? (
          <li
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 0 0",
              borderTop: "1px solid var(--dg-color-border)",
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
              color: "var(--dg-color-text-primary)",
            }}
          >
            <span>Billed seats</span>
            <span className="dg-tabular-nums">{total}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** "1 seat", or "25 of 31 seats": how much of the bill a group makes up. */
function seatShareLabel(count: number, total: number): string {
  if (count === total) return `${count} ${count === 1 ? "seat" : "seats"}`;
  return `${count} of ${total} seats`;
}

function SeatBreakdownSection({ breakdown }: { breakdown: SeatBreakdown }) {
  const { billed, notBilled } = describeSeatBreakdown(breakdown);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 18,
        border: "1px solid var(--dg-color-border-light)",
        borderRadius: "var(--dg-radius-lg)",
        padding: "12px 14px",
      }}
    >
      <SeatLines title="Who takes a seat" lines={billed} total={breakdown.total} />
      <SeatLines title="Not billed" lines={notBilled} />
    </div>
  );
}

function BillingMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: BillingTone;
}) {
  const accent = billingToneColors(tone ?? "info");
  const color = tone ? accent.text : "var(--dg-color-text-primary)";
  const iconAccent = { bg: accent.bg, color: accent.text };

  return (
    <div
      data-stat-card
      style={{
        border: "1px solid var(--dg-color-border-light)",
        borderRadius: "var(--dg-radius-lg)",
        padding: "12px 14px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            minWidth: 0,
            fontSize: "var(--dg-type-metadata-size)",
            color: "var(--dg-type-metadata-color)",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--dg-radius-lg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: iconAccent.bg,
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={1.7} color={iconAccent.color} aria-hidden="true" />
        </div>
      </div>
      <div
        style={{
          fontSize: "clamp(1.45rem, 1.8vw, 1.85rem)",
          fontWeight: 700,
          color,
          letterSpacing: "-0.04em",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function BillingOperations({ operations }: { operations: BillingOperationSummary[] }) {
  const [selectedOperation, setSelectedOperation] = useState<BillingOperationSummary | null>(null);

  function openOperation(operation: BillingOperationSummary) {
    setSelectedOperation(operation);
  }

  return (
    <>
      <section
        aria-labelledby="recent-billing-operations-heading"
        style={{
          ...sectionStyle,
          width: "100%",
        }}
      >
        <div
          style={{
            ...sectionHeaderStyle,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ReceiptText size={15} aria-hidden="true" />
          <span id="recent-billing-operations-heading">Recent billing operations</span>
        </div>
        <div style={sectionBodyStyle}>
          {operations.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<ReceiptText size={22} />}
              title="No billing activity yet"
            />
          ) : (
            <div
              data-settings-table-layout="distributed"
              style={{ width: "100%", maxWidth: "100%", overflowX: "auto" }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: 680,
                  maxWidth: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Activity</th>
                    <th style={thStyle}>Source</th>
                    <th style={thStyle}>When</th>
                    <th style={thStyle} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {operations.map((operation) => (
                    <tr key={operation.id}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{operation.label}</td>
                      <td style={tdStyle}>{operation.actorLabel}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: "var(--dg-color-text-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatRelativeTime(operation.createdAt)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <Button
                          type="button"
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                          onClick={() => openOperation(operation)}
                        >
                          View details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      {selectedOperation ? (
        <BillingOperationDetailsDialog
          operation={selectedOperation}
          onClose={() => setSelectedOperation(null)}
        />
      ) : null}
    </>
  );
}

function BillingOperationDetailsDialog({
  operation,
  onClose,
}: {
  operation: BillingOperationSummary;
  onClose: () => void;
}) {
  const entry = billingOperationToAuditEntry(operation);
  const details = formatDetails(entry);
  const description = describeAction(entry);
  const createdAt = formatTimestamp(operation.createdAt);

  return (
    <Modal
      title="Billing activity details"
      onClose={onClose}
      style={{ maxWidth: 560, width: "min(560px, calc(100vw - 32px))" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              color: "var(--dg-color-text-primary)",
              fontSize: "var(--dg-fs-card-title)",
              fontWeight: 600,
            }}
          >
            {operation.label}
          </div>
          <div
            style={{
              color: "var(--dg-color-text-muted)",
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
            }}
          >
            {description}
          </div>
        </div>

        <DetailRows
          rows={[
            ["Source", operation.actorLabel],
            ["When", createdAt],
            ["Action", operation.label],
            ["Record type", formatResourceType(operation.resourceType)],
          ]}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="dg-type-content-group-heading">Event details</div>
          {details.length > 0 ? (
            <DetailRows rows={details.map((item) => [item.label, item.value])} />
          ) : (
            <div
              style={{
                color: "var(--dg-color-text-muted)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
              }}
            >
              No additional details were recorded.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DetailRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(96px, max-content) minmax(0, 1fr)",
        gap: "8px 14px",
        margin: 0,
      }}
    >
      {rows.map(([label, value]) => (
        <FragmentRow key={`${label}:${value}`} label={label} value={value} />
      ))}
    </dl>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt
        style={{
          color: "var(--dg-color-text-muted)",
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 600,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          color: "var(--dg-color-text-primary)",
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          margin: 0,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </dd>
    </>
  );
}

function billingOperationToAuditEntry(operation: BillingOperationSummary): FullAuditLogEntry {
  const id = Number(operation.id);
  return {
    id: Number.isFinite(id) ? id : 0,
    orgId: null,
    orgName: null,
    actorId: null,
    actorEmail: null,
    actorName: operation.actorLabel,
    action: operation.action,
    resourceType: operation.resourceType,
    resourceId: operation.resourceId,
    targetLabel: null,
    targetEmail: null,
    details: operation.details,
    createdAt: operation.createdAt,
  };
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });
}

function formatResourceType(value: string): string {
  return value
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type BillingMetricConfig = {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: BillingTone;
};

const TRIAL_METRIC_ICONS: Record<string, LucideIcon> = {
  "trial-time-left": Clock,
  "trial-ends": CalendarDays,
  "trial-ended": CalendarDays,
  "access-ends": CalendarClock,
};

export default function BillingSettings({ organization }: { organization: { id: string } }) {
  const queryClient = useQueryClient();
  const { signOut } = useLogout();
  const isInSandbox = useIsInSandbox();
  const sandboxSourceOrgId = useSandboxSourceOrgId();
  const featureFlags = useClientFeatureFlags();
  const searchParams = useSearchParams();
  const handledBillingReturnRef = useRef<string | null>(null);
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const billingResult = searchParams.get("billing");
  const checkoutSessionId = searchParams.get("stripe_checkout_session_id");
  // In sandbox mode the active org is the sandbox clone, which has no
  // real Stripe state. Display the source organization's billing instead so
  // the user can see what's actually billed. Action buttons are still
  // gated by isInSandbox below, so the source-org data is read-only here.
  const billingOrgId = isInSandbox && sandboxSourceOrgId ? sandboxSourceOrgId : organization.id;
  const billingQuery = useQuery({
    queryKey: queryKeys.org.billing(billingOrgId),
    queryFn: () => fetchOrganizationBilling(billingOrgId),
    staleTime: 30_000,
  });
  const billing = billingQuery.data;

  useEffect(() => {
    const returnKey = `${billingResult ?? ""}:${checkoutSessionId ?? ""}`;
    if (!billingResult || handledBillingReturnRef.current === returnKey) return;
    handledBillingReturnRef.current = returnKey;

    function clearBillingReturnParams() {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      url.searchParams.delete("billing");
      url.searchParams.delete("stripe_checkout_session_id");
      window.history.replaceState(null, "", url.toString());
    }

    if (billingResult === "success") {
      if (checkoutSessionId) {
        completeBillingCheckout({
          orgId: organization.id,
          sessionId: checkoutSessionId,
        })
          .then(() => {
            toast.success("Billing updated");
            void queryClient.invalidateQueries({
              queryKey: queryKeys.org.billing(organization.id),
            });
          })
          .catch((error) => {
            toast.error(
              formatClientErrorMessage(
                error,
                "Checkout completed, but billing could not be synced",
              ),
            );
          })
          .finally(clearBillingReturnParams);
      } else {
        toast.success("Billing updated");
        void queryClient.invalidateQueries({
          queryKey: queryKeys.org.billing(organization.id),
        });
        clearBillingReturnParams();
      }
    } else if (billingResult === "canceled") {
      toast.info("Billing setup canceled");
      clearBillingReturnParams();
    }
  }, [billingResult, checkoutSessionId, organization.id, queryClient]);

  const returnUrl = useMemo(() => {
    if (typeof window === "undefined") return "/settings?section=org-billing";
    return `${window.location.origin}/settings?section=org-billing`;
  }, []);

  async function handleCheckout() {
    setOpeningCheckout(true);
    try {
      const url = await startBillingCheckout({
        orgId: organization.id,
        returnUrl,
      });
      window.location.assign(url);
    } catch (error) {
      toast.error(formatClientErrorMessage(error, "We couldn't start checkout. Try again."));
    } finally {
      setOpeningCheckout(false);
    }
  }

  async function handlePortal() {
    setOpeningPortal(true);
    try {
      const url = await openBillingPortal({
        orgId: organization.id,
        returnUrl,
      });
      window.location.assign(url);
    } catch (error) {
      toast.error(
        formatClientErrorMessage(error, "We couldn't open the billing portal. Try again."),
      );
    } finally {
      setOpeningPortal(false);
    }
  }

  const seatTone: BillingTone | undefined =
    billing?.seatDelta != null && billing.seatDelta < 0 ? "danger" : undefined;
  const isTrialPending = Boolean(billing) && billing!.billingAccess.state === "trial_pending";
  const primaryAction =
    billing?.hasStripeCustomer && billing.hasStripeSubscription
      ? "Manage billing"
      : "Start subscription";
  const showSignOut = billing?.billingAccess.isLocked === true;
  const statusBadge = billing ? describeBillingStatus(billing) : null;
  const billingNotice = billing ? describeBillingNotice(billing) : null;
  const billingMetrics: BillingMetricConfig[] = [];
  if (billing) {
    billingMetrics.push({
      key: "app-users",
      icon: Users,
      label: "Billable users",
      value: billing.appUserCount,
    });
    if (billing.subscriptionSeats != null) {
      billingMetrics.push({
        key: "billed-seats",
        icon: CreditCard,
        label: "Billed seats",
        value: billing.subscriptionSeats,
        tone: seatTone,
      });
    }
    if (billing.seatDelta != null) {
      billingMetrics.push({
        key: "seat-delta",
        icon: Scale,
        label: "Seat difference",
        value: describeSeatDifference(billing.seatDelta),
        tone: seatTone,
      });
    }
    for (const metric of describeTrialMetrics(billing)) {
      billingMetrics.push({
        ...metric,
        icon: TRIAL_METRIC_ICONS[metric.key] ?? CalendarDays,
      });
    }
    if (billing.currentPeriodEnd) {
      billingMetrics.push({
        key: "renewal",
        icon: CalendarClock,
        label: "Renewal",
        value: formatDate(billing.currentPeriodEnd),
      });
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        width: "100%",
      }}
    >
      <div style={{ ...sectionStyle, width: "100%" }}>
        <div
          style={{
            ...sectionHeaderStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CreditCard size={17} />
            <span>Billing</span>
          </div>
          {statusBadge && <StatusBadge label={statusBadge.label} tone={statusBadge.tone} />}
        </div>

        <div
          style={{
            ...sectionBodyStyle,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {billingQuery.error instanceof Error && (
            <NoticeBanner tone="danger">
              {formatClientErrorMessage(
                billingQuery.error,
                "We couldn't load your billing details. Refresh and try again.",
              )}
            </NoticeBanner>
          )}

          <ProgressBar loading={billingQuery.isLoading || !billing} />

          {billingQuery.isLoading || !billing ? (
            <div
              aria-hidden
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    padding: 14,
                    borderRadius: "var(--dg-radius-md)",
                    border: "1px solid var(--dg-color-border-light)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    className="dg-skeleton"
                    style={{ width: 90, height: 10, borderRadius: "var(--dg-radius-xs)" }}
                  />
                  <div
                    className="dg-skeleton"
                    style={{ width: 64, height: 20, borderRadius: "var(--dg-radius-xs)" }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 12,
                }}
              >
                {billingMetrics.map((metric) => (
                  <BillingMetric
                    key={metric.key}
                    icon={metric.icon}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                  />
                ))}
              </div>

              {billing.seatBreakdown && <SeatBreakdownSection breakdown={billing.seatBreakdown} />}

              {billing.cancelAt && (
                <NoticeBanner tone="warning">
                  Cancellation is scheduled for {formatDate(billing.cancelAt)}.
                </NoticeBanner>
              )}

              {billing.canceledAt && (
                <NoticeBanner tone="danger">
                  Subscription was canceled on {formatDate(billing.canceledAt)}.
                </NoticeBanner>
              )}

              {!billing.stripeConfigured && (
                <NoticeBanner tone="warning">
                  Online billing isn&apos;t set up here. Contact DubGrid Support to subscribe.
                </NoticeBanner>
              )}

              {billingNotice && (
                <NoticeBanner tone={billingNotice.tone}>{billingNotice.message}</NoticeBanner>
              )}

              {isTrialPending && (
                <NoticeBanner tone="info">
                  Your trial starts the first time an administrator signs in. The countdown begins
                  then. Refresh this page to see your trial end date.
                </NoticeBanner>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    className="dg-btn dg-btn-secondary"
                    onClick={() => billingQuery.refetch()}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    Refresh
                  </Button>
                  {showSignOut && (
                    <Button
                      type="button"
                      className="dg-btn dg-btn-secondary"
                      onClick={() => signOut()}
                    >
                      <LogOut size={15} aria-hidden="true" />
                      Sign out
                    </Button>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <MaybeHint
                    content={
                      isInSandbox
                        ? "Billing actions are disabled in sandbox mode."
                        : !featureFlags.stripe
                          ? "Billing is unavailable right now. Try again in a moment."
                          : null
                    }
                  >
                    <Button
                      type="button"
                      className="dg-btn dg-btn-primary"
                      onClick={
                        billing.hasStripeCustomer && billing.hasStripeSubscription
                          ? handlePortal
                          : handleCheckout
                      }
                      disabled={
                        !billing.canManageBilling ||
                        !billing.stripeConfigured ||
                        openingCheckout ||
                        openingPortal ||
                        isInSandbox ||
                        !featureFlags.stripe
                      }
                    >
                      <ButtonLoading
                        loading={openingCheckout || openingPortal}
                        spinnerSize={15}
                        icon={<ExternalLink size={15} aria-hidden="true" />}
                      >
                        {primaryAction}
                      </ButtonLoading>
                    </Button>
                  </MaybeHint>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {billing && <BillingOperations operations={billing.recentOperations ?? []} />}
    </div>
  );
}
