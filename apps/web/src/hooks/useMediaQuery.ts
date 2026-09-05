import { useState, useEffect } from "react";

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

/**
 * Returns true when the given media query matches.
 * Falls back to false during SSR.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
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
