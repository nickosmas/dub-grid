"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { useOrganizationData, usePermissions } from "@/hooks";
import { fetchOrganizationBilling } from "@/features/billing/client";
import { useBillingRealtimeInvalidation } from "@/features/billing/useBillingRealtimeInvalidation";
import {
  fetchOnboardingStatus,
  isOnboardingComplete,
  getOnboardingPhase,
  freezeOnboardingPhase,
} from "@/features/onboarding/client";
import AuthSplash from "@/components/AuthSplash";
import { useAuthTransitionPending, consumeAuthTransition } from "@/lib/auth-transition";
import { queryKeys } from "@/lib/query-keys";

/** Routes where the onboarding gate should never intercept. */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/goodbye",
  "/accept-invite",
  "/accept-terms",
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
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

function isBillingRecoveryRoute(pathname: string, section: string | null): boolean {
  return pathname === "/settings" && section === "org-billing";
}

export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const perms = usePermissions();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authTransitionPending = useAuthTransitionPending();

  // Pass through for: loading, unauthenticated, public routes,
  // gridmaster, no org, impersonating
  if (authLoading || perms.isLoading) {
    // During the post-login transition, hold the branded splash instead of
    // flashing the app/blank while perms resolve and the onboarding decision is
    // made (this route bypasses ProtectedRoute's splash). Normal in-app nav has
    // perms cached, so this branch isn't hit and nothing changes there.
    if (authTransitionPending && !isPublicRoute(pathname)) return <AuthSplash />;
    return <>{children}</>;
  }
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
  const shouldCheckOrganization = !canRecoverBilling || Boolean(billing);
  const { data: onboardingStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["onboarding-status", userId, orgId],
    queryFn: () => fetchOnboardingStatus(orgId),
    enabled: shouldCheckOrganization && billing?.billingAccess.isLocked !== true,
    staleTime: 30_000,
  });

  const {
    org,
    setupStatus,
    loading: orgLoading,
  } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
    enabled: shouldCheckOrganization && billing?.billingAccess.isLocked !== true,
  });

  // Consume the post-login auth-transition flag once we've reached a settled
  // state (onboarding already complete, or a final wizard/app decision). Done in
  // an effect, NOT during render, so a discarded concurrent/strict-mode render
  // can't clear the splash flag before the navigation that needs it. (M-5)
  const onboardingComplete = isOnboardingComplete(userId, orgId);
  const reachedFinalDecision =
    onboardingComplete ||
    (!billingLoading && billing?.billingAccess.isLocked !== true && !statusLoading && !orgLoading);
  useEffect(() => {
    if (reachedFinalDecision) consumeAuthTransition();
  }, [reachedFinalDecision]);

  // Onboarding was completed in this session — never re-mount a wizard, even if
  // a refetch momentarily reads onboarding-status as not-completed. Closes the
  // config→orientation double-show race. (Server onboarding_completed_at remains
  // the cross-session source of truth for the queries above.)
  if (onboardingComplete) {
    return <>{children}</>;
  }

  // Render the branded splash (not a blank frame) while these gate queries
  // resolve — this route bypasses ProtectedRoute's splash, so without it the
  // post-login screen flashes blank before the wizard mounts.
  if (billingLoading) return <AuthSplash />;

  if (billing?.billingAccess.isLocked) {
    if (isBillingRecoveryRoute(pathname, section)) {
      return <>{children}</>;
    }
    return <BillingRedirect />;
  }

  if (statusLoading || orgLoading) return <AuthSplash />;

  // (auth-transition flag is consumed by the effect above once settled — M-5)

  // Adding employees is a post-wizard task on the People page, so it doesn't
  // gate org setup completion. setupStatus.isComplete is the configuration
  // contract (focus areas + schedule definitions + certifications + roles).
  const liveSetupComplete = setupStatus.isComplete;
  // Only roles that can actually advance org config get the setup wizard.
  // canManageOrg covers gridmaster (filtered earlier) + super_admin + any
  // manage-* perm. Admins without a manage-* perm have nothing to do in the
  // config wizard, so they wait (SetupPendingScreen) until a super_admin
  // finishes, then get the orientation.
  const canCompleteSetup = canManageOrg;

  // Pick the wizard variant once and freeze it for the session. A super_admin
  // completes org setup *inside* the config wizard, flipping liveSetupComplete
  // to true mid-flow; without the freeze that swaps the config wizard out for
  // the orientation wizard (the "two wizards in a row" bug).
  //
  // Only freeze when the bootstrap is reliably for THIS org (org.id === orgId).
  // On a login that switches orgs, useOrganizationData briefly resolves a
  // different org, so freezing then could latch the wrong phase. When it's not
  // yet reliable we fall back to live status (no freeze) — which self-corrects
  // on the next render and never sticks wrong, instead of stalling on a splash.
  // Non-managers also stay on live status so pending-screen → orientation works.
  const orgDataReliable = Boolean(org) && org?.id === orgId;
  let phase = getOnboardingPhase(userId, orgId);
  if (!phase) {
    phase = liveSetupComplete ? "orientation" : "config";
    if (canCompleteSetup && orgDataReliable) {
      freezeOnboardingPhase(userId, orgId, phase);
    }
  }

  if (phase === "config") {
    if (!canCompleteSetup) {
      return <SetupPendingScreen />;
    }
    // /setup as a standalone route was removed in the onboarding refactor
    // (commit d7e7b96). Render the wizard inline so users with incomplete
    // org setup see it on whatever route they landed on after login.
    return <OnboardingWizard role={role} orgId={orgId} userId={userId} isOrgSetup={false} />;
  }

  // orientation
  if (onboardingStatus?.completed) return <>{children}</>;

  return <OnboardingWizard role={role} orgId={orgId} userId={userId} isOrgSetup={true} />;
}
