import { describe, expect, it } from "vitest";
import { resolveOnboardingDecision, type OnboardingDecisionInput } from "./onboarding-decision";

function input(overrides: Partial<OnboardingDecisionInput> = {}): OnboardingDecisionInput {
  return {
    bootstrapUnavailable: false,
    completedThisSession: false,
    appAlreadyShown: false,
    orgLoading: false,
    entryGate: { onboardingCompleted: false, adminOnboardingCompleted: true, billingLocked: null },
    onBillingRecoveryRoute: false,
    canRecoverBilling: false,
    setupComplete: true,
    canCompleteSetup: false,
    orgDataReliable: true,
    frozenPhase: null,
    ...overrides,
  };
}

describe("resolveOnboardingDecision", () => {
  it("shows the orientation wizard to a member who has not onboarded", () => {
    expect(resolveOnboardingDecision(input())).toEqual({
      kind: "wizard",
      isOrgSetup: true,
      freezePhase: null,
    });
  });

  it("shows the config wizard to setup-capable users while org setup is incomplete", () => {
    expect(
      resolveOnboardingDecision(input({ setupComplete: false, canCompleteSetup: true })),
    ).toEqual({ kind: "wizard", isOrgSetup: false, freezePhase: "config" });
  });

  it("holds users who cannot advance setup on the pending screen", () => {
    expect(resolveOnboardingDecision(input({ setupComplete: false }))).toEqual({
      kind: "setup-pending",
    });
  });

  it("keeps an onboarded member in the app when org setup goes incomplete", () => {
    const entryGate = {
      onboardingCompleted: true,
      adminOnboardingCompleted: true,
      billingLocked: null,
    };
    expect(resolveOnboardingDecision(input({ entryGate, setupComplete: false }))).toEqual({
      kind: "app",
      settled: true,
    });
    expect(
      resolveOnboardingDecision(input({ entryGate, setupComplete: false, canCompleteSetup: true })),
    ).toEqual({ kind: "app", settled: true });
  });

  it("keeps the app once it has been shown, even if setup completeness flips", () => {
    expect(
      resolveOnboardingDecision(
        input({ appAlreadyShown: true, setupComplete: false, canCompleteSetup: true }),
      ),
    ).toEqual({ kind: "app", settled: true });
  });

  it("does not latch the app while the answer is still unsettled", () => {
    expect(resolveOnboardingDecision(input({ orgLoading: true }))).toEqual({
      kind: "app",
      settled: false,
    });
    expect(resolveOnboardingDecision(input({ entryGate: null }))).toEqual({
      kind: "app",
      settled: false,
    });
  });

  it("still sends a billing-locked super admin to recovery after the app has been shown", () => {
    expect(
      resolveOnboardingDecision(
        input({
          appAlreadyShown: true,
          canRecoverBilling: true,
          entryGate: {
            onboardingCompleted: true,
            adminOnboardingCompleted: true,
            billingLocked: true,
          },
        }),
      ),
    ).toEqual({ kind: "billing-redirect", destination: "recovery" });
  });

  it("lets a billing-locked super admin stay on the recovery route", () => {
    expect(
      resolveOnboardingDecision(
        input({
          onBillingRecoveryRoute: true,
          canRecoverBilling: true,
          entryGate: {
            onboardingCompleted: false,
            adminOnboardingCompleted: true,
            billingLocked: true,
          },
        }),
      ),
    ).toEqual({ kind: "app", settled: true });
  });

  it("sends a non-recovery role to the terminal organization gate", () => {
    expect(
      resolveOnboardingDecision(
        input({
          entryGate: {
            onboardingCompleted: true,
            adminOnboardingCompleted: true,
            billingLocked: true,
          },
        }),
      ),
    ).toEqual({ kind: "billing-redirect", destination: "organization-gate" });
  });

  it("prefers the frozen phase over live setup completeness", () => {
    expect(
      resolveOnboardingDecision(
        input({ frozenPhase: "config", setupComplete: true, canCompleteSetup: true }),
      ),
    ).toEqual({ kind: "wizard", isOrgSetup: false, freezePhase: null });
  });

  it("keeps the app unsettled while bootstrap data belongs to another organization", () => {
    expect(
      resolveOnboardingDecision(
        input({
          orgDataReliable: false,
          entryGate: {
            onboardingCompleted: false,
            adminOnboardingCompleted: false,
            billingLocked: true,
          },
        }),
      ),
    ).toEqual({ kind: "app", settled: false });
  });

  it("uses completed and incomplete admission states only after reliable bootstrap data", () => {
    expect(
      resolveOnboardingDecision(
        input({
          entryGate: {
            onboardingCompleted: true,
            adminOnboardingCompleted: true,
            billingLocked: null,
          },
        }),
      ),
    ).toEqual({ kind: "app", settled: true });
    expect(resolveOnboardingDecision(input())).toEqual({
      kind: "wizard",
      isOrgSetup: true,
      freezePhase: null,
    });
  });

  it("holds a first-time member until an admin has finished their own onboarding", () => {
    // The organization reads as configured, which is what used to let members
    // in while the first super admin was still on their welcome step.
    expect(
      resolveOnboardingDecision(
        input({
          setupComplete: true,
          entryGate: {
            onboardingCompleted: false,
            adminOnboardingCompleted: false,
            billingLocked: null,
          },
        }),
      ),
    ).toEqual({ kind: "setup-pending" });
  });

  it("never holds the admin who has to finish that onboarding", () => {
    expect(
      resolveOnboardingDecision(
        input({
          canCompleteSetup: true,
          setupComplete: true,
          entryGate: {
            onboardingCompleted: false,
            adminOnboardingCompleted: false,
            billingLocked: null,
          },
        }),
      ),
    ).toEqual({ kind: "wizard", isOrgSetup: true, freezePhase: "orientation" });
  });

  it("leaves a member who is already through the door where they are", () => {
    expect(
      resolveOnboardingDecision(
        input({
          entryGate: {
            onboardingCompleted: true,
            adminOnboardingCompleted: false,
            billingLocked: null,
          },
        }),
      ),
    ).toEqual({ kind: "app", settled: true });
  });

  it("recovers from an unusable bootstrap before anything else", () => {
    expect(
      resolveOnboardingDecision(input({ bootstrapUnavailable: true, appAlreadyShown: true })),
    ).toEqual({ kind: "bootstrap-recovery" });
  });
});
