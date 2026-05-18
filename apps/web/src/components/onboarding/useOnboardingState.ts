"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { completeOnboarding as completeOnboardingRequest } from "@/features/onboarding/client";

export interface StepConfig {
  id: string;
  label: string;
}

interface OnboardingState {
  currentStepIndex: number;
  currentStep: StepConfig;
  totalSteps: number;
  goNext: () => void;
  goBack: () => void;
  goTo: (index: number) => void;
  completeOnboarding: () => Promise<void>;
  isFirstStep: boolean;
  isLastStep: boolean;
}

function storageKey(userId: string, orgId: string) {
  return `dg_onboarding:${userId}:${orgId}`;
}

export function useOnboardingState(
  userId: string,
  orgId: string,
  steps: StepConfig[],
): OnboardingState {
  const queryClient = useQueryClient();
  const key = storageKey(userId, orgId);

  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed < steps.length) return parsed;
    }
    return 0;
  });

  // Derive a safe index for this render. If the steps array shrinks mid-flow
  // (e.g. the wizard transitions from the 6-step config to the 3-step
  // orientation when org setup completes), the persisted index can exceed
  // steps.length - 1. Reading steps[currentStepIndex] would be undefined and
  // crash the consumer on currentStep.id.
  const safeStepIndex =
    steps.length === 0 ? 0 : Math.min(currentStepIndex, steps.length - 1);

  // Align the underlying state when it drifts so goNext/goBack work from the
  // clamped position on the next interaction rather than burning clicks.
  if (safeStepIndex !== currentStepIndex && steps.length > 0) {
    setCurrentStepIndex(safeStepIndex);
  }

  // Persist step to localStorage
  useEffect(() => {
    localStorage.setItem(key, String(currentStepIndex));
  }, [currentStepIndex, key]);

  const goNext = useCallback(() => {
    setCurrentStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const goBack = useCallback(() => {
    setCurrentStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < steps.length) setCurrentStepIndex(index);
    },
    [steps.length],
  );

  const completeOnboarding = useCallback(async () => {
    await completeOnboardingRequest(orgId);
    localStorage.removeItem(key);
    // Synchronously update cache (not invalidate) to avoid async refetch race
    // that flashes the underlying route before navigation completes
    queryClient.setQueryData(
      ["onboarding-status", userId, orgId],
      { completed: true, completedAt: new Date().toISOString(), tooltipToursCompleted: {} },
    );
  }, [userId, orgId, key, queryClient]);

  return {
    currentStepIndex: safeStepIndex,
    currentStep: steps[safeStepIndex],
    totalSteps: steps.length,
    goNext,
    goBack,
    goTo,
    completeOnboarding,
    isFirstStep: safeStepIndex === 0,
    isLastStep: safeStepIndex === steps.length - 1,
  };
}
