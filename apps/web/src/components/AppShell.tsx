"use client";

import { useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import UserViewBanner from "@/components/UserViewBanner";
import TrialWelcomeModal from "@/components/TrialWelcomeModal";
import { fetchOrganizationBilling } from "@/features/billing/client";
import {
  fetchOrganizationBootstrap,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";
import { useEmployees, useOrganizationData, usePermissions } from "@/hooks";
import { queryKeys } from "@/lib/query-keys";

const APP_ROUTES = ["/dashboard", "/schedule", "/people", "/reports", "/settings", "/notifications", "/profile"];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

function AppHeader() {
  const perms = usePermissions();
  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: queryKeys.org.billing(perms.orgId!),
    queryFn: () => fetchOrganizationBilling(perms.orgId!),
    enabled:
      Boolean(perms.orgId) &&
      perms.isSuperAdmin &&
      !perms.isGridmaster &&
      !perms.isImpersonating,
    staleTime: 30_000,
  });
  const shouldLoadOrgHeader =
    !perms.isSuperAdmin ||
    perms.isGridmaster ||
    perms.isImpersonating ||
    (!billingLoading && billing?.billingAccess.isLocked !== true);
  const { org, setupStatus, loading: orgLoading } = useOrganizationData({
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
    <div
      style={{
        background: "var(--color-bg)",
        boxShadow: "var(--shadow-raised)",
      }}
    >
      <Header orgName={org?.name} />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isGridmaster, isLoading, orgId } = usePermissions();
  const headerRef = useRef<HTMLDivElement>(null);

  // Subscribe to the bootstrap query so we can detect sandbox-mode org
  // switches without forcing an extra fetch — the query is already
  // mounted by AppHeader. The effective org id flips when the user
  // enters or exits a sandbox; using it as a key on the page subtree
  // forces React to unmount + remount, which resets every form's
  // local state. Without this, stale sandbox values linger in form
  // inputs after exit (and vice versa on enter) until manual refresh.
  const bootstrapQuery = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(null, false),
    queryFn: () => fetchOrganizationBootstrap({ includeAssignments: false }),
    staleTime: 60_000,
    enabled: !isGridmaster && Boolean(orgId),
  });
  // Keyed remount of the page subtree resets form state on sandbox org switches.
  // Only apply it on app routes: on public routes (e.g. /login) the org id
  // resolving from null -> real id during the post-login settle would otherwise
  // remount the login page mid-sign-in and blank its fields before navigation.
  const effectiveOrgKey = isAppRoute(pathname)
    ? bootstrapQuery.data?.org?.id ?? orgId ?? "bootstrap-pending"
    : "public";

  // Publish the actual sticky-header height as a CSS custom property so that
  // sidebar layouts (StaffView, SettingsPage, etc.) can subtract the correct
  // value instead of a hardcoded 56px.
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      document.documentElement.style.setProperty("--app-shell-header-h", `${h}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Show the org header on app routes, but not when gridmaster is at /dashboard
  // (the gridmaster portal renders its own header).
  // Skip while permissions are loading to prevent mounting AppHeader (and its
  // useOrganizationData hook) before we know the user's role — gridmaster users
  // have no org and the unnecessary fetches add significant latency.
  const showHeader = !isLoading && isAppRoute(pathname) && !(isGridmaster && pathname === "/dashboard");

  return (
    <>
      <div
        ref={headerRef}
        className="no-print"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 9999,
        }}
      >
        <ImpersonationBanner />
        <UserViewBanner />
        {showHeader && <AppHeader />}
      </div>
      <div key={effectiveOrgKey} style={{ display: "contents" }}>
        {children}
      </div>
      {!isGridmaster && <TrialWelcomeModal />}
    </>
  );
}
