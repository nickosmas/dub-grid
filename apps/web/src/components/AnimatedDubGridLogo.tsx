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
 * Animated dubgrid mark: each of the four cells pulses on its own random
 * [duration, delay] pair, so the mark feels alive and looks different every
 * mount. Reserved for route-level data loading; startup surfaces show the
 * static mark and put their motion in a progress indicator beside it.
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

  const gap = size * 0.045;
  const cell = (size - gap) / 2;
  const radius = cell * 0.2;
  const offset = cell + gap;
  const cells = [
    { x: 0, y: 0 },
    { x: offset, y: 0 },
    { x: 0, y: offset },
    { x: offset, y: offset },
  ];

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
      {cells.map((rect, index) => {
        const [duration, delay] = timings[index];
        return (
          <rect
            key={`${rect.x}-${rect.y}`}
            className="dg-cell-pulse"
            x={rect.x}
            y={rect.y}
            width={cell}
            height={cell}
            rx={radius}
            fill={color}
            style={{
              animation: `dg-cell-pulse ${duration}s ease-in-out ${delay}s infinite`,
            }}
          />
        );
      })}
    </svg>
  );
}
