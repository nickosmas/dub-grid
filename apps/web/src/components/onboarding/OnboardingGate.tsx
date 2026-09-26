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
import { useSignInSettleDeadline } from "@/components/RouteGuards";
import { useAuthTransitionPending, consumeAuthTransition } from "@/lib/auth-transition";
import { queryKeys } from "@/lib/query-keys";
import { resolveOnboardingDecision } from "./onboarding-decision";
import { isPublicRoute } from "./public-routes";

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

  // Public routes never consult onboarding, and `isPublicRoute` is stable for
  // a given pathname, so this branch cannot swap structure mid-render.
  if (isPublicRoute(pathname)) return <>{children}</>;

  const sessionSettled = !authLoading && Boolean(user) && !perms.isLoading;

  // The gate only *decides* for an authenticated member of an org; everyone
  // else (still loading, signed out, gridmaster, no org, impersonating) passes
  // straight through. They pass through the same tree position, though: this
  // used to return a bare `{children}` while permissions loaded and then swap
  // to the wrapper below, which made React unmount and remount the entire page
  // subtree the moment perms resolved. That remount dropped the last observer
  // of the org-bootstrap query, cancelling its in-flight request (the queryFn
  // consumes the abort signal) and refetching it — one wasted round trip and a
  // full re-render on every hard load (build plan item 26). The sign-in splash
  // is rendered from the same position for the same reason (see below).
  const gated =
    sessionSettled && !perms.isGridmaster && Boolean(perms.orgId) && !perms.isImpersonating;

  return (
    <Suspense fallback={<>{children}</>}>
      <OnboardingCheckWithSection
        gated={gated}
        sessionSettled={sessionSettled}
        signedOut={!authLoading && !user}
        userId={user?.id ?? ""}
        orgId={perms.orgId ?? ""}
        role={perms.role}
        canManageOrg={perms.canManageOrg}
        isInactive={perms.isInactive}
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

function BillingRedirect({ destination }: { destination: "recovery" | "organization-gate" }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(
      destination === "recovery" ? "/settings?section=org-billing" : "/billing-required",
    );
  }, [destination, router]);

  return null;
}

function OnboardingCheck({
  gated,
  sessionSettled,
  signedOut,
  userId,
  orgId,
  role,
  canManageOrg,
  isInactive,
  pathname,
  section,
  children,
}: {
  /** False while the caller is not an authenticated org member (still loading,
   *  signed out, gridmaster, no org, impersonating). The component still mounts
   *  so the page subtree below it keeps a stable tree position, but it asks for
   *  nothing and decides nothing. */
  gated: boolean;
  /** Auth and permissions have both resolved for a signed-in person. */
  sessionSettled: boolean;
  /** Auth has resolved and nobody is signed in. */
  signedOut: boolean;
  userId: string;
  orgId: string;
  role: string;
  canManageOrg: boolean;
  isInactive: boolean;
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
    enabled: gated,
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

  const resolvedDecision = resolveOnboardingDecision({
    // A failed bootstrap has no organization for the wizard steps to render,
    // and an in-flight query would otherwise cover the page while the client
    // has no path to recover.
    bootstrapUnavailable: Boolean(loadError) && !org,
    completedThisSession: onboardingComplete,
    appAlreadyShown: appShownForOrgRef.current === orgId,
    orgLoading,
    entryGate,
    onBillingRecoveryRoute: isBillingRecoveryRoute(pathname, section),
    canRecoverBilling: role === "super_admin",
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
    isInactive,
    frozenPhase: getOnboardingPhase(userId, orgId),
  });

  // Not an authenticated org member: render the app untouched. The component
  // still mounts (that is the point — the subtree below keeps its position),
  // it just decides nothing and asks for nothing.
  const decision = gated ? resolvedDecision : ({ kind: "app", settled: true } as const);

  // A sign-in's session can still be settling when its first page commits:
  // the browser syncs its auth client alongside the page load. Hold the splash
  // rather than let the page render its own, and send a session that never
  // arrives back to /login as ProtectedRoute would.
  const awaitingSession = authTransitionPending && !sessionSettled;
  useSignInSettleDeadline(awaitingSession && signedOut);
  const holdingSplash =
    awaitingSession || (authTransitionPending && decision.kind === "app" && !decision.settled);

  // Only a render that actually shows the app counts as having shown it.
  const settledAppRender = decision.kind === "app" && decision.settled && !holdingSplash;
  useEffect(() => {
    if (settledAppRender) appShownForOrgRef.current = orgId;
  }, [orgId, settledAppRender]);

  // Consume the post-login auth-transition flag once we've reached a settled
  // state (onboarding already complete, or a final wizard/app decision). Done in
  // an effect, NOT during render, so a discarded concurrent/strict-mode render
  // can't clear the splash flag before the navigation that needs it. (M-5)
  // Nothing is final before the session settles: the sign-in queries are
  // primed, so organization data can be cached while the browser is still
  // syncing its auth client, and ending the handoff then sent the page's guard
  // to /login. Anyone the gate does not decide for (a Gridmaster, an
  // impersonation, a person with no organization) has arrived once it does.
  const reachedFinalDecision =
    sessionSettled && (onboardingComplete || !gated || (!orgLoading && entryGate !== null));
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

  // One splash for the whole handoff, rendered from this one position so it
  // is never remounted between phases (its logo restarted on every hop) and
  // its label only moves forward.
  if (holdingSplash) {
    return <AuthTransitionScreen phase={sessionSettled ? "workspace" : "signing-in"} />;
  }

  switch (decision.kind) {
    case "bootstrap-recovery":
      return (
        <OrganizationBootstrapRecovery
          automaticallyRetry={bootstrapRetryable}
          onRetry={retryOrganizationBootstrap}
        />
      );
    case "billing-redirect":
      return <BillingRedirect destination={decision.destination} />;
    case "app":
      // Ordinary signed-in refreshes keep the app visible so their page-level
      // loading states can render instead of a full-screen gate.
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
