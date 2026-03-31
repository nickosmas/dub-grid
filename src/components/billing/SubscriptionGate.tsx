"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks";
import { AlertTriangle } from "lucide-react";

/**
 * Shows a warning banner when the organization's subscription is expired or unpaid.
 * Does not block access — just warns super_admins to take action.
 */
export function SubscriptionGate() {
  const { orgId, role } = usePermissions();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    async function check() {
      const { data } = await supabase
        .from("organizations")
        .select("subscription_status")
        .eq("id", orgId)
        .single();
      if (!cancelled && data) {
        setStatus(data.subscription_status);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [orgId]);

  // Only show warnings for problematic states
  if (!status || !["past_due", "unpaid", "canceled"].includes(status)) {
    return null;
  }

  const isSuperAdmin = role === "super_admin" || role === "gridmaster";
  const messages: Record<string, string> = {
    past_due: "Your payment is past due. Please update your payment method.",
    unpaid: "Your subscription is unpaid. Some features may be restricted.",
    canceled: "Your subscription has been canceled.",
  };

  return (
    <div
      role="alert"
      style={{
        background: status === "canceled" ? "var(--color-bg-secondary)" : "var(--color-warning-bg)",
        border: `1px solid ${status === "canceled" ? "var(--color-border)" : "var(--color-warning)"}`,
        borderRadius: 10,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: "var(--dg-fs-body-sm)",
        color: "var(--color-text-primary)",
        margin: "0 0 16px",
      }}
    >
      <AlertTriangle size={16} style={{ color: "var(--color-warning)", flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        {messages[status]}
        {isSuperAdmin && " Go to Settings → Billing to manage your subscription."}
      </span>
    </div>
  );
}
