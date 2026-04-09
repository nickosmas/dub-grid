"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { TourConfig } from "./types";

interface TourEntryModalProps {
  config: NonNullable<TourConfig["entryModal"]>;
  totalSteps: number;
  onStart: () => void;
  onDismiss: () => void;
}

export default function TourEntryModal({
  config,
  totalSteps,
  onStart,
  onDismiss,
}: TourEntryModalProps) {
  const startRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the start button
  useEffect(() => {
    startRef.current?.focus();
  }, []);

  // Escape to dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onDismiss]);

  return createPortal(
    <div
      className="tour-entry-backdrop"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Tour introduction"
    >
      <div
        className="tour-entry-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tour-entry-headline">{config.headline}</div>
        <div className="tour-entry-meta">
          {totalSteps} {totalSteps === 1 ? "step" : "steps"} · {config.timeEstimate}
        </div>

        <button
          ref={startRef}
          type="button"
          className="tour-entry-start"
          onClick={onStart}
        >
          {config.startLabel || "Let's go"}
        </button>

        <button
          type="button"
          className="tour-entry-dismiss"
          onClick={onDismiss}
        >
          Skip for now
        </button>

        {config.showSpecialistLink && (
          <button
            type="button"
            className="tour-entry-specialist"
            onClick={() => {
              window.open("mailto:support@dubgrid.com?subject=Tour%20help", "_blank");
            }}
          >
            Talk to a specialist
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
