"use client";

import { useState, useMemo, useCallback, useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { completeTooltipTour } from "@/lib/db";
import type { TourConfig, TourStep } from "./types";

interface OnboardingStatus {
  completed: boolean;
  completedAt: string | null;
  tooltipToursCompleted: Record<string, string>;
}

export interface UseTourResult {
  isActive: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  totalSteps: number;
  next: () => void;
  prev: () => void;
  /** Permanently skip the tour (writes to DB — tour won't reappear). */
  skip: () => void;
  /** Temporarily hide the tour for this session (no DB write — reappears next visit). */
  dismiss: () => void;
  complete: () => void;
  /** Call when the user performs the action described by an actionGated step. */
  onActionCompleted: () => void;
  /** Whether the entry modal should be shown (before step 0). */
  showEntryModal: boolean;
  /** Dismiss the entry modal and start the tour at step 0. */
  startTour: () => void;
  /** Dismiss the entry modal without starting (session-only — reappears next visit). */
  dismissEntryModal: () => void;
}

function storageKey(pageKey: string): string {
  return `dg_tour_step:${pageKey}`;
}

function readSavedStep(pageKey: string): number {
  try {
    const raw = sessionStorage.getItem(storageKey(pageKey));
    if (raw !== null) {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
  } catch { /* SSR / private browsing */ }
  return 0;
}

function writeSavedStep(pageKey: string, index: number): void {
  try {
    sessionStorage.setItem(storageKey(pageKey), String(index));
  } catch { /* ignore */ }
}

function clearSavedStep(pageKey: string): void {
  try {
    sessionStorage.removeItem(storageKey(pageKey));
  } catch { /* ignore */ }
}

export function useTooltipTour(config: TourConfig): UseTourResult {
  const { user } = useAuth();
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const orgId = perms.orgId;

  const { pageKey, steps } = config;

  // Read onboarding status directly from query cache (populated by OnboardingGate).
  // useSyncExternalStore ensures re-render when the cache entry changes.
  const queryKey = useMemo(() => ["onboarding-status", userId, orgId], [userId, orgId]);

  const onboardingStatus = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
          if (
            event?.query?.queryKey?.[0] === "onboarding-status" &&
            event?.query?.queryKey?.[1] === userId &&
            event?.query?.queryKey?.[2] === orgId
          ) {
            onStoreChange();
          }
        });
        return unsubscribe;
      },
      [queryClient, userId, orgId],
    ),
    () => queryClient.getQueryData<OnboardingStatus>(queryKey) ?? null,
    () => null,
  );

  const alreadyCompleted =
    !!onboardingStatus?.tooltipToursCompleted?.[pageKey];
  const onboardingDone = !!onboardingStatus?.completed;

  // Clean up stale saved step when tour is already completed
  useEffect(() => {
    if (alreadyCompleted) clearSavedStep(pageKey);
  }, [alreadyCompleted, pageKey]);

  // Filter steps by permission
  const filteredSteps = useMemo(
    () =>
      steps.filter((step) => {
        if (!step.requiredPermission) return true;
        const key = step.requiredPermission as keyof typeof perms;
        return !!perms[key];
      }),
    [steps, perms],
  );

  const savedStep = useMemo(() => readSavedStep(pageKey), [pageKey]);
  const [stepIndex, setStepIndex] = useState(savedStep);
  const [dismissed, setDismissed] = useState(false);
  const [entryModalDismissed, setEntryModalDismissed] = useState(false);

  // Reset stepIndex if filteredSteps shrinks below current index
  useEffect(() => {
    setStepIndex((prev) =>
      prev >= filteredSteps.length ? Math.max(0, filteredSteps.length - 1) : prev,
    );
  }, [filteredSteps.length]);

  const isActive =
    onboardingDone &&
    !alreadyCompleted &&
    !dismissed &&
    filteredSteps.length > 0;

  // Entry modal: show before step 0 if config has entryModal, user hasn't dismissed it,
  // AND we're not resuming from a previously saved step
  const isResuming = savedStep > 0;
  const showEntryModal =
    isActive && !entryModalDismissed && !isResuming && !!config.entryModal && stepIndex === 0;

  const markComplete = useCallback(async () => {
    if (!orgId) return;
    setDismissed(true);
    clearSavedStep(pageKey);

    // Optimistic cache update
    queryClient.setQueryData<OnboardingStatus>(
      queryKey,
      (old) =>
        old
          ? {
              ...old,
              tooltipToursCompleted: {
                ...old.tooltipToursCompleted,
                [pageKey]: new Date().toISOString(),
              },
            }
          : old,
    );

    try {
      await completeTooltipTour(orgId, pageKey);
    } catch {
      // Silently fail — optimistic update already applied
    }
  }, [orgId, queryKey, pageKey, queryClient]);

  const next = useCallback(() => {
    if (stepIndex >= filteredSteps.length - 1) {
      markComplete();
    } else {
      const newIndex = stepIndex + 1;
      setStepIndex(newIndex);
      writeSavedStep(pageKey, newIndex);
    }
  }, [stepIndex, filteredSteps.length, markComplete, pageKey]);

  const prev = useCallback(() => {
    setStepIndex((i) => {
      const newIndex = Math.max(0, i - 1);
      writeSavedStep(pageKey, newIndex);
      return newIndex;
    });
  }, [pageKey]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeSavedStep(pageKey, stepIndex);
  }, [pageKey, stepIndex]);

  const skip = useCallback(() => {
    markComplete();
  }, [markComplete]);

  const complete = useCallback(() => {
    markComplete();
  }, [markComplete]);

  const onActionCompleted = useCallback(() => {
    const current = filteredSteps[stepIndex];
    if (current?.actionGated) {
      next();
    }
  }, [filteredSteps, stepIndex, next]);

  const startTour = useCallback(() => {
    setEntryModalDismissed(true);
  }, []);

  const dismissEntryModal = useCallback(() => {
    setDismissed(true);
  }, []);

  // Escape key dismisses the tour
  useEffect(() => {
    if (!isActive || showEntryModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isActive, showEntryModal, dismiss]);

  return {
    isActive,
    currentStepIndex: stepIndex,
    currentStep: isActive ? filteredSteps[stepIndex] ?? null : null,
    totalSteps: filteredSteps.length,
    next,
    prev,
    skip,
    dismiss,
    complete,
    onActionCompleted,
    showEntryModal,
    startTour,
    dismissEntryModal,
  };
}
