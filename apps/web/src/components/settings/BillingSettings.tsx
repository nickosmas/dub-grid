"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LogOut, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import { MaybeHint } from "@/components/ui/hint";
import ProgressBar from "@/components/ProgressBar";
import {
  completeBillingCheckout,
  fetchOrganizationBilling,
  openBillingPortal,
  startBillingCheckout,
} from "@/features/billing/client";
import { describeBillingOverview } from "@/features/billing/overview";
import { useClientFeatureFlags, useIsInSandbox, useLogout, useSandboxSourceOrgId } from "@/hooks";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { BillingBanner, FooterActions } from "./billing/billing-ui";
import { BillingHistoryCard } from "./billing/BillingHistoryCard";
import { BillingOverviewCard } from "./billing/BillingOverviewCard";
import { BillingSeatsCard } from "./billing/BillingSeatsCard";
import { BillingStatCards } from "./billing/BillingStatCards";
import { SeatHistoryChart } from "./billing/SeatHistoryChart";

function LoadingCards() {
  return (
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
  );
}

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

  const overview = billing ? describeBillingOverview(billing) : null;
  const opening = openingCheckout || openingPortal;
  const actionBlocked = isInSandbox
    ? "Billing actions are disabled in sandbox mode."
    : !featureFlags.stripe
      ? "Billing is unavailable right now. Try again in a moment."
      : null;
  const footerNote = !billing?.canManageBilling
    ? "Only a Super Admin can change billing. Ask a Super Admin in your organization if something needs to change."
    : overview?.action
      ? "Payment methods, invoices, and billing details are managed securely in the Stripe billing portal."
      : "Nothing about billing can be changed from here right now.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {billingQuery.error instanceof Error && (
        <BillingBanner tone="danger" icon="info">
          {formatClientErrorMessage(
            billingQuery.error,
            "We couldn't load your billing details. Refresh and try again.",
          )}
        </BillingBanner>
      )}

      <ProgressBar loading={billingQuery.isLoading || !billing} />

      {billingQuery.isLoading || !billing || !overview ? (
        <LoadingCards />
      ) : (
        <>
          {overview.banner && (
            <BillingBanner tone={overview.banner.tone} icon={overview.banner.icon}>
              {overview.banner.message}
            </BillingBanner>
          )}
          {!billing.stripeConfigured && (
            <BillingBanner tone="warning" icon="info">
              Online billing isn&apos;t set up here. Contact DubGrid Support to subscribe.
            </BillingBanner>
          )}

          <BillingOverviewCard
            overview={overview}
            footerNote={footerNote}
            actions={
              <FooterActions>
                <Button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => billingQuery.refetch()}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Refresh
                </Button>
                {billing.billingAccess.isLocked && (
                  <Button
                    type="button"
                    className="dg-btn dg-btn-secondary"
                    onClick={() => signOut()}
                  >
                    <LogOut size={15} aria-hidden="true" />
                    Sign out
                  </Button>
                )}
                {overview.action && billing.canManageBilling && (
                  <MaybeHint content={actionBlocked}>
                    <Button
                      type="button"
                      className="dg-btn dg-btn-primary"
                      onClick={overview.action.kind === "portal" ? handlePortal : handleCheckout}
                      disabled={!billing.stripeConfigured || opening || actionBlocked !== null}
                    >
                      <ButtonLoading
                        loading={opening}
                        spinnerSize={15}
                        icon={<ExternalLink size={15} aria-hidden="true" />}
                      >
                        {overview.action.label}
                      </ButtonLoading>
                    </Button>
                  </MaybeHint>
                )}
              </FooterActions>
            }
          />

          <BillingStatCards stats={overview.stats} />

          {billing.seatBreakdown && (
            <BillingSeatsCard
              breakdown={billing.seatBreakdown}
              paidSeats={billing.subscriptionSeats}
            />
          )}

          <SeatHistoryChart history={billing.seatHistory ?? []} />

          <BillingHistoryCard operations={billing.recentOperations ?? []} />
        </>
      )}
    </div>
  );
}
