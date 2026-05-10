"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { useEmployees, useOrganizationData, usePermissions } from "@/hooks";
import { fetchOrganizationBilling } from "@/features/billing/client";
import { useBillingRealtimeInvalidation } from "@/features/billing/useBillingRealtimeInvalidation";
import { fetchOnboardingStatus } from "@/features/onboarding/client";
import { queryKeys } from "@/lib/query-keys";

/** Routes where the onboarding gate should never intercept. */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/accept-invite",
  "/auth",
  "/api",
  "/terms",
  "/privacy",
  "/cookie-policy",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/request-demo",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

function isSetupCompletionRoute(pathname: string): boolean {
  return (
    pathname === "/setup" ||
    pathname === "/people" ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

function isBillingRecoveryRoute(
  pathname: string,
  section: string | null,
): boolean {
  return pathname === "/settings" && section === "org-billing";
}

export default function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const perms = usePermissions();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Pass through for: loading, unauthenticated, public routes,
  // gridmaster, no org, impersonating
  if (authLoading || perms.isLoading) return <>{children}</>;
  if (!user) return <>{children}</>;
  if (isPublicRoute(pathname)) return <>{children}</>;
  if (perms.isGridmaster) return <>{children}</>;
  if (!perms.orgId) return <>{children}</>;
  if (perms.isImpersonating) return <>{children}</>;

  // User is authenticated with an org — check onboarding status
  return (
    <OnboardingCheck
      userId={user.id}
      orgId={perms.orgId}
      role={perms.role}
      isSuperAdmin={perms.isSuperAdmin}
      canManageOrg={perms.canManageOrg}
      pathname={pathname}
      section={searchParams.get("section")}
    >
      {children}
    </OnboardingCheck>
  );
}

/**
 * Inner component that only mounts for authenticated users with an org.
 * Safe to call useOrganizationData / useEmployees here since we know
 * there's a valid auth + org context.
 */
import OnboardingWizard from "./OnboardingWizard";
import SetupPendingScreen from "./SetupPendingScreen";

function SetupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/setup");
  }, [router]);

  return null;
}

function BillingRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings?section=org-billing");
  }, [router]);

  return null;
}

function OnboardingCheck({
  userId,
  orgId,
  role,
  isSuperAdmin,
  canManageOrg,
  pathname,
  section,
  children,
}: {
  userId: string;
  orgId: string;
  role: string;
  isSuperAdmin: boolean;
  canManageOrg: boolean;
  pathname: string;
  section: string | null;
  children: React.ReactNode;
}) {
  useBillingRealtimeInvalidation(orgId);
  const canRecoverBilling = isSuperAdmin;
  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: queryKeys.org.billing(orgId),
    queryFn: () => fetchOrganizationBilling(orgId),
    enabled: canRecoverBilling,
    staleTime: 30_000,
  });
  const shouldCheckWorkspace = !canRecoverBilling || Boolean(billing);
  const { data: onboardingStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["onboarding-status", userId, orgId],
    queryFn: () => fetchOnboardingStatus(orgId),
    enabled: shouldCheckWorkspace && billing?.billingAccess.isLocked !== true,
    staleTime: 30_000,
  });

  const { setupStatus, loading: orgLoading } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
    enabled: shouldCheckWorkspace && billing?.billingAccess.isLocked !== true,
  });
  const { employees, loading: empLoading } = useEmployees(
    shouldCheckWorkspace && billing?.billingAccess.isLocked !== true ? orgId : null,
  );

  if (billingLoading) return null;

  if (billing?.billingAccess.isLocked) {
    if (isBillingRecoveryRoute(pathname, section)) {
      return <>{children}</>;
    }
    return <BillingRedirect />;
  }

  if (statusLoading || orgLoading || empLoading) return null;

  const isOrgSetupComplete = setupStatus.isComplete && employees.length > 0;
  const canCompleteSetup = isSuperAdmin || canManageOrg || role === "admin";

  if (!isOrgSetupComplete) {
    if (!canCompleteSetup) {
      return <SetupPendingScreen />;
    }
    if (!isSetupCompletionRoute(pathname)) {
      return <SetupRedirect />;
    }
    return <>{children}</>;
  }

  if (onboardingStatus?.completed) return <>{children}</>;

  // Show onboarding wizard
  return (
    <OnboardingWizard
      role={role}
      orgId={orgId}
      userId={userId}
      isOrgSetup={isOrgSetupComplete}
    />
  );
}
