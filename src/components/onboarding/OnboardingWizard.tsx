"use client";

import { useMemo, useState } from "react";
import { DubGridLogo } from "@/components/Logo";
import StepperBar from "./StepperBar";
import { useOnboardingState, type StepConfig } from "./useOnboardingState";

// Steps
import WelcomeStep from "./steps/WelcomeStep";
import OrgDetailsStep from "./steps/OrgDetailsStep";
import DepartmentsStep from "./steps/DepartmentsStep";
import RolesStep from "./steps/RolesStep";
import CertificationsStep from "./steps/CertificationsStep";
import ShiftCodesStep from "./steps/ShiftCodesStep";
import AdminOrientationStep from "./steps/AdminOrientationStep";
import CompletionStep from "./steps/CompletionStep";

interface OnboardingWizardProps {
  role: string;
  orgId: string;
  userId: string;
}

const SUPER_ADMIN_STEPS: StepConfig[] = [
  { id: "welcome", label: "Welcome" },
  { id: "org-details", label: "Details" },
  { id: "departments", label: "Departments" },
  { id: "roles", label: "Roles" },
  { id: "certifications", label: "Certifications" },
  { id: "shift-codes", label: "Shift Codes" },
  { id: "completion", label: "Done" },
];

const ADMIN_STEPS: StepConfig[] = [
  { id: "welcome", label: "Welcome" },
  { id: "orientation", label: "Overview" },
  { id: "completion", label: "Done" },
];

const USER_STEPS: StepConfig[] = [
  { id: "welcome", label: "Welcome" },
  { id: "completion", label: "Done" },
];

function getSteps(role: string): StepConfig[] {
  if (role === "super_admin") return SUPER_ADMIN_STEPS;
  if (role === "admin") return ADMIN_STEPS;
  return USER_STEPS;
}

export default function OnboardingWizard({
  role,
  orgId,
  userId,
}: OnboardingWizardProps) {
  const steps = useMemo(() => getSteps(role), [role]);
  const {
    currentStepIndex,
    currentStep,
    goNext,
    goBack,
    completeOnboarding,
    isFirstStep,
  } = useOnboardingState(userId, orgId, steps);

  const [skipLoading, setSkipLoading] = useState(false);

  async function handleSkip() {
    setSkipLoading(true);
    try {
      await completeOnboarding();
      window.location.reload();
    } catch {
      setSkipLoading(false);
    }
  }

  // Render current step
  function renderStep() {
    const id = currentStep.id;

    switch (id) {
      case "welcome":
        return <WelcomeStep role={role} onNext={goNext} />;
      case "org-details":
        return <OrgDetailsStep onNext={goNext} onBack={goBack} />;
      case "departments":
        return <DepartmentsStep onNext={goNext} onBack={goBack} />;
      case "roles":
        return <RolesStep onNext={goNext} onBack={goBack} />;
      case "certifications":
        return <CertificationsStep onNext={goNext} onBack={goBack} />;
      case "shift-codes":
        return <ShiftCodesStep onNext={goNext} onBack={goBack} />;
      case "orientation":
        return <AdminOrientationStep onNext={goNext} onBack={goBack} />;
      case "completion":
        return (
          <CompletionStep role={role} onComplete={completeOnboarding} />
        );
      default:
        return null;
    }
  }

  // Don't show stepper on welcome or completion screens
  const showStepper =
    currentStep.id !== "welcome" && currentStep.id !== "completion";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background:
          "linear-gradient(145deg, var(--color-bg) 0%, var(--color-brand-bg, #f5faf5) 100%)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        overflow: "auto",
      }}
    >
      {/* Top bar with logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <DubGridLogo size={28} />
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            DubGrid
          </span>
        </div>

        {/* Skip link */}
        {currentStep.id !== "completion" && (
          <button
            onClick={handleSkip}
            disabled={skipLoading}
            type="button"
            style={{
              background: "none",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text-faint)",
              cursor: skipLoading ? "not-allowed" : "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              padding: "4px 8px",
            }}
          >
            {skipLoading ? "Skipping..." : "Skip setup"}
          </button>
        )}
      </div>

      {/* Stepper bar */}
      {showStepper && steps.length > 2 && (
        <div
          style={{
            padding: "0 24px 24px",
            maxWidth: 640,
            margin: "0 auto",
            width: "100%",
          }}
        >
          <StepperBar steps={steps} currentStepIndex={currentStepIndex} />
        </div>
      )}

      {/* Step content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: isFirstStep || currentStep.id === "completion"
            ? "center"
            : "flex-start",
          justifyContent: "center",
          padding: "24px 24px 48px",
          overflowY: "auto",
        }}
      >
        <div
          key={currentStep.id}
          style={{
            width: "100%",
            animation: "onboarding-fade-in 300ms ease both",
          }}
        >
          {renderStep()}
        </div>
      </div>

      {/* Fade-in animation */}
      <style>{`
        @keyframes onboarding-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
