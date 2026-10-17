/**
 * Shared logo renderer for the OG and Twitter images.
 * Uses Satori-compatible inline styles (no Tailwind, no CSS modules).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BRAND_SYMBOL_COLORS,
  BRAND_SYMBOL_INK,
  brandSymbolGap,
  getBrandSymbolPaths,
} from "@dubgrid/design-tokens";

// DM Sans (woff: Satori can't read woff2) for the OG/Twitter wordmark, so the
// social cards render it in the brand font instead of a fallback. Bundled
// rather than fetched: a CDN timeout while prerendering these images used to
// fail the whole build. See assets/fonts/README.md.
const DM_SANS_FILES = {
  400: "dm-sans-latin-400-normal.woff",
  700: "dm-sans-latin-700-normal.woff",
} as const;

let dmSansFontsPromise: Promise<
  { name: "DM Sans"; data: Buffer; weight: 400 | 700; style: "normal" }[]
> | null = null;

export function loadDmSansFonts() {
  if (!dmSansFontsPromise) {
    dmSansFontsPromise = Promise.all(
      ([400, 700] as const).map(async (weight) => ({
        name: "DM Sans" as const,
        data: await readFile(join(process.cwd(), "assets", "fonts", DM_SANS_FILES[weight])),
        weight,
        style: "normal" as const,
      })),
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
