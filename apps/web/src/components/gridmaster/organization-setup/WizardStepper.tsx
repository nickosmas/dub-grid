import StepperBar from "@/components/StepperBar";
import { STEPS, type StepKey } from "./constants";

export function WizardStepper({ currentStep }: { currentStep: StepKey }) {
  const visibleSteps = STEPS.filter((step) => step.key !== "decision").map((step) => ({
    id: step.key,
    label: step.label,
  }));
  const currentIdx = visibleSteps.findIndex((step) => step.id === currentStep);
  const effectiveIdx = currentStep === "decision" ? 2 : currentIdx;

  return (
    <div style={{ marginBottom: 24 }}>
      <StepperBar steps={visibleSteps} currentStepIndex={effectiveIdx} />
    </div>
  );
}
