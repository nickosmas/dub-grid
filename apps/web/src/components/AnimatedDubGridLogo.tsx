"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  BRAND_ANIMATED_LOGO_SIZE,
  BRAND_SYMBOL_INK,
  BRAND_SYMBOL_SQUARE,
  brandMotionFrames,
  brandRestFrame,
  brandSettlingFrame,
  brandSymbolCardPath,
  brandSymbolGap,
  type BrandAnimation,
  type BrandMotionCard,
  type BrandMotionFrame,
} from "@dubgrid/design-tokens";

const { x, y, size: SIDE } = BRAND_SYMBOL_SQUARE;
const VIEW_BOX = `${x} ${y} ${SIDE} ${SIDE}`;
// Moving cards can pass the square's edge; the mask region leaves them room.
const MASK_REGION = { x: x - SIDE / 2, y: y - SIDE / 2, width: SIDE * 2, height: SIDE * 2 };
const REST = brandRestFrame();
const SIDE_COLOR = "var(--dg-color-brand-mark-side)";
const CENTER_COLOR = "var(--dg-color-brand-mark-center)";

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

/**
 * Loops `animation` from mount; reduced motion and the server render rest.
 * Once `settling` turns true, Shuffle and Climb finish the move in progress,
 * rest, and call `onSettled`; Breathe rests at once.
 */
function useBrandAnimation(
  animation: BrandAnimation,
  settling: boolean,
  onSettled?: () => void,
): BrandMotionFrame {
  const reduced = usePrefersReducedMotion();
  const [frame, setFrame] = useState<BrandMotionFrame>(REST);
  const start = useRef<number | null>(null);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (reduced || (settling && animation === "breathe")) {
      setFrame(REST);
      if (settling) settled.current?.();
      return;
    }
    let raf = 0;
    start.current ??= performance.now();
    const began = start.current;
    const stoppedAt = settling ? (performance.now() - began) / 1000 : null;
    const tick = (now: number) => {
      const t = (now - began) / 1000;
      if (stoppedAt === null || animation === "breathe") {
        setFrame(brandMotionFrames[animation](t));
      } else {
        const { frame: next, done } = brandSettlingFrame(animation, t, stoppedAt);
        setFrame(next);
        if (done) {
          settled.current?.();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animation, reduced, settling]);

  return reduced ? REST : frame;
}

const fill = (color: number) => {
  if (color <= 0.002) return SIDE_COLOR;
  if (color >= 0.998) return CENTER_COLOR;
  return `color-mix(in srgb, ${CENTER_COLOR} ${(color * 100).toFixed(1)}%, ${SIDE_COLOR})`;
};

const cardPath = (card: BrandMotionCard, grow = 0) =>
  brandSymbolCardPath({ cx: card.cx, cy: card.cy, scale: card.scale, grow });

/**
 * Draws a frame back to front. Each card is masked by the cards in front of
 * it grown by the gap, as the static mark is, so the gap stays transparent on
 * any surface.
 */
function BrandFrame({ frame, size }: { frame: BrandMotionFrame; size: number }) {
  const id = useId().replace(/[^\w-]/g, "");
  const gap = brandSymbolGap((size * BRAND_SYMBOL_INK.height) / SIDE) * frame.gap;
  const visible = frame.cards.filter((card) => card.opacity >= 0.01);
  const masks: ReactNode[] = [];
  const cards = visible.map((card, index) => {
    const ahead = visible.slice(index + 1);
    let mask: string | undefined;
    if (ahead.length) {
      const maskId = `dg-motion-${id}-${index}`;
      masks.push(
        <mask key={maskId} id={maskId} maskUnits="userSpaceOnUse" {...MASK_REGION}>
          <rect {...MASK_REGION} fill="white" />
          {ahead.map((cutter, k) => (
            <path key={k} d={cardPath(cutter, gap)} fill="black" fillOpacity={cutter.opacity} />
          ))}
        </mask>,
      );
      mask = `url(#${maskId})`;
    }
    return (
      <path
        key={index}
        d={cardPath(card)}
        fill={fill(card.color)}
        opacity={card.opacity}
        mask={mask}
      />
    );
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      fill="none"
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <defs>{masks}</defs>
      {cards}
    </svg>
  );
}

/**
 * The full-screen loading mark, looping `animation` in a `size` square. The
 * logo is static everywhere else; only waits with nothing else on screen
 * animate it.
 */
export function AnimatedDubGridLogo({
  animation = "breathe",
  size = BRAND_ANIMATED_LOGO_SIZE,
  settling = false,
  onSettled,
}: {
  animation?: BrandAnimation;
  size?: number;
  /** The wait is over: finish the current move and rest. */
  settling?: boolean;
  onSettled?: () => void;
}) {
  const frame = useBrandAnimation(animation, settling, onSettled);
  return <BrandFrame frame={frame} size={size} />;
}
