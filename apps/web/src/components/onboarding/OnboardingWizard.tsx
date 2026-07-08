"use client";

import { useMemo, useRef, useState } from "react";
import { useOnboardingState, type StepConfig } from "./useOnboardingState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import WizardShell from "./WizardShell";

// Steps
import WelcomeStep from "./steps/WelcomeStep";
import IdentityStep from "./steps/IdentityStep";
import StructureStep from "./steps/StructureStep";
import ScheduleStep from "./steps/ScheduleStep";
import AdminOrientationStep from "./steps/AdminOrientationStep";
import SuperAdminOrientationStep from "./steps/SuperAdminOrientationStep";
import CompletionStep from "./steps/CompletionStep";

interface OnboardingWizardProps {
  role: string;
  orgId: string;
  userId: string;
  isOrgSetup: boolean;
}

const SUPER_ADMIN_STEPS: StepConfig[] = [
  { id: "welcome", label: "Welcome" },
  { id: "identity", label: "Identity" },
  { id: "structure", label: "Structure" },
  { id: "schedule", label: "Schedule" },
  { id: "completion", label: "Done" },
];

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
  // Freeze the variant at mount: as the user fills in shifts/jobs during
  // ScheduleStep, setupStatus.isComplete can flip true, which would otherwise
  // re-render the wizard from the 5-step config flow into the 3-step
  // orientation flow and clamp the user from Schedule directly to Completion.
  // Capturing this once keeps the wizard stable until they actually finish.
  const isOrgSetupAtMountRef = useRef(isOrgSetup);
  const effectiveIsOrgSetup = isOrgSetupAtMountRef.current;

  const steps = useMemo(() => {
    if (role === "super_admin") {
      return effectiveIsOrgSetup ? SA_ORIENTATION_STEPS : SUPER_ADMIN_STEPS;
    }
    if (role === "admin") return ADMIN_STEPS;
    return USER_STEPS;
  }, [role, effectiveIsOrgSetup]);
  const { currentStepIndex, currentStep, goNext, goBack, completeOnboarding, isFirstStep } =
    useOnboardingState(userId, orgId, steps);

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

  function renderStep() {
    const id = currentStep.id;

    switch (id) {
      case "welcome":
        return <WelcomeStep role={role} onNext={goNext} isOrgSetup={effectiveIsOrgSetup} />;
      case "identity":
        return <IdentityStep onNext={goNext} onBack={goBack} />;
      case "structure":
        return <StructureStep onNext={goNext} onBack={goBack} />;
      case "schedule":
        return <ScheduleStep onNext={goNext} onBack={goBack} />;
      case "orientation":
        return <AdminOrientationStep onNext={goNext} onBack={goBack} />;
      case "sa-orientation":
        return <SuperAdminOrientationStep onNext={goNext} onBack={goBack} />;
      case "completion":
        return (
          <CompletionStep
            role={role}
            onComplete={completeOnboarding}
            isOrgSetup={effectiveIsOrgSetup}
          />
        );
      default:
        return null;
    }
  }

  const hideStepper = currentStep.id === "welcome" || currentStep.id === "completion";

  // Skip only escapes the per-user orientation phase. During org-config
  // (isOrgSetup === false) the gate re-triggers on reload because the
  // org-wide completeness check still fails, so the button would loop.
  const canSkip = effectiveIsOrgSetup && currentStep.id !== "completion";

  return (
    <>
      <WizardShell
        steps={steps}
        currentStepIndex={currentStepIndex}
        hideStepper={hideStepper}
        onSkip={canSkip ? () => setShowSkipConfirm(true) : undefined}
        skipLoading={skipLoading}
        centerContent={isFirstStep || currentStep.id === "completion"}
      >
        {renderStep()}
      </WizardShell>

      {showSkipConfirm && (
        <ConfirmDialog
          title="Skip Setup?"
          message="Are you sure you want to skip? You can configure your preferences later in Settings."
          confirmLabel="Yes, skip"
          cancelLabel="Go back"
          variant="warning"
          isLoading={skipLoading}
          onConfirm={handleSkip}
          onCancel={() => setShowSkipConfirm(false)}
        />
      )}
    </>
  );
}
