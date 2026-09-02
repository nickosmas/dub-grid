"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";

const OVERFLOW_TOLERANCE = 2;
const CUE_SIZE = 48;
const CUE_EDGE_INSET = 12;

function canScrollVertically(element: HTMLElement) {
  const overflowY = window.getComputedStyle(element).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

function hasMoreBelow(element: HTMLElement) {
  return element.scrollHeight - element.clientHeight - element.scrollTop > OVERFLOW_TOLERANCE;
}

function findScrollableTarget(root: HTMLElement) {
  const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].filter(
    (element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        canScrollVertically(element) &&
        element.scrollHeight - element.clientHeight > OVERFLOW_TOLERANCE
      );
    },
  );

  return (
    candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    })[0] ?? null
  );
}

/**
 * A quiet, shared cue for content overlays. Mount it as a direct child of the
 * modal, sheet, panel, or popover whose scrollable descendant it should watch.
 */
export function ScrollOverflowCue({ documentViewport = false }: { documentViewport?: boolean }) {
  const markerRef = React.useRef<HTMLSpanElement>(null);
  const targetRef = React.useRef<HTMLElement | null>(null);
  const [cueBottom, setCueBottom] = React.useState<number | null>(null);

  const measure = React.useCallback(() => {
    const root = markerRef.current?.parentElement;
    if (!root) return;

    if (documentViewport) {
      const target = document.scrollingElement as HTMLElement | null;
      targetRef.current = target;
      const hasDocumentContentBelow =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY >
        OVERFLOW_TOLERANCE;
      setCueBottom(target && hasDocumentContentBelow ? 20 : null);
      return;
    }

    const currentTarget = targetRef.current;
    const target =
      currentTarget &&
      root.contains(currentTarget) &&
      canScrollVertically(currentTarget) &&
      currentTarget.scrollHeight - currentTarget.clientHeight > OVERFLOW_TOLERANCE
        ? currentTarget
        : findScrollableTarget(root);
    targetRef.current = target;

    if (!target || !hasMoreBelow(target)) {
      setCueBottom(null);
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const bottom = Math.min(
      Math.max(rootRect.bottom - targetRect.bottom + CUE_EDGE_INSET, CUE_EDGE_INSET),
      rootRect.height - CUE_SIZE - CUE_EDGE_INSET,
    );

    setCueBottom((current) =>
      current != null && Math.abs(current - bottom) < 0.5 ? current : bottom,
    );
  }, [documentViewport]);

  React.useLayoutEffect(() => {
    const root = markerRef.current?.parentElement;
    if (!root) return;

    let frame = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const observationRoot = documentViewport ? document.body : root;
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    const mutationObserver = new MutationObserver(() => {
      resizeObserver?.disconnect();
      resizeObserver?.observe(observationRoot);
      if (!documentViewport) {
        for (const element of observationRoot.querySelectorAll<HTMLElement>("*")) {
          if (canScrollVertically(element)) resizeObserver?.observe(element);
        }
      }
      scheduleMeasure();
    });

    resizeObserver?.observe(observationRoot);
    if (!documentViewport) {
      for (const element of observationRoot.querySelectorAll<HTMLElement>("*")) {
        if (canScrollVertically(element)) resizeObserver?.observe(element);
      }
    }
    mutationObserver.observe(observationRoot, { childList: true, subtree: true });
    root.addEventListener("scroll", scheduleMeasure, true);
    if (documentViewport) window.addEventListener("scroll", scheduleMeasure);
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      root.removeEventListener("scroll", scheduleMeasure, true);
      if (documentViewport) window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [documentViewport, measure]);

  const scrollDown = React.useCallback(() => {
    const target = targetRef.current;
    if (!target) return;

    const scrollOptions: ScrollToOptions = {
      top: Math.max((documentViewport ? window.innerHeight : target.clientHeight) * 0.72, 160),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    };
    if (documentViewport) window.scrollBy(scrollOptions);
    else target.scrollBy(scrollOptions);
  }, [documentViewport]);

  return (
    <>
      <span ref={markerRef} className="dg-scroll-overflow-marker" aria-hidden="true" />
      {cueBottom != null ? (
        <button
          type="button"
          className={`dg-scroll-overflow-cue${documentViewport ? " dg-scroll-overflow-cue--viewport" : ""}`}
          style={documentViewport ? undefined : { bottom: cueBottom }}
          onClick={scrollDown}
          aria-label="Scroll down for more content"
        >
          <ArrowDown aria-hidden="true" size={24} strokeWidth={2.25} />
        </button>
      ) : null}
    </>
  );
}
