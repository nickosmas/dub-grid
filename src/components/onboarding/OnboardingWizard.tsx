"use client";

import { useMemo, useState } from "react";
import { DubGridLogo } from "@/components/Logo";
import StepperBar from "./StepperBar";
import { useOnboardingState, type StepConfig } from "./useOnboardingState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useOrganizationData } from "@/hooks";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";

// Steps
import WelcomeStep from "./steps/WelcomeStep";
import OrgDetailsStep from "./steps/OrgDetailsStep";
import DepartmentsStep from "./steps/DepartmentsStep";
import RolesStep from "./steps/RolesStep";
import CertificationsStep from "./steps/CertificationsStep";
import ShiftCodesStep from "./steps/ShiftCodesStep";
import DisplayModeStep from "./steps/DisplayModeStep";
import ShiftCodesDetailStep from "./steps/ShiftCodesDetailStep";
import AdminOrientationStep from "./steps/AdminOrientationStep";
import SuperAdminOrientationStep from "./steps/SuperAdminOrientationStep";
import CustomLabelsStep from "./steps/CustomLabelsStep";
import CompletionStep from "./steps/CompletionStep";

import type { ShiftDisplayMode } from "@/types";

interface OnboardingWizardProps {
  role: string;
  orgId: string;
  userId: string;
  isOrgSetup: boolean;
}

function buildSuperAdminSteps(displayMode: ShiftDisplayMode): StepConfig[] {
  const shiftsLabel = displayMode === "name" ? "Names" : "Codes";
  return [
    { id: "welcome", label: "Welcome" },
    { id: "org-details", label: "Details" },
    { id: "custom-labels", label: "Labels" },
    { id: "departments", label: "Depts" },
    { id: "roles", label: "Roles" },
    { id: "certifications", label: "Certs" },
    { id: "display-mode", label: "Display" },
    { id: "shift-categories", label: "Categories" },
    { id: "shift-codes", label: shiftsLabel },
    { id: "completion", label: "Done" },
  ];
}

const ADMIN_STEPS: StepConfig[] = [
  { id: "welcome", label: "Welcome" },
  { id: "orientation", label: "Overview" },
  { id: "completion", label: "Done" },
];

const SA_ORIENTATION_STEPS: StepConfig[] = [
  { id: "welcome", label: "Welcome" },
  { id: "sa-orientation", label: "Overview" },
  { id: "completion", label: "Done" },
];

const USER_STEPS: StepConfig[] = [
  { id: "welcome", label: "Welcome" },
  { id: "completion", label: "Done" },
];

export default function OnboardingWizard({
  role,
  orgId,
  userId,
  isOrgSetup,
}: OnboardingWizardProps) {
  const { org } = useOrganizationData();
  const displayMode = org?.shiftDisplayMode ?? "code";

  const steps = useMemo(() => {
    if (role === "super_admin") {
      return isOrgSetup ? SA_ORIENTATION_STEPS : buildSuperAdminSteps(displayMode);
    }
    if (role === "admin") return ADMIN_STEPS;
    return USER_STEPS;
  }, [role, displayMode, isOrgSetup]);
  const {
    currentStepIndex,
    currentStep,
    goNext,
    goBack,
    completeOnboarding,
    isFirstStep,
  } = useOnboardingState(userId, orgId, steps);

  const [skipLoading, setSkipLoading] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  async function handleSkip() {
    setSkipLoading(true);
    try {
      await completeOnboarding();
      window.location.reload();
    } catch (err) {
      Sentry.captureException(err);
      toast.error("Failed to skip setup. Please try again.");
      setSkipLoading(false);
    }
  }

  // Render current step
  function renderStep() {
    const id = currentStep.id;

    switch (id) {
      case "welcome":
        return <WelcomeStep role={role} onNext={goNext} isOrgSetup={isOrgSetup} />;
      case "org-details":
        return <OrgDetailsStep onNext={goNext} onBack={goBack} />;
      case "custom-labels":
        return <CustomLabelsStep onNext={goNext} onBack={goBack} />;
      case "display-mode":
        return <DisplayModeStep onNext={goNext} onBack={goBack} />;
      case "departments":
        return <DepartmentsStep onNext={goNext} onBack={goBack} />;
      case "roles":
        return <RolesStep onNext={goNext} onBack={goBack} />;
      case "certifications":
        return <CertificationsStep onNext={goNext} onBack={goBack} />;
      case "shift-categories":
        return <ShiftCodesStep onNext={goNext} onBack={goBack} />;
      case "shift-codes":
        return <ShiftCodesDetailStep onNext={goNext} onBack={goBack} />;
      case "orientation":
        return <AdminOrientationStep onNext={goNext} onBack={goBack} />;
      case "sa-orientation":
        return <SuperAdminOrientationStep onNext={goNext} onBack={goBack} />;
      case "completion":
        return (
          <CompletionStep role={role} onComplete={completeOnboarding} isOrgSetup={isOrgSetup} />
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
            onClick={() => setShowSkipConfirm(true)}
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
            maxWidth: 860,
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
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {showSkipConfirm && (
        <ConfirmDialog
          title="Skip Setup?"
          message={
            role === "super_admin"
              ? "Skipping will leave your workspace unconfigured. You\u2019ll need to set things up later in Settings before your team can use the app."
              : "Are you sure you want to skip? You can configure your preferences later in Settings."
          }
          confirmLabel="Yes, skip"
          cancelLabel="Go back"
          variant="warning"
          isLoading={skipLoading}
          onConfirm={handleSkip}
          onCancel={() => setShowSkipConfirm(false)}
        />
      )}
    </div>
  );
}
