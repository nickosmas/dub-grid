"use client";

import { useId, useRef } from "react";
import Modal from "@/components/Modal";
import { StepUpForm } from "@/components/auth/StepUpForm";
import type { StepUpMethod } from "@/features/account/client/step-up";

interface StepUpDialogProps {
  method: StepUpMethod;
  error: string | null;
  onConfirm: (credential: string) => Promise<void>;
  onCancel: () => void;
}

export function StepUpDialog({ method, error, onConfirm, onCancel }: StepUpDialogProps) {
  const id = useId();
  const inFlight = useRef(false);

  return (
    <Modal
      title="Confirm your identity"
      onClose={onCancel}
      onRequestClose={() => {
        if (!inFlight.current) onCancel();
        return false;
      }}
      showCloseButton={false}
      aria-describedby={`${id}-description`}
      className="max-w-md"
    >
      <StepUpForm
        key={method}
        method={method}
        error={error}
        onConfirm={onConfirm}
        onCancel={onCancel}
        descriptionId={`${id}-description`}
        onBusyChange={(busy) => {
          inFlight.current = busy;
        }}
      />
    </Modal>
  );
}
