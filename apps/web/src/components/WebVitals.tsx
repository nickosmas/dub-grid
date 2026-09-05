"use client";

import { useReportWebVitals } from "next/web-vitals";

const PERF_TIMING =
  process.env.NEXT_PUBLIC_PERF_TIMING === "1" || process.env.NODE_ENV === "development";

/**
 * Perf-baseline Web Vitals capture (LCP / INP / TTFB / CLS / FCP).
 * Logs to the console under NEXT_PUBLIC_PERF_TIMING (always on in dev) so we
 * can baseline /login, /dashboard, and INP on the schedule grid before
 * optimizing. Renders nothing. Replace the sink with a consent-gated
 * analytics call if we want field data later.
 */
export default function WebVitals() {
  useReportWebVitals((metric) => {
    if (!PERF_TIMING) return;
    console.debug(
      `%c[web-vitals] ${metric.name}`,
      "color:#30d158",
      `${Math.round(metric.value)}${metric.name === "CLS" ? "" : "ms"}`,
      { rating: metric.rating, path: window.location.pathname },
    );
  });
  return null;
}
