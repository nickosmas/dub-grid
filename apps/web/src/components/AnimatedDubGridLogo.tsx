"use client";

import { useEffect, useState } from "react";
import {
  ANIMATED_LOGO_OPACITY_MAX,
  ANIMATED_LOGO_OPACITY_MIN,
  BRAND_ANIMATED_LOGO_SIZE,
  generateAnimatedLogoTimings,
  type AnimatedLogoTiming,
} from "@dubgrid/design-tokens";
import { DubGridLogo } from "./Logo";

/**
 * Animated dubgrid mark — every cell pulses on its own random [duration,
 * delay] pair so the grid feels alive AND looks different every mount.
 *
 * Timings are generated post-mount via useEffect so SSR + first client
 * render emit the same (static) HTML; once mounted, the random table is
 * applied and the animation begins. This avoids hydration mismatch and
 * keeps the static fallback visible to users with reduced-motion enabled.
 */
export function AnimatedDubGridLogo({
  size = BRAND_ANIMATED_LOGO_SIZE,
  color = "#2563EB",
}: {
  size?: number;
  color?: string;
}) {
  const [timings, setTimings] = useState<readonly AnimatedLogoTiming[] | null>(null);

  useEffect(() => {
    setTimings(generateAnimatedLogoTimings());
  }, []);

  if (!timings) {
    return <DubGridLogo size={size} color={color} />;
  }

  const cell = size / 4;
  const gap = cell * 0.1;
  const r = cell * 0.2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <style>{`
        @keyframes dg-cell-pulse {
          0%, 100% { opacity: ${ANIMATED_LOGO_OPACITY_MIN}; }
          50%      { opacity: ${ANIMATED_LOGO_OPACITY_MAX}; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dg-cell-pulse {
            animation: none !important;
            opacity: 1;
          }
        }
      `}</style>
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3].map((col) => {
          const [dur, del] = timings[row * 4 + col];
          return (
            <rect
              key={`${row}-${col}`}
              className="dg-cell-pulse"
              x={col * cell + gap}
              y={row * cell + gap}
              width={cell - gap * 2}
              height={cell - gap * 2}
              rx={r}
              fill={color}
              style={{
                animation: `dg-cell-pulse ${dur}s ease-in-out ${del}s infinite`,
              }}
            />
          );
        }),
      )}
    </svg>
  );
}
