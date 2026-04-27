"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { useEmployees, useOrganizationData, usePermissions } from "@/hooks";
import { fetchOnboardingStatus } from "@/lib/db";

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

export default function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const perms = usePermissions();
  const pathname = usePathname();

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

function OnboardingCheck({
  userId,
  orgId,
  role,
  isSuperAdmin,
  canManageOrg,
  children,
}: {
  userId: string;
  orgId: string;
  role: string;
  isSuperAdmin: boolean;
  canManageOrg: boolean;
  children: React.ReactNode;
}) {
  const { data: onboardingStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["onboarding-status", userId, orgId],
    queryFn: () => fetchOnboardingStatus(userId, orgId),
    staleTime: 30_000,
  });

  const { setupStatus, loading: orgLoading } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
  });
  const { employees, loading: empLoading } = useEmployees(orgId);

  // Still loading — render children to avoid flash
  if (statusLoading || orgLoading || empLoading) return <>{children}</>;

  // Already completed onboarding
  if (onboardingStatus?.completed) return <>{children}</>;

  // Regular user on an org that isn't fully set up — show waiting screen
  const isOrgSetupComplete = setupStatus.isComplete && employees.length > 0;
  const isRegularUser = !isSuperAdmin && !canManageOrg;

  if (isRegularUser && !isOrgSetupComplete) {
    return <SetupPendingScreen />;
  }

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
