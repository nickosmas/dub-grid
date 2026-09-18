/**
 * Shared grid logo renderer for all icon/OG image assets.
 * Uses Satori-compatible inline styles (no Tailwind, no CSS modules).
 */

export const COLORS = {
  light: "#2563EB",
} as const;

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

interface GridProps {
  size: number;
  color?: string;
}

export function LogoGrid({ size, color = COLORS.light }: GridProps) {
  const gap = size * 0.045;
  const cell = (size - gap) / 2;
  const radius = cell * 0.2;
  const offset = cell + gap;
  // The pinwheel: solid from top-right to bottom-left, tinted on the other
  // diagonal. Same geometry as `DubGridLogo`, expressed in the inline styles
  // Satori can read.
  const cells = [
    { x: 0, y: 0, opacity: 0.3 },
    { x: offset, y: 0, opacity: 1 },
    { x: 0, y: offset, opacity: 1 },
    { x: offset, y: offset, opacity: 0.3 },
  ];

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        position: "relative",
        background: "transparent",
      }}
    >
      {cells.map((rect) => (
        <div
          key={`${rect.x}-${rect.y}`}
          style={{
            position: "absolute",
            left: rect.x,
            top: rect.y,
            width: cell,
            height: cell,
            borderRadius: radius,
            background: color,
            opacity: rect.opacity,
          }}
        />
      ))}
    </div>
  );
}
