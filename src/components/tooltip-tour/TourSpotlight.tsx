"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isElementVisible } from "./tour-utils";

interface TourSpotlightProps {
  target: string;
  onDismiss: () => void;
}

/** Semi-transparent overlay with a cutout around the target element. */
export default function TourSpotlight({ target, onDismiss }: TourSpotlightProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setRect(null);
    let observer: MutationObserver | null = null;
    let trackedEl: Element | null = null;

    function update() {
      if (!trackedEl) return;
      const r = trackedEl.getBoundingClientRect();
      if (isElementVisible(trackedEl, r)) {
        setRect(r);
      } else {
        setRect(null);
      }
    }

    function attach(el: Element) {
      trackedEl = el;
      update();
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
    }

    const el = document.querySelector(`[data-tour="${target}"]`);
    if (el) {
      attach(el);
    } else {
      // Target not in DOM yet — watch for it
      observer = new MutationObserver(() => {
        const found = document.querySelector(`[data-tour="${target}"]`);
        if (found) {
          observer!.disconnect();
          observer = null;
          attach(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      if (observer) observer.disconnect();
    };
  }, [target]);

  if (!rect) return null;

  const padding = 6;

  return createPortal(
    <div
      className="tour-spotlight-overlay"
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9997,
        transition: "all 300ms ease",
      }}
    >
      {/* Overlay using box-shadow to create the cutout */}
      <div
        style={{
          position: "fixed",
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
          borderRadius: 8,
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.25)",
          pointerEvents: "none",
          transition: "top 300ms ease, left 300ms ease, width 300ms ease, height 300ms ease",
        }}
      />
    </div>,
    document.body,
  );
}
