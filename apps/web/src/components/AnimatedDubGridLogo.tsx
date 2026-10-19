"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
 * Loops `animation` from mount, handing each frame to `draw`; reduced motion
 * rests. Once `settling` turns true, Shuffle and Climb finish the move in
 * progress, rest, and call `onSettled`; Breathe rests at once.
 *
 * Frames go straight to `draw` rather than through React state. A state update
 * every frame re-rendered on every frame for as long as a page was loading,
 * and each of those updates outranks the render that reveals the page.
 */
function useBrandAnimation(
  animation: BrandAnimation,
  settling: boolean,
  onSettled: (() => void) | undefined,
  draw: (frame: BrandMotionFrame) => void,
): void {
  const reduced = usePrefersReducedMotion();
  const start = useRef<number | null>(null);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (reduced || (settling && animation === "breathe")) {
      draw(REST);
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
        draw(brandMotionFrames[animation](t));
      } else {
        const { frame: next, done } = brandSettlingFrame(animation, t, stoppedAt);
        draw(next);
        if (done) {
          settled.current?.();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animation, reduced, settling, draw]);
}

const fill = (color: number) => {
  if (color <= 0.002) return SIDE_COLOR;
  if (color >= 0.998) return CENTER_COLOR;
  return `color-mix(in srgb, ${CENTER_COLOR} ${(color * 100).toFixed(1)}%, ${SIDE_COLOR})`;
};

const cardPath = (card: BrandMotionCard, grow = 0) =>
  brandSymbolCardPath({ cx: card.cx, cy: card.cy, scale: card.scale, grow });

const attributes = (values: Record<string, string | number | undefined>) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");

/**
 * The SVG for one frame, drawn back to front. Each card is masked by the cards
 * in front of it grown by the gap, as the static mark is, so the gap stays
 * transparent on any surface. Every value is a number or one of the constants
 * above, so nothing in it needs escaping.
 */
export function brandFrameMarkup(frame: BrandMotionFrame, size: number, id: string): string {
  const gap = brandSymbolGap((size * BRAND_SYMBOL_INK.height) / SIDE) * frame.gap;
  const visible = frame.cards.filter((card) => card.opacity >= 0.01);
  const region = attributes(MASK_REGION);
  let masks = "";
  let cards = "";
  visible.forEach((card, index) => {
    const ahead = visible.slice(index + 1);
    let mask: string | undefined;
    if (ahead.length) {
      const maskId = `dg-motion-${id}-${index}`;
      const cutters = ahead
        .map(
          (cutter) =>
            `<path${attributes({ d: cardPath(cutter, gap), fill: "black", "fill-opacity": cutter.opacity })}/>`,
        )
        .join("");
      masks += `<mask${attributes({ id: maskId, maskUnits: "userSpaceOnUse" })}${region}><rect${region} fill="white"/>${cutters}</mask>`;
      mask = `url(#${maskId})`;
    }
    cards += `<path${attributes({ d: cardPath(card), fill: fill(card.color), opacity: card.opacity, mask })}/>`;
  });
  const svg = attributes({
    width: size,
    height: size,
    viewBox: VIEW_BOX,
    fill: "none",
    "aria-hidden": "true",
    style: "overflow: visible",
  });
  return `<svg${svg}><defs>${masks}</defs>${cards}</svg>`;
}

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
  const id = useId().replace(/[^\w-]/g, "");
  const host = useRef<HTMLSpanElement>(null);
  // React renders the resting mark once, on the server too; frames after it
  // are written into the host directly, which React leaves alone because this
  // markup does not change.
  const restMarkup = useMemo(() => brandFrameMarkup(REST, size, id), [size, id]);
  const draw = useCallback(
    (frame: BrandMotionFrame) => {
      if (host.current) host.current.innerHTML = brandFrameMarkup(frame, size, id);
    },
    [size, id],
  );
  useBrandAnimation(animation, settling, onSettled, draw);
  return (
    <span
      ref={host}
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: restMarkup }}
    />
  );
}
