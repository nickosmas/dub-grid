"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { TourStep } from "./types";

interface TourPopoverProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onAutoSkip?: () => void;
}

import { isElementVisible, OCCLUSION_POLL_MS } from "./tour-utils";

const POPOVER_GAP = 12;

function computePosition(
  rect: DOMRect,
  side: "top" | "bottom" | "left" | "right",
  popoverWidth: number,
  popoverHeight: number,
): { top: number; left: number; actualSide: "top" | "bottom" | "left" | "right" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0;
  let left = 0;
  let actualSide = side;

  switch (side) {
    case "bottom":
      top = rect.bottom + POPOVER_GAP;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      if (top + popoverHeight > vh) {
        top = rect.top - POPOVER_GAP - popoverHeight;
        actualSide = "top";
      }
      break;
    case "top":
      top = rect.top - POPOVER_GAP - popoverHeight;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      if (top < 0) {
        top = rect.bottom + POPOVER_GAP;
        actualSide = "bottom";
      }
      break;
    case "left":
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left - POPOVER_GAP - popoverWidth;
      if (left < 0) {
        left = rect.right + POPOVER_GAP;
        actualSide = "right";
      }
      break;
    case "right":
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.right + POPOVER_GAP;
      if (left + popoverWidth > vw) {
        left = rect.left - POPOVER_GAP - popoverWidth;
        actualSide = "left";
      }
      break;
  }

  // Clamp to viewport
  left = Math.max(8, Math.min(left, vw - popoverWidth - 8));
  top = Math.max(8, Math.min(top, vh - popoverHeight - 8));

  return { top, left, actualSide };
}

function computeArrowPosition(
  rect: DOMRect,
  actualSide: "top" | "bottom" | "left" | "right",
  popoverLeft: number,
  popoverTop: number,
): React.CSSProperties {
  const arrowSize = 8;
  const halfArrow = arrowSize / 2;

  switch (actualSide) {
    case "bottom": {
      // Arrow points up, sits at top edge of popover
      const centerX = rect.left + rect.width / 2 - popoverLeft;
      return { top: -halfArrow, left: Math.max(16, Math.min(centerX - halfArrow, 320 - 24)) };
    }
    case "top": {
      // Arrow points down, sits at bottom edge of popover
      const centerX = rect.left + rect.width / 2 - popoverLeft;
      return { bottom: -halfArrow, left: Math.max(16, Math.min(centerX - halfArrow, 320 - 24)) };
    }
    case "right": {
      // Arrow points left, sits at left edge of popover
      const centerY = rect.top + rect.height / 2 - popoverTop;
      return { left: -halfArrow, top: Math.max(16, centerY - halfArrow) };
    }
    case "left": {
      // Arrow points right, sits at right edge of popover
      const centerY = rect.top + rect.height / 2 - popoverTop;
      return { right: -halfArrow, top: Math.max(16, centerY - halfArrow) };
    }
  }
}

export default function TourPopover({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onAutoSkip,
}: TourPopoverProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    actualSide: "top" | "bottom" | "left" | "right";
  } | null>(null);
  const isLast = stepIndex === totalSteps - 1;
  const isFirst = stepIndex === 0;

  // Stable ref for onAutoSkip to avoid re-running the MutationObserver effect
  const onAutoSkipRef = useRef(onAutoSkip);
  onAutoSkipRef.current = onAutoSkip;

  // Scroll target into view and measure — retry via MutationObserver if not yet mounted.
  // If the target is obscured by a modal/panel, hide the tour and poll until it clears.
  useEffect(() => {
    setRect(null);
    setPosition(null);

    function measure(el: Element) {
      const elRect = el.getBoundingClientRect();
      const inView = elRect.top >= 0 && elRect.bottom <= window.innerHeight;

      if (!inView) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        scrollTimer = setTimeout(() => {
          const r = el.getBoundingClientRect();
          if (isElementVisible(el, r)) {
            setRect(r);
          } else {
            // Obscured — start polling
            startOcclusionPoll(el);
          }
        }, 350);
        return;
      }

      if (isElementVisible(el, elRect)) {
        setRect(elRect);
      } else {
        // Element is in viewport but covered by a modal/panel — poll until clear
        startOcclusionPoll(el);
      }
    }

    function startOcclusionPoll(el: Element) {
      setRect(null);
      if (occlusionPoll) clearInterval(occlusionPoll);
      occlusionPoll = setInterval(() => {
        // Element removed while we were polling
        if (!document.contains(el)) {
          if (occlusionPoll) { clearInterval(occlusionPoll); occlusionPoll = null; }
          onAutoSkipRef.current?.();
          return;
        }
        const r = el.getBoundingClientRect();
        if (isElementVisible(el, r)) {
          if (occlusionPoll) { clearInterval(occlusionPoll); occlusionPoll = null; }
          setRect(r);
        }
      }, OCCLUSION_POLL_MS);
    }

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;
    let skipTimer: ReturnType<typeof setTimeout> | null = null;
    let occlusionPoll: ReturnType<typeof setInterval> | null = null;

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      measure(el);
    } else {
      // Target not in DOM yet — watch for it
      observer = new MutationObserver(() => {
        const found = document.querySelector(`[data-tour="${step.target}"]`);
        if (found) {
          observer!.disconnect();
          observer = null;
          if (skipTimer) { clearTimeout(skipTimer); skipTimer = null; }
          measure(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Auto-skip if target never appears (e.g. on a different tab)
      const timeout = step.autoSkipTimeout ?? 2000;
      skipTimer = setTimeout(() => {
        if (observer) { observer.disconnect(); observer = null; }
        onAutoSkipRef.current?.();
      }, timeout);
    }

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      if (observer) observer.disconnect();
      if (skipTimer) clearTimeout(skipTimer);
      if (occlusionPoll) clearInterval(occlusionPoll);
    };
  }, [step.target, step.autoSkipTimeout]);

  // Position popover once we have both rect and popover dimensions
  useEffect(() => {
    if (!rect || !popoverRef.current) return;
    const { offsetWidth, offsetHeight } = popoverRef.current;
    const pos = computePosition(rect, step.side ?? "bottom", offsetWidth, offsetHeight);
    setPosition(pos);
  }, [rect, step.side]);

  // Re-measure on scroll/resize; detect target removal or occlusion
  useEffect(() => {
    function update() {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (isElementVisible(el, r)) {
          setRect(r);
        } else if (rect) {
          // Target just became obscured by a modal/panel
          setRect(null);
        }
      } else if (rect) {
        // Target was present but has been removed from the DOM
        setRect(null);
        onAutoSkipRef.current?.();
      }
    }
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [step.target, rect]);

  // Focus the popover when it appears for a11y
  useEffect(() => {
    if (position && popoverRef.current) {
      popoverRef.current.focus();
    }
  }, [position]);

  const arrowStyle = rect && position
    ? computeArrowPosition(rect, position.actualSide, position.left, position.top)
    : undefined;

  return createPortal(
    <div
      ref={popoverRef}
      className="tour-popover"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={step.title}
      tabIndex={-1}
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        opacity: position ? 1 : 0,
      }}
    >
      {/* Arrow */}
      {arrowStyle && position && (
        <div
          className="tour-popover-arrow"
          data-side={position.actualSide}
          style={arrowStyle}
        />
      )}

      {/* Title */}
      <div className="tour-popover-title">{step.title}</div>

      {/* Body */}
      <div className="tour-popover-body">{step.body}</div>

      {/* Footer: progress + actions */}
      <div className="tour-popover-footer">
        {/* Progress */}
        <span className="tour-popover-progress" aria-label={`Step ${stepIndex + 1} of ${totalSteps}`}>
          {stepIndex + 1} of {totalSteps}
        </span>

        <div className="tour-popover-actions">
          {/* Back */}
          {!isFirst && (
            <button
              onClick={onPrev}
              type="button"
              className="tour-popover-back"
              aria-label="Go to previous step"
            >
              Back
            </button>
          )}

          {/* Skip tour */}
          <button
            onClick={onSkip}
            type="button"
            className="tour-popover-skip"
            aria-label="Skip this tour"
          >
            Skip tour
          </button>

          {/* Next / Got it / Custom CTA */}
          {!step.actionGated && (
            <button
              onClick={onNext}
              type="button"
              className="tour-popover-next"
              aria-label={isLast ? (step.completionLabel || "Got it") : "Go to next step"}
            >
              {isLast ? (step.completionLabel || "Got it") : "Next"}
            </button>
          )}

          {/* Action-gated: waiting indicator instead of button */}
          {step.actionGated && (
            <span
              className="tour-popover-progress"
              style={{ fontStyle: "italic" }}
            >
              Try it now...
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
