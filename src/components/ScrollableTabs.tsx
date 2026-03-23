"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface ScrollableTabsProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function ScrollableTabs({ children, className, style }: ScrollableTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(checkScroll);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro?.disconnect();
    };
  }, [checkScroll]);

  // Re-check when children change (e.g. dynamic tab list)
  useEffect(() => {
    checkScroll();
  }, [children, checkScroll]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -150 : 150, behavior: "smooth" });
  };

  return (
    <div className={`dg-scrollable-tabs${className ? ` ${className}` : ""}`} style={style}>
      {/* Left fade + chevron */}
      <div
        className={`dg-scroll-fade dg-scroll-fade--left${canScrollLeft ? " visible" : ""}`}
        aria-hidden={!canScrollLeft}
      >
        <button
          type="button"
          className="dg-scroll-chevron"
          onClick={() => scroll("left")}
          tabIndex={canScrollLeft ? 0 : -1}
          aria-label="Scroll left"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
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
        <button
          type="button"
          className="dg-scroll-chevron"
          onClick={() => scroll("right")}
          tabIndex={canScrollRight ? 0 : -1}
          aria-label="Scroll right"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
