"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/Button";

interface ScrollableTabsProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Show at most this many items; the rest scroll into view. */
  maxVisibleItems?: number;
  /** And never wider than this, in pixels, for long item names. */
  maxVisibleWidth?: number;
  /**
   * Never wider than every item, and shrink to the cap above, scrolling the
   * rest, only when the row is short of room.
   */
  growToFit?: boolean;
  "data-tour"?: string;
}

export default function ScrollableTabs({
  children,
  className,
  style,
  maxVisibleItems,
  maxVisibleWidth,
  growToFit = false,
  "data-tour": dataTour,
}: ScrollableTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [capWidth, setCapWidth] = useState<number | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);

  const frameRef = useRef<number | null>(null);

  // Reading the scroll geometry forces a layout, and the schedule toolbar
  // re-renders this on every grid update, which laid out the whole page each
  // time. Checks requested within one frame collapse into a single read.
  const checkScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    });
  }, []);

  // Where the last item allowed in view ends, plus the track's own inset.
  // Measured before paint, so a long list never flashes at full width.
  const measureCap = useCallback(() => {
    const el = scrollRef.current;
    if (el) setNaturalWidth(el.scrollWidth);
    if (!el || (!maxVisibleItems && !maxVisibleWidth)) {
      setCapWidth(null);
      return;
    }
    const last =
      maxVisibleItems && el.children.length > maxVisibleItems
        ? (el.children[maxVisibleItems - 1] as HTMLElement)
        : null;
    const byCount = last
      ? last.offsetLeft + last.offsetWidth + parseFloat(getComputedStyle(el).paddingRight || "0")
      : el.scrollWidth;
    const cap = Math.ceil(maxVisibleWidth ? Math.min(byCount, maxVisibleWidth) : byCount);
    setCapWidth(cap < el.scrollWidth ? cap : null);
  }, [maxVisibleItems, maxVisibleWidth]);

  useLayoutEffect(() => {
    measureCap();
  }, [children, measureCap]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        checkScroll();
        measureCap();
      });
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro?.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [checkScroll, measureCap]);

  // Re-check when children change (e.g. dynamic tab list)
  useEffect(() => {
    checkScroll();
  }, [children, checkScroll]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -150 : 150, behavior: "smooth" });
  };

  // Growing, the tabs size from their measured width: containment keeps the
  // long list out of the row's own minimum, so a row shrinks them to the cap
  // before it wraps, instead of wrapping as soon as every item doesn't fit.
  // The caller's style still wins, and can read the width as
  // `--dg-tabs-natural`.
  const sizing: React.CSSProperties | undefined =
    growToFit && naturalWidth != null
      ? ({
          "--dg-tabs-natural": `${naturalWidth}px`,
          flex: `0 1 ${naturalWidth}px`,
          minWidth: capWidth ?? naturalWidth,
          maxWidth: "100%",
          contain: "inline-size",
        } as React.CSSProperties)
      : capWidth != null
        ? // A plain length, not min(…, 100%): a percentage limit is ignored when
          // the row around it sizes itself, which then saves room for every item.
          { maxWidth: capWidth }
        : undefined;
  const rootStyle = sizing
    ? growToFit
      ? { ...sizing, ...style }
      : { ...style, ...sizing }
    : style;

  return (
    <div
      className={`dg-scrollable-tabs${className ? ` ${className}` : ""}`}
      style={rootStyle}
      data-capped={capWidth != null ? "" : undefined}
      data-tour={dataTour}
    >
      {/* Left fade + chevron */}
      <div
        className={`dg-scroll-fade dg-scroll-fade--left${canScrollLeft ? " visible" : ""}`}
        aria-hidden={!canScrollLeft}
      >
        <Button
          type="button"
          className="dg-scroll-chevron"
          onClick={() => scroll("left")}
          tabIndex={canScrollLeft ? 0 : -1}
          aria-label="Scroll left"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </Button>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="dg-scroll-inner">
        {children}
      </div>

      {/* Right fade + chevron */}
      <div
        className={`dg-scroll-fade dg-scroll-fade--right${canScrollRight ? " visible" : ""}`}
        aria-hidden={!canScrollRight}
      >
        <Button
          type="button"
          className="dg-scroll-chevron"
          onClick={() => scroll("right")}
          tabIndex={canScrollRight ? 0 : -1}
          aria-label="Scroll right"
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  );
}
