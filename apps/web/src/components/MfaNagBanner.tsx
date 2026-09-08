"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks";
import { Button } from "@/components/Button";
import { fetchOrganizationBilling } from "@/features/billing/client";
import { queryKeys } from "@/lib/query-keys";

const DISMISS_KEY = "dg_mfa_nag_dismissed";

export default function MfaNagBanner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mfaNagRequired, isSuperAdmin, isGridmaster, isImpersonating, orgId } = usePermissions();
  const [dismissed, setDismissed] = useState(true);
  const isBillingSection =
    pathname === "/settings" && searchParams.get("section") === "org-billing";
  const shouldCheckBillingLock =
    isBillingSection && isSuperAdmin && !isGridmaster && !isImpersonating && Boolean(orgId);
  const billingQuery = useQuery({
    queryKey: queryKeys.org.billing(orgId!),
    queryFn: () => fetchOrganizationBilling(orgId!),
    enabled: shouldCheckBillingLock,
    staleTime: 30_000,
  });
  const isBillingRecoveryMode =
    shouldCheckBillingLock &&
    (billingQuery.isLoading || billingQuery.data?.billingAccess.isLocked === true);

  // Read from sessionStorage after mount only — dismissal is meant to last
  // for this browser session, not forever, so a fresh login re-shows it.
  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!mfaNagRequired || dismissed || isBillingRecoveryMode) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      role="status"
      className="flex min-h-9 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center leading-5"
      style={{
        background:
          "linear-gradient(135deg, var(--dg-color-warning), var(--dg-color-warning-dark))",
        color: "var(--dg-color-text-inverse)",
        fontSize: "var(--dg-fs-label, 13px)",
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Your account doesn&apos;t have two-factor authentication enabled.
      <Link
        href="/profile?section=security"
        style={{
          color: "var(--dg-color-text-inverse)",
          textDecoration: "underline",
          fontWeight: 700,
        }}
      >
        Set it up
      </Link>
      <Button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "rgba(255,255,255,0.2)",
          color: "var(--dg-color-text-inverse)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: "var(--dg-radius-sm)",
          padding: "2px 10px",
          fontSize: "var(--dg-fs-caption, 12px)",
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}
