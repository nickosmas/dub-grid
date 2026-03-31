"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { CreditCard, ExternalLink } from "lucide-react";

interface SubscriptionInfo {
  status: string;
  quantity: number;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  trialing: { label: "Trial", color: "var(--color-info)" },
  active: { label: "Active", color: "var(--color-success-text)" },
  past_due: { label: "Past Due", color: "var(--color-warning)" },
  canceled: { label: "Canceled", color: "var(--color-text-muted)" },
  unpaid: { label: "Unpaid", color: "var(--color-danger-dark)" },
};

interface BillingPageProps {
  orgId: string;
}

export function BillingPage({ orgId }: BillingPageProps) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [orgStatus, setOrgStatus] = useState<string>("trialing");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"checkout" | "portal" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Load subscription info
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status, quantity, current_period_end, trial_end, cancel_at")
        .eq("org_id", orgId)
        .maybeSingle();

      // Load org subscription status
      const { data: org } = await supabase
        .from("organizations")
        .select("subscription_status")
        .eq("id", orgId)
        .single();

      if (!cancelled) {
        setSubscription(sub);
        setOrgStatus(org?.subscription_status ?? "trialing");
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgId]);

  async function handleCheckout() {
    setActionLoading("checkout");
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, returnUrl: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleManageBilling() {
    setActionLoading("portal");
    try {
      const res = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, returnUrl: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error("Failed to open billing portal. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-body-sm)" }}>
        Loading billing information...
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[orgStatus] ?? STATUS_LABELS.trialing;
  const hasSubscription = subscription && subscription.status !== "trialing";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const trialEnd = subscription?.trial_end
    ? new Date(subscription.trial_end).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CreditCard size={18} style={{ color: statusInfo.color }} />
        <span style={{
          fontSize: "var(--dg-fs-body-sm)",
          fontWeight: 600,
          color: statusInfo.color,
        }}>
          {statusInfo.label}
        </span>
        {subscription?.quantity && (
          <span style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-muted)",
          }}>
            &middot; {subscription.quantity} {subscription.quantity === 1 ? "seat" : "seats"}
          </span>
        )}
      </div>

      {/* Subscription details */}
      {orgStatus === "trialing" && !hasSubscription && (
        <p style={{ margin: 0, fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>
          You&apos;re on a 14-day free trial.
          {trialEnd && ` Trial ends ${trialEnd}.`}
          {" "}Subscribe to continue using DubGrid after the trial.
        </p>
      )}

      {hasSubscription && periodEnd && (
        <p style={{ margin: 0, fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>
          Current period ends {periodEnd}.
          {subscription?.cancel_at && " Subscription will be canceled at period end."}
        </p>
      )}

      {orgStatus === "past_due" && (
        <p style={{ margin: 0, fontSize: "var(--dg-fs-body-sm)", color: "var(--color-warning)", fontWeight: 500 }}>
          Your payment is past due. Please update your payment method to avoid service interruption.
        </p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!hasSubscription && (
          <button
            onClick={handleCheckout}
            disabled={actionLoading !== null}
            className="dg-btn dg-btn-primary"
          >
            <ButtonLoading loading={actionLoading === "checkout"} spinnerColor="var(--color-text-inverse)" spinnerSize={14}>
              Subscribe Now
            </ButtonLoading>
          </button>
        )}
        {hasSubscription && (
          <button
            onClick={handleManageBilling}
            disabled={actionLoading !== null}
            className="dg-btn dg-btn-secondary"
          >
            <ButtonLoading loading={actionLoading === "portal"} spinnerSize={14}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Manage Billing <ExternalLink size={14} />
              </span>
            </ButtonLoading>
          </button>
        )}
      </div>
    </div>
  );
}
