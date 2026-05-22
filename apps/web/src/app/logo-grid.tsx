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
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let opacity = 0.3;
      if (row === 0 || col === 0) opacity = 1;
      else if (row + col <= 4) opacity = 0.75;
      cells.push({ row, col, opacity });
    }
  }

  const cell = size / 4;
  const gap = cell * 0.10;
  const r = cell * 0.20;

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
      {cells.map(({ row, col, opacity }) => (
        <div
          key={`${row}-${col}`}
          style={{
            position: "absolute",
            left: col * cell + gap,
            top: row * cell + gap,
            width: cell - gap * 2,
            height: cell - gap * 2,
            borderRadius: r,
            background: color,
            opacity,
          }}
        />
      ))}
    </div>
  );
}
