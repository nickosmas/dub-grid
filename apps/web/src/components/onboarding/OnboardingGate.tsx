"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { useOrganizationData, usePermissions } from "@/hooks";
import {
  isOnboardingComplete,
  getOnboardingPhase,
  freezeOnboardingPhase,
} from "@/features/onboarding/client";
import AuthTransitionScreen from "@/components/AuthTransitionScreen";
import { useAuthTransitionPending, consumeAuthTransition } from "@/lib/auth-transition";
import { queryKeys } from "@/lib/query-keys";
import { resolveOnboardingDecision } from "./onboarding-decision";

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
  // The organization gate in the proxy is terminal: a member held there has no
  // organization to be onboarded into yet. Without this the wizard painted
  // straight over the screen explaining the wait, and finishing it dropped the
  // user back on that same screen. Bootstrap is the other reason: it answers a
  // locked organization with a 403, which reads here as a failed bootstrap and
  // covers the gate with the recovery screen instead.
  "/billing-required",
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

/**
 * Reads the one search param the onboarding decision needs.
 *
 * Split out, and given its own Suspense boundary below, because
 * useSearchParams() opts its nearest boundary out of static prerendering: Next
 * emits that boundary's *fallback* into the HTML. This gate wraps every page,
 * so calling the hook here put `null` in the static HTML of every prerendered
 * route — the marketing page shipped with no content in it at all and could not
 * paint until the whole bundle had downloaded and hydrated.
 *
 * Nothing above this component reads search params, so public routes now
 * prerender their real markup, and only the authenticated path — the one that
 * actually reaches OnboardingCheck — pays the boundary.
 */
function OnboardingCheckWithSection(
  props: Omit<React.ComponentProps<typeof OnboardingCheck>, "section">,
) {
  const searchParams = useSearchParams();
  return <OnboardingCheck {...props} section={searchParams.get("section")} />;
}

export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const perms = usePermissions();
  const pathname = usePathname();
  const authTransitionPending = useAuthTransitionPending();

  // Pass through for: loading, unauthenticated, public routes,
  // gridmaster, no org, impersonating
  if (authLoading || perms.isLoading) {
    // During the post-login transition, hold the branded splash instead of
    // flashing the app/blank while perms resolve and the onboarding decision is
    // made (this route bypasses ProtectedRoute's splash). Normal in-app nav has
    // perms cached, so this branch isn't hit and nothing changes there.
    if (authTransitionPending && !isPublicRoute(pathname)) {
      return <AuthTransitionScreen phase="signing-in" />;
    }
    return <>{children}</>;
  }
  if (!user) return <>{children}</>;
  if (isPublicRoute(pathname)) return <>{children}</>;
  if (perms.isGridmaster) return <>{children}</>;
  if (!perms.orgId) return <>{children}</>;
  if (perms.isImpersonating) return <>{children}</>;

  // User is authenticated with an org — check onboarding status. Resolving a
  // search parameter must never cover an already signed-in refresh with an
  // auth-transition screen; the app shell and each page own their normal
  // loading states.
  return (
    <Suspense fallback={<>{children}</>}>
      <OnboardingCheckWithSection
        userId={user.id}
        orgId={perms.orgId}
        role={perms.role}
        canManageOrg={perms.canManageOrg}
        pathname={pathname}
      >
        {children}
      </OnboardingCheckWithSection>
    </Suspense>
  );
}

/**
 * Inner component that only mounts for authenticated users with an org.
 * Safe to call useOrganizationData / useEmployees here since we know
 * there's a valid auth + org context.
 */
import OnboardingWizard from "./OnboardingWizard";
import SetupPendingScreen from "./SetupPendingScreen";
import OrganizationBootstrapRecovery from "./OrganizationBootstrapRecovery";

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
  canManageOrg,
  pathname,
  section,
  children,
}: {
  userId: string;
  orgId: string;
  role: string;
  canManageOrg: boolean;
  pathname: string;
  section: string | null;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const authTransitionPending = useAuthTransitionPending();
  const {
    org,
    setupStatus,
    loading: orgLoading,
    loadError,
    bootstrapRetryable,
    entryGate,
  } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
  });
  const retryOrganizationBootstrap = useCallback(async () => {
    await queryClient.resetQueries({ queryKey: queryKeys.org.bootstrap() });
  }, [queryClient]);

  // Onboarding was completed in this session — never re-mount a wizard, even if
  // a refetch momentarily reads onboarding-status as not-completed. Closes the
  // config→orientation double-show race. (Server onboarding_completed_at remains
  // the cross-session source of truth for the queries above.)
  const onboardingComplete = isOnboardingComplete(userId, orgId);

  // Latched for the current organization in an effect so a discarded
  // concurrent/strict-mode render can never set it. App Router keeps the gate
  // mounted across in-app navigation and organization switches, so the org id
  // is part of the latch: a previous org cannot suppress the next org's gate.
  const appShownForOrgRef = useRef<string | null>(null);

  const decision = resolveOnboardingDecision({
    // A failed bootstrap has no organization for the wizard steps to render,
    // and an in-flight query would otherwise cover the page while the client
    // has no path to recover.
    bootstrapUnavailable: Boolean(loadError) && !org,
    completedThisSession: onboardingComplete,
    appAlreadyShown: appShownForOrgRef.current === orgId,
    orgLoading,
    entryGate,
    onBillingRecoveryRoute: isBillingRecoveryRoute(pathname, section),
    // Adding employees is a post-wizard task on the People page, so it doesn't
    // gate org setup completion. setupStatus.isComplete is the configuration
    // contract (focus areas + schedule definitions + certifications + roles).
    setupComplete: setupStatus.isComplete,
    // Only roles that can actually advance org config get the setup wizard.
    // canManageOrg covers gridmaster (filtered earlier) + super_admin + any
    // manage-* perm. Admins without a manage-* perm have nothing to do in the
    // config wizard, so they wait (SetupPendingScreen) until a super_admin
    // finishes, then get the orientation.
    canCompleteSetup: canManageOrg,
    // Only treat the bootstrap as reliable once it is for THIS org. On an org
    // switch, useOrganizationData can briefly resolve the previous org, which
    // must not decide the next org's onboarding, billing, or setup access.
    orgDataReliable: Boolean(org) && org?.id === orgId,
    frozenPhase: getOnboardingPhase(userId, orgId),
  });

  const settledAppRender = decision.kind === "app" && decision.settled;
  useEffect(() => {
    if (settledAppRender) appShownForOrgRef.current = orgId;
  }, [orgId, settledAppRender]);

  // Consume the post-login auth-transition flag once we've reached a settled
  // state (onboarding already complete, or a final wizard/app decision). Done in
  // an effect, NOT during render, so a discarded concurrent/strict-mode render
  // can't clear the splash flag before the navigation that needs it. (M-5)
  const reachedFinalDecision = onboardingComplete || (!orgLoading && entryGate !== null);
  useEffect(() => {
    if (reachedFinalDecision) consumeAuthTransition();
  }, [reachedFinalDecision]);

  // Pick the wizard variant once and freeze it for the session. A super_admin
  // completes org setup *inside* the config wizard, flipping setup completeness
  // to true mid-flow; without the freeze that swaps the config wizard out for
  // the orientation wizard (the "two wizards in a row" bug).
  const freezePhase = decision.kind === "wizard" ? decision.freezePhase : null;
  useEffect(() => {
    if (freezePhase) freezeOnboardingPhase(userId, orgId, freezePhase);
  }, [freezePhase, userId, orgId]);

  switch (decision.kind) {
    case "bootstrap-recovery":
      return (
        <OrganizationBootstrapRecovery
          automaticallyRetry={bootstrapRetryable}
          onRetry={retryOrganizationBootstrap}
        />
      );
    case "billing-redirect":
      return <BillingRedirect />;
    case "app":
      // A post-login handoff needs a branded transition while the onboarding
      // decision resolves. Ordinary signed-in refreshes keep the app visible so
      // their page-level loading states can render instead of a full-screen gate.
      if (!decision.settled && authTransitionPending) {
        return <AuthTransitionScreen phase="workspace" />;
      }
      return <>{children}</>;
    case "setup-pending":
      return <SetupPendingScreen />;
    case "wizard":
      // /setup as a standalone route was removed in the onboarding refactor
      // (commit d7e7b96). Render the wizard inline so users with incomplete
      // org setup see it on whatever route they landed on after login.
      return (
        <OnboardingWizard
          role={role}
          orgId={orgId}
          userId={userId}
          isOrgSetup={decision.isOrgSetup}
        />
      );
  }
}
