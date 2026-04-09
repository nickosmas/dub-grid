"use client";

import { useMemo, useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { usePermissions } from "@/hooks/usePermissions";
import type { TourConfig } from "./types";

import { scheduleBasicsTour } from "./tours/schedule-basics";
import { scheduleEditingTour } from "./tours/schedule-editing";
import { scheduleRecurringTour } from "./tours/schedule-recurring";
import { schedulePublishingTour } from "./tours/schedule-publishing";
import { scheduleRequestsTour } from "./tours/schedule-requests";

interface OnboardingStatus {
  completed: boolean;
  completedAt: string | null;
  tooltipToursCompleted: Record<string, string>;
}

interface ScheduleState {
  hasShifts: boolean;
  hasDrafts: boolean;
  isEmployee: boolean;
  hasOwnPublishedShift: boolean;
}

/**
 * Selects the first incomplete schedule tour whose trigger condition is met.
 * Tours are evaluated in order — each tour acts as a prerequisite for the next.
 */
export function useActiveScheduleTour(state: ScheduleState): TourConfig | null {
  const { user } = useAuth();
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const orgId = perms.orgId;

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

  const onboardingDone = !!onboardingStatus?.completed;
  const completed = onboardingStatus?.tooltipToursCompleted ?? {};

  return useMemo(() => {
    if (!onboardingDone) return null;

    const isComplete = (key: string) => !!completed[key];

    // Tour 1: Grid Basics — show only when the schedule is still empty.
    // Once shifts exist the user already knows the basics; skip to Tour 2.
    if (!isComplete("schedule-basics") && !state.hasShifts) {
      return scheduleBasicsTour;
    }

    // Tour 2: Editing & Moving — show after basics, when shifts exist
    if (!isComplete("schedule-editing") && state.hasShifts) {
      return scheduleEditingTour;
    }

    // Tour 3: Recurring & Bulk — show after editing tour completed
    if (!isComplete("schedule-recurring") && isComplete("schedule-editing")) {
      return scheduleRecurringTour;
    }

    // Tour 4: Draft & Publish — show when drafts exist and recurring done
    if (!isComplete("schedule-publishing") && state.hasDrafts && isComplete("schedule-recurring")) {
      return schedulePublishingTour;
    }

    // Tour 5: Employee Requests — show for non-admin users with published shifts
    if (!isComplete("schedule-requests") && state.isEmployee && state.hasOwnPublishedShift) {
      return scheduleRequestsTour;
    }

    return null;
  }, [onboardingDone, completed, state]);
}
