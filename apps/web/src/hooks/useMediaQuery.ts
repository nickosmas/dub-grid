import { useState, useEffect, useLayoutEffect } from "react";

// useLayoutEffect runs synchronously before the browser paints, so the
// corrected match lands before the client's first paint instead of one
// frame after — avoiding a visible flash of the wrong layout. On the
// server it falls back to useEffect (a no-op during SSR) so React doesn't
// warn that useLayoutEffect does nothing there.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Breakpoint constants
export const MOBILE = "(max-width: 767px)";
export const TABLET = "(min-width: 768px) and (max-width: 1024px)";
export const SMALL_DESKTOP = "(min-width: 768px) and (max-width: 1280px)";
// Everything below a wide desktop shows one week. This has to include phones:
// the mobile grid renders 7 columns regardless, so leaving them in 2-week span
// meant the publish window covered a week the user was never shown and the
// pay-period snap swallowed every "next period" tap.
export const AUTO_ONE_WEEK = "(max-width: 1200px)";
export const DESKTOP = "(min-width: 1025px)";
// The org nav (logo, org name, tab links, trial badge, bell, account menu)
// doesn't shrink on its own between the tablet breakpoint and a full-width
// desktop, so anything wider than tablet but no wider than this can still
// overflow — most visibly at 125%+ browser zoom on an otherwise ordinary
// desktop width.
export const HEADER_NARROW = "(max-width: 1200px)";

/**
 * Returns true when the given media query matches.
 * Falls back to false during SSR.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    function onChange(e: MediaQueryListEvent) {
      setMatches(e.matches);
    }

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
