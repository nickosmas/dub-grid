"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { EmptyState } from "@/components/EmptyState";
import {
  completeBillingCheckout,
  fetchOrganizationBilling,
  openBillingPortal,
  startBillingCheckout,
} from "@/features/billing/client";
import { useIsInSandbox, useLogout, useSandboxSourceOrgId } from "@/hooks";
import {
  describeAction,
  formatDetails,
  formatRelativeTime,
} from "@/lib/activity-log-utils";
import {
  formatBillingStatusLabel,
  formatClientErrorMessage,
} from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import {
  sectionBodyStyle,
  sectionHeaderStyle,
  sectionStyle,
  tdStyle,
  thStyle,
} from "@/lib/styles";
import type {
  BillingOperationSummary,
  FullAuditLogEntry,
  OrganizationBillingSummary,
} from "@/types";

function formatDate(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusTone(status: string | null): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case "active":
    case "trialing":
      return {
        bg: "var(--color-success-bg)",
        text: "var(--color-success)",
        border: "var(--color-success-border)",
      };
    case "past_due":
    case "incomplete":
      return {
        bg: "var(--color-warning-bg)",
        text: "var(--color-warning)",
        border: "var(--color-warning-border)",
      };
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return {
        bg: "var(--color-danger-bg)",
        text: "var(--color-danger)",
        border: "var(--color-danger-border)",
      };
    default:
      return {
        bg: "var(--color-bg-secondary)",
        text: "var(--color-text-muted)",
        border: "var(--color-border)",
      };
  }
}

function StatusBadge({ status }: { status: string | null }) {
  const tone = statusTone(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "0 9px",
        borderRadius: "9999px",
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: "var(--dg-fs-caption)",
        fontWeight: 800,
        textTransform: "capitalize",
      }}
    >
      {formatBillingStatusLabel(status)}
    </span>
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
  tone?: "danger" | "warning";
}) {
  const color =
    tone === "danger"
      ? "var(--color-danger)"
      : tone === "warning"
        ? "var(--color-warning)"
        : "var(--color-text-primary)";
  const iconAccent =
    tone === "danger"
      ? { bg: "var(--color-danger-bg)", color: "var(--color-danger)" }
      : tone === "warning"
        ? { bg: "var(--color-warning-bg)", color: "var(--color-warning)" }
        : { bg: "#EFF6FF", color: "#2563EB" };

  return (
    <div
      style={{
        border: "1px solid var(--color-border-light)",
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
            fontSize: "11px",
            color: "var(--color-text-muted)",
            fontWeight: 700,
          }}
        >
          {label}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: iconAccent.bg,
            flexShrink: 0,
          }}
        >
          <Icon
            size={18}
            strokeWidth={1.7}
            color={iconAccent.color}
            aria-hidden="true"
          />
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

function BillingOperations({
  operations,
}: {
  operations: BillingOperationSummary[];
}) {
  const [selectedOperation, setSelectedOperation] =
    useState<BillingOperationSummary | null>(null);

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
          <span id="recent-billing-operations-heading">
            Recent billing operations
          </span>
        </div>
        <div style={sectionBodyStyle}>
          {operations.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<ReceiptText size={22} />}
              title="No billing activity yet"
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Activity</th>
                    <th style={thStyle}>Source</th>
                    <th style={thStyle}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.map((operation) => (
                    <tr
                      key={operation.id}
                      tabIndex={0}
                      aria-label={`${operation.label} billing activity details`}
                      onClick={() => openOperation(operation)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openOperation(operation);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 700 }}>
                        {operation.label}
                      </td>
                      <td style={tdStyle}>{operation.actorLabel}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: "var(--color-text-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatRelativeTime(operation.createdAt)}
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
              color: "var(--color-text-primary)",
              fontSize: "var(--dg-fs-card-title)",
              fontWeight: 800,
            }}
          >
            {operation.label}
          </div>
          <div
            style={{
              color: "var(--color-text-muted)",
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
          <div
            style={{
              color: "var(--color-text-muted)",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            Event details
          </div>
          {details.length > 0 ? (
            <DetailRows rows={details.map((item) => [item.label, item.value])} />
          ) : (
            <div
              style={{
                color: "var(--color-text-muted)",
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
          color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 800,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          color: "var(--color-text-primary)",
          fontSize: "var(--dg-fs-label)",
          fontWeight: 650,
          margin: 0,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </dd>
    </>
  );
}

function billingOperationToAuditEntry(
  operation: BillingOperationSummary,
): FullAuditLogEntry {
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
  tone?: "danger" | "warning";
};

function billingNoticeCopy(
  billingAccess: OrganizationBillingSummary["billingAccess"],
) {
  switch (billingAccess.state) {
    case "trial_ending_soon":
      return billingAccess.daysUntilTrialEnd === 1
        ? "Trial access ends tomorrow. Add billing to keep the organization active."
        : `Trial access ends in ${billingAccess.daysUntilTrialEnd ?? "a few"} days. Add billing to keep the organization active.`;
    case "trial_grace":
      return "Trial access has ended. Add billing before the grace period ends to keep the organization active.";
    case "payment_attention_required":
      return "Billing needs attention. Update payment details to keep the organization active.";
    case "locked":
      return "Organization access is locked until billing is restored.";
    default:
      return null;
  }
}

function formatTrialTimeLeft(billing: OrganizationBillingSummary): {
  value: string;
  detail: string;
  tone?: "danger" | "warning";
} | null {
  const days = billing.billingAccess.daysUntilTrialEnd;

  if (days == null) {
    if (billing.status === "trialing" || !billing.status) {
      return null;
    }

    return null;
  }

  if (days > 1) {
    return {
      value: `${days} days`,
      detail: `Ends ${formatDate(billing.trialEndsAt)}`,
      tone: billing.billingAccess.shouldNotifyAdmins ? "warning" : undefined,
    };
  }

  if (days === 1) {
    return {
      value: "1 day",
      detail: `Ends ${formatDate(billing.trialEndsAt)}`,
      tone: "warning",
    };
  }

  if (days === 0) {
    return {
      value: "Today",
      detail: `Ends ${formatDate(billing.trialEndsAt)}`,
      tone: "warning",
    };
  }

  if (billing.billingAccess.state === "trial_grace") {
    return {
      value: "Grace",
      detail: `Grace ends ${formatDate(billing.billingAccess.trialGraceEndsAt)}`,
      tone: "warning",
    };
  }

  return {
    value: "Expired",
    detail: `${Math.abs(days)} days ago`,
    tone: "danger",
  };
}

export default function BillingSettings({
  organization,
}: {
  organization: { id: string };
}) {
  const queryClient = useQueryClient();
  const { signOutLocal } = useLogout();
  const isInSandbox = useIsInSandbox();
  const sandboxSourceOrgId = useSandboxSourceOrgId();
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
  const billingOrgId =
    isInSandbox && sandboxSourceOrgId ? sandboxSourceOrgId : organization.id;
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
      toast.error(formatClientErrorMessage(error, "Failed to start checkout"));
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
        formatClientErrorMessage(error, "Failed to open billing portal"),
      );
    } finally {
      setOpeningPortal(false);
    }
  }

  const seatTone =
    billing?.seatDelta != null && billing.seatDelta < 0 ? "danger" : undefined;
  const isTrialPending =
    Boolean(billing) && billing!.billingAccess.state === "trial_pending";
  const primaryAction =
    billing?.hasStripeCustomer && billing.hasStripeSubscription
      ? "Manage billing"
      : "Start subscription";
  const showSignOut = billing?.billingAccess.isLocked === true;
  const trialTimeLeft = billing ? formatTrialTimeLeft(billing) : null;
  const billingMetrics: BillingMetricConfig[] = [];
  if (billing) {
    billingMetrics.push({
      key: "app-users",
      icon: Users,
      label: "App users",
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
        label: "Seat delta",
        value: billing.seatDelta,
        tone: seatTone,
      });
    }
    if (trialTimeLeft) {
      billingMetrics.push({
        key: "trial-time-left",
        icon: Clock,
        label: "Trial time left",
        value: trialTimeLeft.value,
        tone: trialTimeLeft.tone,
      });
    }
    if (billing.trialEndsAt) {
      billingMetrics.push({
        key: "trial-ends",
        icon: CalendarDays,
        label: "Trial ends",
        value: formatDate(billing.trialEndsAt),
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
          {billing && <StatusBadge status={billing.status} />}
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
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "var(--dg-radius-md)",
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 700,
              }}
            >
              {formatClientErrorMessage(
                billingQuery.error,
                "Failed to load billing",
              )}
            </div>
          )}

          {billingQuery.isLoading || !billing ? (
            <div
              style={{
                padding: "8px 0",
                color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
              }}
            >
              Loading billing...
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

              {billing.cancelAt && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-md)",
                    border: "1px solid var(--color-warning-border)",
                    background: "var(--color-warning-bg)",
                    color: "var(--color-warning)",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                  }}
                >
                  Cancellation is scheduled for {formatDate(billing.cancelAt)}.
                </div>
              )}

              {billing.canceledAt && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-md)",
                    border: "1px solid var(--color-danger-border)",
                    background: "var(--color-danger-bg)",
                    color: "var(--color-danger)",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                  }}
                >
                  Subscription was canceled on {formatDate(billing.canceledAt)}.
                </div>
              )}

              {!billing.stripeConfigured && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-md)",
                    border: "1px solid var(--color-warning-border)",
                    background: "var(--color-warning-bg)",
                    color: "var(--color-warning)",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                  }}
                >
                  Stripe billing is not configured for this environment.
                </div>
              )}

              {billing.billingAccess.shouldNotifyAdmins && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-md)",
                    border: "1px solid var(--color-warning-border)",
                    background: "var(--color-warning-bg)",
                    color: "var(--color-warning)",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                  }}
                >
                  {billingNoticeCopy(billing.billingAccess)}
                </div>
              )}

              {isTrialPending && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-md)",
                    border: "1px solid var(--color-info-border)",
                    background: "var(--color-info-bg)",
                    color: "var(--color-info-text)",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                  }}
                >
                  Your trial starts the first time an administrator signs in. The
                  countdown begins then. Refresh this page to see your trial end
                  date.
                </div>
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
                  <button
                    type="button"
                    className="dg-btn dg-btn-secondary"
                    onClick={() => void billingQuery.refetch()}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    Refresh
                  </button>
                  {showSignOut && (
                    <button
                      type="button"
                      className="dg-btn dg-btn-secondary"
                      onClick={() => void signOutLocal()}
                    >
                      <LogOut size={15} aria-hidden="true" />
                      Sign out
                    </button>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    minWidth: 220,
                  }}
                >
                  <button
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
                      isInSandbox
                    }
                    title={
                      isInSandbox
                        ? "Billing actions are disabled in sandbox mode."
                        : undefined
                    }
                  >
                    <ExternalLink size={15} aria-hidden="true" />
                    {openingCheckout || openingPortal
                      ? "Opening..."
                      : primaryAction}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {billing && (
        <BillingOperations operations={billing.recentOperations ?? []} />
      )}
    </div>
  );
}
