"use client";

import { DubGridLogo } from "@/components/Logo";
import { Button } from "@/components/Button";
import StepperBar from "./StepperBar";
import type { StepConfig } from "./useOnboardingState";
import { ButtonLoading } from "@/components/ButtonSpinner";

interface WizardShellProps {
  steps: StepConfig[];
  currentStepIndex: number;
  /** Hide the stepper bar (used on welcome + completion screens). */
  hideStepper?: boolean;
  /** Optional click handler for the "Skip setup" link in the top-right. Hidden when undefined. */
  onSkip?: () => void;
  skipLoading?: boolean;
  /** True when the active step is the first or completion step — centers the content. */
  centerContent?: boolean;
  children: React.ReactNode;
}

/**
 * Shared shell for the onboarding wizard. Replaces the inline-styled fixed
 * overlay that previously lived inside OnboardingWizard.tsx so the wizard
 * picks up the same brand surface as the rest of the auth flow.
 */
export default function WizardShell({
  steps,
  currentStepIndex,
  hideStepper,
  onSkip,
  skipLoading,
  centerContent,
  children,
}: WizardShellProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: "var(--dg-color-onboarding-shell-bg)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        overflow: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DubGridLogo size={28} />
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            DubGrid
          </span>
        </div>

        {onSkip && (
          <Button
            onClick={onSkip}
            disabled={skipLoading}
            type="button"
            style={{
              background: "none",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--dg-color-text-label)",
              cursor: skipLoading ? "not-allowed" : "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              padding: "4px 8px",
            }}
          >
            <ButtonLoading loading={Boolean(skipLoading)}>Skip setup</ButtonLoading>
          </Button>
        )}
      </div>

      {!hideStepper && steps.length > 2 && (
        <div
          style={{
            padding: "0 24px 24px",
            maxWidth: 860,
            margin: "0 auto",
            width: "100%",
          }}
        >
          <StepperBar steps={steps} currentStepIndex={currentStepIndex} />
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: centerContent ? "center" : "flex-start",
          justifyContent: "center",
          padding: "24px 24px 48px",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            animation: "onboarding-fade-in 300ms ease both",
          }}
        >
          {children}
        </div>
      </div>

      <style>{`
        @keyframes onboarding-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
