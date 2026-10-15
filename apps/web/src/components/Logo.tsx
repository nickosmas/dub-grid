import { useId, type CSSProperties } from "react";
import {
  BRAND_SYMBOL_INK,
  BRAND_WORDMARK_TRACKING_EM,
  brandSymbolGap,
  getBrandSymbolLockupLayout,
  getBrandSymbolPaths,
  getBrandSymbolStackedLayout,
} from "@dubgrid/design-tokens";

/** `theme` follows light and dark; `onBrand` sits on a brand-blue surface. */
export type BrandMarkTone = "theme" | "onBrand";

const TONES: Record<BrandMarkTone, { back: string; front: string }> = {
  theme: { back: "var(--dg-color-brand-mark-back)", front: "var(--dg-color-brand-mark-front)" },
  onBrand: {
    back: "var(--dg-color-brand-mark-on-brand-back)",
    front: "var(--dg-color-brand-mark-on-brand-front)",
  },
};

const VIEW_BOX = `0 0 ${BRAND_SYMBOL_INK.width} ${BRAND_SYMBOL_INK.height}`;
const ASPECT = BRAND_SYMBOL_INK.width / BRAND_SYMBOL_INK.height;
const MASK_REGION = {
  x: -10,
  y: -10,
  width: BRAND_SYMBOL_INK.width + 20,
  height: BRAND_SYMBOL_INK.height + 20,
};

function BrandSymbol({
  height,
  tone = "theme",
  color,
  style,
}: {
  height: number;
  tone?: BrandMarkTone;
  /** Draws both cards in this one color, with the wider one-color gap. */
  color?: string;
  style?: CSSProperties;
}) {
  // The gap is masked out of the back card rather than painted in a surface
  // color, so the mark sits cleanly on any background.
  const maskId = `dg-mark-${useId().replace(/[^\w-]/g, "")}`;
  const paths = getBrandSymbolPaths(brandSymbolGap(height, Boolean(color)));
  const fill = color ? { back: color, front: color } : TONES[tone];
  return (
    <svg
      width={height * ASPECT}
      height={height}
      viewBox={VIEW_BOX}
      fill="none"
      aria-hidden="true"
      style={style}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" {...MASK_REGION}>
        <rect {...MASK_REGION} fill="white" />
        <path d={paths.cut} fill="black" />
      </mask>
      <path d={paths.back} fill={fill.back} mask={`url(#${maskId})`} />
      <path d={paths.front} fill={fill.front} />
    </svg>
  );
}

/** The two-card symbol, `size` tall, so it fits a `size` square. */
export function DubGridLogo({
  size = 48,
  tone,
  color,
}: {
  size?: number;
  tone?: BrandMarkTone;
  /** One color for both cards. */
  color?: string;
}) {
  return <BrandSymbol height={size} tone={tone} color={color} />;
}

export function DubGridWordmark({
  fontSize = 26,
  color = "var(--color-text-primary)",
  className,
}: {
  fontSize?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontSize: `${fontSize}px`,
        fontWeight: 700,
        fontFamily: "'DM Sans', sans-serif",
        color,
        letterSpacing: `${BRAND_WORDMARK_TRACKING_EM}em`,
      }}
    >
      dubgrid
    </span>
  );
}

interface LockupProps {
  fontSize?: number;
  color?: string;
  markTone?: BrandMarkTone;
  /** One color for both cards. */
  markColor?: string;
}

/** Symbol and wordmark on one line, the symbol centered on the word's optical center. */
export function DubGridLockup({
  fontSize = 26,
  color = "var(--color-text-primary)",
  markTone,
  markColor,
}: LockupProps) {
  const layout = getBrandSymbolLockupLayout(fontSize);
  return (
    <span style={{ whiteSpace: "nowrap", lineHeight: 1 }}>
      <BrandSymbol
        height={layout.height}
        tone={markTone}
        color={markColor}
        style={{
          display: "inline-block",
          verticalAlign: -layout.belowBaseline,
          marginRight: layout.marginRight,
        }}
      />
      <DubGridWordmark fontSize={fontSize} color={color} />
    </span>
  );
}

/** Symbol centered above the wordmark, sized and spaced from `fontSize`. */
export function DubGridStackedLockup({
  fontSize = 26,
  color = "var(--color-text-primary)",
  markTone,
  markColor,
}: LockupProps) {
  const layout = getBrandSymbolStackedLayout(fontSize, 1);
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: layout.gap,
        lineHeight: 1,
      }}
    >
      <BrandSymbol
        height={layout.symbolHeight}
        tone={markTone}
        color={markColor}
        style={{ transform: `translateX(${layout.symbolOffsetX}px)` }}
      />
      <DubGridWordmark fontSize={fontSize} color={color} />
    </span>
  );
}
