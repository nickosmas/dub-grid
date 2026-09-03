"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  completeOnboarding as completeOnboardingRequest,
  markOnboardingComplete,
  clearOnboardingPhase,
} from "@/features/onboarding/client";
import type { OrganizationBootstrap } from "@/features/organization/client";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";

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

// Scoped by variant: the flows have different lengths and different steps, so
// a position saved in one is meaningless in another. Without the variant in the
// key, a wizard that changed flow mid-visit resumed at the other flow's index.
function storageKey(userId: string, orgId: string, variant: string) {
  return `dg_onboarding:${userId}:${orgId}:${variant}`;
}

export function useOnboardingState(
  userId: string,
  orgId: string,
  steps: StepConfig[],
  variant: string,
): OnboardingState {
  const queryClient = useQueryClient();
  const key = storageKey(userId, orgId, variant);

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
  const safeStepIndex = steps.length === 0 ? 0 : Math.min(currentStepIndex, steps.length - 1);

  // Align the underlying state when it drifts so goNext/goBack work from the
  // clamped position on the next interaction rather than burning clicks.
  if (safeStepIndex !== currentStepIndex && steps.length > 0) {
    setCurrentStepIndex(safeStepIndex);
  }

  // Persist the CLAMPED step (L-4) — persisting the raw currentStepIndex could
  // store an out-of-range value when the steps array shrinks, so a reload in
  // that window re-reads a stale index before the realign lands.
  useEffect(() => {
    localStorage.setItem(key, String(safeStepIndex));
  }, [safeStepIndex, key]);

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
    const completion = await completeOnboardingRequest(orgId);
    localStorage.removeItem(key);
    const statusQueryKey = ["onboarding-status", userId, orgId] as const;
    const bootstrapQueryKey = queryKeys.org.bootstrap();

    await queryClient.cancelQueries({ queryKey: bootstrapQueryKey });
    queryClient.setQueryData(statusQueryKey, {
      completed: true,
      completedAt: completion.completedAt,
      tooltipToursCompleted: {},
    });
    queryClient.setQueryData<OrganizationBootstrap>(bootstrapQueryKey, (current) => {
      if (!current?.org || current.org.id !== orgId) return current;
      return {
        ...current,
        entryGate: { ...current.entryGate, onboardingCompleted: true },
      };
    });
    broadcastInvalidation(statusQueryKey);
    broadcastInvalidation(bootstrapQueryKey);
    markOnboardingComplete(userId, orgId);
    clearOnboardingPhase(userId, orgId);
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
