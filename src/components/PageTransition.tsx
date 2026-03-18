"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import ProgressBar from "./ProgressBar";

interface PageTransitionContextType {
  /** Call before navigating — snapshots current page DOM. */
  startNavigation: () => void;
  /** Call when the new page's data is loaded and ready to display. */
  setPageReady: () => void;
}

const PageTransitionContext = createContext<PageTransitionContextType>({
  startNavigation: () => {},
  setPageReady: () => {},
});

export function usePageTransition() {
  return useContext(PageTransitionContext);
}

/**
 * Wraps page content and provides a GitHub-style page transition:
 *
 * 1. User clicks a nav link → `startNavigation()` clones the current DOM
 * 2. The cloned snapshot stays visible while the new page loads hidden
 * 3. New page calls `setPageReady()` → snapshot is removed, real content shown
 *
 * An 8-second safety timeout prevents infinite transition states.
 */
export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [transitioning, setTransitioning] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<HTMLDivElement>(null);

  const startNavigation = useCallback(() => {
    if (!contentRef.current || !snapshotRef.current) return;

    // Clone the current page DOM as a static visual snapshot
    snapshotRef.current.innerHTML = "";
    const clone = contentRef.current.cloneNode(true) as HTMLElement;
    clone.removeAttribute("style"); // Remove hiding styles from the clone
    snapshotRef.current.appendChild(clone);
    setTransitioning(true);
  }, []);

  const setPageReady = useCallback(() => {
    if (snapshotRef.current) snapshotRef.current.innerHTML = "";
    setTransitioning(false);
  }, []);

  // Safety timeout: auto-complete transition after 8s
  useEffect(() => {
    if (!transitioning) return;
    const timer = setTimeout(() => {
      if (snapshotRef.current) snapshotRef.current.innerHTML = "";
      setTransitioning(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [transitioning]);

  // If pathname changes without startNavigation (e.g. browser back/forward),
  // clear any stale transition state.
  // ALSO: If a navigation was started but the pathname remains the same (e.g. redirect back),
  // clear the transition after a short grace period so the UI doesn't stay hidden.
  useEffect(() => {
    if (!transitioning) return;

    const checkTimer = setTimeout(() => {
      // If we're still transitioning after 2s, and it's because setPageReady was never called
      // (likely due to a redirect back to the same page), force clear it.
      setTransitioning(false);
      if (snapshotRef.current) snapshotRef.current.innerHTML = "";
    }, 2000);

    return () => clearTimeout(checkTimer);
  }, [transitioning, pathname]);

  return (
    <PageTransitionContext.Provider value={{ startNavigation, setPageReady }}>
      <ProgressBar loading={transitioning} />

      {/* Static DOM snapshot — visible only during transition */}
      <div ref={snapshotRef} />

      {/* Real page content — hidden off-screen during transition so hooks run */}
      <div
        ref={contentRef}
        style={
          transitioning
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0,
                pointerEvents: "none",
                zIndex: -1,
                overflow: "hidden",
              }
            : undefined
        }
      >
        {children}
      </div>
    </PageTransitionContext.Provider>
  );
}
