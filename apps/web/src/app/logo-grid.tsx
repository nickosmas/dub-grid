/**
 * Shared logo renderer for the OG and Twitter images.
 * Uses Satori-compatible inline styles (no Tailwind, no CSS modules).
 */
import {
  BRAND_MARK_BACK,
  BRAND_MARK_BACK_STROKE,
  BRAND_MARK_COLORS,
  BRAND_MARK_FRONT,
  BRAND_MARK_GAP,
  BRAND_MARK_INK,
  brandMarkCardPath,
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

const BACK_PATH = brandMarkCardPath(BRAND_MARK_BACK);
const FRONT_PATH = brandMarkCardPath(BRAND_MARK_FRONT);

interface MarkProps {
  width: number;
  /** The surface behind the mark, which the gap around the front card takes. */
  background: string;
  color?: string;
}

/** The two-card symbol, cropped to its ink, `width` wide. */
export function LogoMark({ width, background, color = BRAND_MARK_COLORS.light }: MarkProps) {
  const { x, y, width: w, height: h } = BRAND_MARK_INK;
  return (
    <svg width={width} height={(width * h) / w} viewBox={`${x} ${y} ${w} ${h}`}>
      <path d={BACK_PATH} fill="none" stroke={color} strokeWidth={BRAND_MARK_BACK_STROKE} />
      <path
        d={FRONT_PATH}
        fill={background}
        stroke={background}
        strokeWidth={BRAND_MARK_GAP * 2}
        strokeLinejoin="round"
      />
      <path d={FRONT_PATH} fill={color} />
    </svg>
  );
}
