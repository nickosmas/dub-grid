/**
 * Shared logo renderer for the OG and Twitter images.
 * Uses Satori-compatible inline styles (no Tailwind, no CSS modules).
 */
import {
  BRAND_SYMBOL_COLORS,
  BRAND_SYMBOL_INK,
  brandSymbolGap,
  getBrandSymbolPaths,
} from "@dubgrid/design-tokens";

// DM Sans (ttf — Satori can't read woff2) for the OG/Twitter wordmark, so the
// social cards render the wordmark in the brand font instead of a fallback.
const DM_SANS_TTF = {
  400: "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-400-normal.ttf",
  700: "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-700-normal.ttf",
} as const;

let dmSansFontsPromise: Promise<
  { name: "DM Sans"; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]
> | null = null;

export function loadDmSansFonts() {
  if (!dmSansFontsPromise) {
    dmSansFontsPromise = Promise.all(
      ([400, 700] as const).map(async (weight) => {
        const res = await fetch(DM_SANS_TTF[weight]);
        if (!res.ok) throw new Error(`DM Sans ${weight} fetch failed: ${res.status}`);
        return {
          name: "DM Sans" as const,
          data: await res.arrayBuffer(),
          weight,
          style: "normal" as const,
        };
      }),
    );
  }
  return dmSansFontsPromise;
}

interface MarkProps {
  height: number;
  /** The surface behind the mark, which the gaps between the cards take. */
  background: string;
}

/** The three-card symbol, cropped to its ink, `height` tall. */
export function LogoMark({ height, background }: MarkProps) {
  const { width: w, height: h } = BRAND_SYMBOL_INK;
  const [back, ...ahead] = getBrandSymbolPaths(brandSymbolGap(height));
  const colors = BRAND_SYMBOL_COLORS.light;
  // Satori draws masks unreliably, so each gap is painted in the known surface
  // color just before the card it surrounds. The back card's cuts are those
  // grown outlines, front to back in its list.
  return (
    <svg width={(height * w) / h} height={height} viewBox={`0 0 ${w} ${h}`}>
      <path d={back.path} fill={colors[back.tone]} />
      {ahead.map((card, k) => [
        <path key={`gap-${k}`} d={back.cut[k]} fill={background} />,
        <path key={`card-${k}`} d={card.path} fill={colors[card.tone]} />,
      ])}
    </svg>
  );
}
