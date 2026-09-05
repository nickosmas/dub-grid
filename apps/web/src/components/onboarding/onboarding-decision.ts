import type { OnboardingPhase } from "@/features/onboarding/client";

export interface OnboardingEntryGate {
  onboardingCompleted: boolean;
  /** A super admin has been through their own onboarding, so the organization
   *  is open to members who cannot configure it themselves. */
  adminOnboardingCompleted: boolean;
  billingLocked: boolean | null;
}

export interface OnboardingDecisionInput {
  /** Bootstrap failed and left nothing cached to render the app from. */
  bootstrapUnavailable: boolean;
  /** Onboarding was finished in this browser session (sessionStorage guard). */
  completedThisSession: boolean;
  /** This mount has already handed the user the real app off a settled answer. */
  appAlreadyShown: boolean;
  orgLoading: boolean;
  entryGate: OnboardingEntryGate | null;
  onBillingRecoveryRoute: boolean;
  /** Org-wide configuration completeness: live, and shared by every member. */
  setupComplete: boolean;
  canCompleteSetup: boolean;
  /** Bootstrap has resolved the org this session is actually acting as. */
  orgDataReliable: boolean;
  frozenPhase: OnboardingPhase | null;
}

export type OnboardingDecision =
  | { kind: "bootstrap-recovery" }
  | { kind: "billing-redirect" }
  | { kind: "app"; settled: boolean }
  | { kind: "setup-pending" }
  | { kind: "wizard"; isOrgSetup: boolean; freezePhase: OnboardingPhase | null };

/**
 * Decides what the onboarding gate shows. Pure so the ordering below is
 * testable on its own, since it is the whole reason a signed-in user does or does
 * not get an onboarding screen dropped on top of the page they are using.
 */
export function resolveOnboardingDecision(input: OnboardingDecisionInput): OnboardingDecision {
  if (input.bootstrapUnavailable) return { kind: "bootstrap-recovery" };
  if (input.completedThisSession) return { kind: "app", settled: true };

  if (input.entryGate?.billingLocked) {
    return input.onBillingRecoveryRoute
      ? { kind: "app", settled: true }
      : { kind: "billing-redirect" };
  }

  // Once the app itself has been shown off settled data, this mount keeps
  // showing it. `setupComplete` is org-wide and live: an admin who adds a focus
  // area, shift, or job in Settings makes it false for the whole organization
  // until they finish placing it, and the bootstrap refetch that carries that
  // change reaches every open tab. Without this latch, that flip replaced the
  // page a member was working in with the wizard or the setup-pending screen.
  if (input.appAlreadyShown) return { kind: "app", settled: true };

  if (input.orgLoading || input.entryGate === null) return { kind: "app", settled: false };

  // Finishing onboarding is durable and per-member, so it is answered before
  // the org-wide setup phase below. A member who has already been through the
  // app is never sent back into a wizard (or made to wait behind the pending
  // screen) because the organization's configuration is mid-edit.
  if (input.entryGate.onboardingCompleted) return { kind: "app", settled: true };

  // Nobody who cannot configure the organization gets in, or even gets their
  // own orientation, until an admin has been all the way through theirs.
  // Org-wide configuration completeness is not the same question: an org can
  // read as configured while its first super admin is still on their welcome
  // step, and that is exactly when members were being let in ahead of them.
  // Members already through the door are answered above and keep their access,
  // so this can only ever hold a first-time arrival.
  if (!input.canCompleteSetup && !input.entryGate.adminOnboardingCompleted) {
    return { kind: "setup-pending" };
  }

  const phase: OnboardingPhase =
    input.frozenPhase ?? (input.setupComplete ? "orientation" : "config");
  const freezePhase =
    input.frozenPhase === null && input.canCompleteSetup && input.orgDataReliable ? phase : null;

  if (phase === "config") {
    if (!input.canCompleteSetup) return { kind: "setup-pending" };
    return { kind: "wizard", isOrgSetup: false, freezePhase };
  }

  return { kind: "wizard", isOrgSetup: true, freezePhase };
}
