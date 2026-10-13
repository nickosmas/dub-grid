import { useId, type CSSProperties } from "react";
import {
  BRAND_MARK_BACK,
  BRAND_MARK_BACK_STROKE,
  BRAND_MARK_FRONT,
  BRAND_MARK_GAP,
  BRAND_MARK_INK,
  BRAND_WORDMARK_TRACKING_EM,
  brandMarkCardPath,
  getBrandLockupSymbolLayout,
  getBrandStackedLayout,
} from "@dubgrid/design-tokens";

const BACK_PATH = brandMarkCardPath(BRAND_MARK_BACK);
const FRONT_PATH = brandMarkCardPath(BRAND_MARK_FRONT);
const VIEW_BOX = `${BRAND_MARK_INK.x} ${BRAND_MARK_INK.y} ${BRAND_MARK_INK.width} ${BRAND_MARK_INK.height}`;
const ASPECT = BRAND_MARK_INK.height / BRAND_MARK_INK.width;

function BrandSymbol({
  width,
  color,
  style,
}: {
  width: number;
  color: string;
  style?: CSSProperties;
}) {
  // The gap is masked out of the back card rather than painted in a surface
  // color, so the mark sits cleanly on any background.
  const maskId = `dg-mark-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg
      width={width}
      height={width * ASPECT}
      viewBox={VIEW_BOX}
      fill="none"
      aria-hidden="true"
      style={style}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
        <rect x="-10" y="-10" width="120" height="120" fill="white" />
        <path d={FRONT_PATH} fill="black" stroke="black" strokeWidth={BRAND_MARK_GAP * 2} />
      </mask>
      <path
        d={BACK_PATH}
        stroke={color}
        strokeWidth={BRAND_MARK_BACK_STROKE}
        mask={`url(#${maskId})`}
      />
      <path d={FRONT_PATH} fill={color} />
    </svg>
  );
}

/** The two-card symbol, `size` wide. */
export function DubGridLogo({
  size = 48,
  color = "var(--dg-color-brand-mark)",
}: {
  size?: number;
  color?: string;
}) {
  return <BrandSymbol width={size} color={color} />;
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

/** Symbol and wordmark on one line, the symbol centered on the word's optical center. */
export function DubGridLockup({
  fontSize = 26,
  color = "var(--color-text-primary)",
  markColor = "var(--dg-color-brand-mark)",
}: {
  fontSize?: number;
  color?: string;
  markColor?: string;
}) {
  const layout = getBrandLockupSymbolLayout(fontSize);
  return (
    <span style={{ whiteSpace: "nowrap", lineHeight: 1 }}>
      <BrandSymbol
        width={layout.width}
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
  markColor = "var(--dg-color-brand-mark)",
}: {
  fontSize?: number;
  color?: string;
  markColor?: string;
}) {
  const layout = getBrandStackedLayout(fontSize, 1);
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
        width={layout.symbolWidth}
        color={markColor}
        style={{ transform: `translateX(${layout.symbolOffsetX}px)` }}
      />
      <DubGridWordmark fontSize={fontSize} color={color} />
    </span>
  );
}
