"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import {
  BRAND_ANIMATED_LOGO_SIZE,
  BRAND_MARK_BACK_STROKE,
  BRAND_MARK_GAP,
  BRAND_MARK_INK,
  BRAND_MOTION_ASPECT,
  brandMarkCardPath,
  brandMotionFrames,
  brandRestFrame,
  type BrandAnimation,
  type BrandMotionCard,
  type BrandMotionFrame,
} from "@dubgrid/design-tokens";

const VIEW_BOX = `${BRAND_MARK_INK.x} ${BRAND_MARK_INK.y} ${BRAND_MARK_INK.width} ${BRAND_MARK_INK.height}`;
const ASPECT = BRAND_MARK_INK.height / BRAND_MARK_INK.width;
const REST = brandRestFrame();

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    // Test environments may stub matchMedia without a result.
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Loops `animation` from mount; reduced motion and the server render rest. */
function useBrandAnimation(animation: BrandAnimation): BrandMotionFrame {
  const reduced = usePrefersReducedMotion();
  const [frame, setFrame] = useState<BrandMotionFrame>(REST);

  useEffect(() => {
    if (reduced) {
      setFrame(REST);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setFrame(brandMotionFrames[animation]((now - start) / 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animation, reduced]);

  return reduced ? REST : frame;
}

function cardPath(card: BrandMotionCard): string {
  const width = card.width * card.scale;
  const height = width * BRAND_MOTION_ASPECT;
  return brandMarkCardPath({
    x: card.cx - width / 2,
    y: card.cy - height / 2,
    width,
    height,
    radius: card.radius * card.scale,
  });
}

/**
 * Draws a frame back to front. Each card with any solid weight cuts its gap
 * out of the cards below it with a mask, as the static mark does, so the gap
 * stays transparent on any surface.
 */
function BrandFrame({
  frame,
  width,
  color,
}: {
  frame: BrandMotionFrame;
  width: number;
  color: string;
}) {
  const id = useId().replace(/[^\w-]/g, "");
  let drawn: ReactNode = null;
  const masks: ReactNode[] = [];

  frame.forEach((card, index) => {
    const d = cardPath(card);
    if (drawn && card.solid > 0.02 && card.opacity > 0.003) {
      const maskId = `dg-motion-${id}-${index}`;
      masks.push(
        <mask
          key={maskId}
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="-60"
          y="-60"
          width="220"
          height="220"
        >
          <rect x="-60" y="-60" width="220" height="220" fill="white" />
          <path
            d={d}
            fill="none"
            stroke="black"
            strokeOpacity={card.opacity}
            strokeWidth={BRAND_MARK_GAP * 2 * card.solid}
            strokeLinejoin="round"
          />
        </mask>,
      );
      drawn = <g mask={`url(#${maskId})`}>{drawn}</g>;
    }
    const trace = card.trace
      ? {
          pathLength: 1,
          strokeDasharray: `${card.trace.length} 1`,
          strokeDashoffset: -card.trace.offset,
        }
      : {};
    drawn = (
      <>
        {drawn}
        <path
          d={d}
          fill={color}
          fillOpacity={card.solid}
          stroke={color}
          strokeWidth={BRAND_MARK_BACK_STROKE * (1 - card.solid)}
          opacity={card.opacity}
          {...trace}
        />
      </>
    );
  });

  return (
    <svg
      width={width}
      height={width * ASPECT}
      viewBox={VIEW_BOX}
      fill="none"
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <defs>{masks}</defs>
      {drawn}
    </svg>
  );
}

/**
 * The full-screen loading mark, looping `animation`. The logo is static
 * everywhere else; only waits with nothing else on screen animate it.
 */
export function AnimatedDubGridLogo({
  animation = "breathe",
  size = BRAND_ANIMATED_LOGO_SIZE,
  color = "var(--dg-color-brand-mark)",
}: {
  animation?: BrandAnimation;
  size?: number;
  color?: string;
}) {
  const frame = useBrandAnimation(animation);
  return <BrandFrame frame={frame} width={size} color={color} />;
}
