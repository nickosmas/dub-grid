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
    currentStepIndex,
    currentStep: steps[currentStepIndex],
    totalSteps: steps.length,
    goNext,
    goBack,
    goTo,
    completeOnboarding,
    isFirstStep: currentStepIndex === 0,
    isLastStep: currentStepIndex === steps.length - 1,
  };
}
