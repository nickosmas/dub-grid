"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import UserViewBanner from "@/components/UserViewBanner";
import InactiveAccountBanner from "@/components/InactiveAccountBanner";
import MfaNagBanner from "@/components/MfaNagBanner";
import TrialWelcomeModal from "@/components/TrialWelcomeModal";
import InactivityGuard from "@/components/InactivityGuard";
import { fetchOrganizationBilling } from "@/features/billing/client";
import {
  fetchOrganizationBootstrap,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";
import { useEmployees, useOrganizationData, usePermissions } from "@/hooks";
import { queryKeys } from "@/lib/query-keys";

const APP_ROUTES = [
  "/dashboard",
  "/schedule",
  "/people",
  "/reports",
  "/settings",
  "/alerts",
  "/profile",
];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

function AppHeader() {
  const perms = usePermissions();
  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: queryKeys.org.billing(perms.orgId!),
    queryFn: () => fetchOrganizationBilling(perms.orgId!),
    enabled:
      Boolean(perms.orgId) && perms.isSuperAdmin && !perms.isGridmaster && !perms.isImpersonating,
    staleTime: 30_000,
  });
  const shouldLoadOrgHeader =
    !perms.isSuperAdmin ||
    perms.isGridmaster ||
    perms.isImpersonating ||
    (!billingLoading && billing?.billingAccess.isLocked !== true);
  const {
    org,
    setupStatus,
    loading: orgLoading,
  } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
    enabled: shouldLoadOrgHeader,
  });
  const { employees, loading: empLoading } = useEmployees(
    shouldLoadOrgHeader ? (perms.orgId ?? org?.id ?? null) : null,
  );
  const isOrgSetupComplete = setupStatus.isComplete && employees.length > 0;
  const hideForSetupLock =
    !perms.isGridmaster &&
    !perms.isImpersonating &&
    (perms.isLoading || orgLoading || empLoading || !isOrgSetupComplete);
  const hideForBillingLock =
    !perms.isGridmaster &&
    !perms.isImpersonating &&
    (billingLoading || billing?.billingAccess.isLocked === true);

  if (hideForSetupLock || hideForBillingLock) return null;

  return (
    <div className="dg-app-shell-header-surface">
      <Header orgName={org?.name} />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isGridmaster, isLoading, orgId } = usePermissions();

  // Subscribe to the bootstrap query so we can detect sandbox-mode org
  // switches without forcing an extra fetch — the query is already
  // mounted by AppHeader. The effective org id flips when the user
  // enters or exits a sandbox; using it as a key on the page subtree
  // forces React to unmount + remount, which resets every form's
  // local state. Without this, stale sandbox values linger in form
  // inputs after exit (and vice versa on enter) until manual refresh.
  const bootstrapQuery = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(),
    queryFn: () => fetchOrganizationBootstrap(),
    staleTime: 60_000,
    enabled: !isGridmaster && Boolean(orgId),
  });
  // Keyed remount of the page subtree resets form state on sandbox org switches.
  // Only apply it on app routes: on public routes (e.g. /login) the org id
  // resolving from null -> real id during the post-login settle would otherwise
  // remount the login page mid-sign-in and blank its fields before navigation.
  const effectiveOrgKey = isAppRoute(pathname)
    ? (bootstrapQuery.data?.org?.id ?? orgId ?? "bootstrap-pending")
    : "public";

  // Show the org header on app routes, but not when gridmaster is at /dashboard
  // (the gridmaster portal renders its own header).
  // Skip while permissions are loading to prevent mounting AppHeader (and its
  // useOrganizationData hook) before we know the user's role — gridmaster users
  // have no org and the unnecessary fetches add significant latency.
  const showHeader =
    !isLoading && isAppRoute(pathname) && !(isGridmaster && pathname === "/dashboard");

  return (
    <>
      <div className="dg-app-shell-header no-print">
        {isAppRoute(pathname) && (
          <>
            <ImpersonationBanner />
            <UserViewBanner />
            <InactiveAccountBanner />
            <MfaNagBanner />
          </>
        )}
        {showHeader && <AppHeader />}
      </div>
      <div key={effectiveOrgKey} className="contents">
        {children}
      </div>
      {!isGridmaster && <TrialWelcomeModal />}
      <InactivityGuard />
    </>
  );
}
