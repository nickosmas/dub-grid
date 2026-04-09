"use client";

import { useEffect, useRef } from "react";
import { useTooltipTour } from "./useTooltipTour";
import TourSpotlight from "./TourSpotlight";
import TourPopover from "./TourPopover";
import TourEntryModal from "./TourEntryModal";
import type { TourConfig } from "./types";

interface Props {
  config: TourConfig;
}

/* ── Action-gating via module-level ref ───────────────────── */

/** Module-level callback. Set by TooltipTourRunner, called by any component. */
let _onActionCompleted: (() => void) | null = null;

/** Call this from any component when the user performs the action
 *  described by an actionGated tour step. Safe to call when no tour is active. */
export function completeTourAction() {
  _onActionCompleted?.();
}

/* ── Runner ────────────────────────────────────────────────── */

export function TooltipTourRunner({ config }: Props) {
  const tour = useTooltipTour(config);

  // Keep module-level callback in sync with the current tour
  const onActionRef = useRef(tour.onActionCompleted);
  onActionRef.current = tour.onActionCompleted;

  useEffect(() => {
    if (tour.isActive) {
      _onActionCompleted = () => onActionRef.current();
      return () => { _onActionCompleted = null; };
    }
    _onActionCompleted = null;
  }, [tour.isActive]);

  if (!tour.isActive) return null;

  // Entry modal (before step 1)
  if (tour.showEntryModal && config.entryModal) {
    return (
      <TourEntryModal
        config={config.entryModal}
        totalSteps={tour.totalSteps}
        onStart={tour.startTour}
        onDismiss={tour.dismissEntryModal}
      />
    );
  }

  if (!tour.currentStep) return null;

  return (
    <>
      <TourSpotlight target={tour.currentStep.target} onDismiss={tour.dismiss} />
      <TourPopover
        step={tour.currentStep}
        stepIndex={tour.currentStepIndex}
        totalSteps={tour.totalSteps}
        onNext={tour.next}
        onPrev={tour.prev}
        onSkip={tour.skip}
        onAutoSkip={() => {
          tour.currentStep?.actionGated ? tour.dismiss() : tour.next();
        }}
      />
    </>
  );
}
