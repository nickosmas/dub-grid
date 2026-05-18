import { captureEvent } from "@/lib/posthog";

/**
 * Typed PostHog wrappers for the onboarding funnel.
 *
 * Each call is a no-op when PostHog is disabled (no env vars, no consent),
 * so callers don't need to gate them. Properties intentionally avoid PII
 * beyond what the user is already identified by in PostHogProvider.
 */

export type OnboardingRole = "gridmaster" | "super_admin" | "admin" | "user";

interface OnboardingProps {
  role: OnboardingRole | string;
  orgId: string;
}

function emit(event: string, props: Record<string, unknown>) {
  captureEvent(event, props);
}

export function captureOnboardingStarted(props: OnboardingProps) {
  emit("onboarding_started", { ...props });
}

export function captureOnboardingStepCompleted(
  props: OnboardingProps & { stepId: string; secondsOnStep: number },
) {
  emit("onboarding_step_completed", { ...props });
}

export function captureOnboardingStepSkipped(
  props: OnboardingProps & { stepId: string },
) {
  emit("onboarding_step_skipped", { ...props });
}

export function captureOnboardingCompleted(props: OnboardingProps) {
  emit("onboarding_completed", { ...props });
}

export function captureOnboardingAbandoned(
  props: OnboardingProps & { lastStepId: string },
) {
  emit("onboarding_abandoned", { ...props });
}

export function capturePersonaLandingDismissed(props: OnboardingProps) {
  emit("persona_landing_dismissed", { ...props });
}
