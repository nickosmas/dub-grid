/**
 * Shared grid logo renderer for all icon/OG image assets.
 * Uses Satori-compatible inline styles (no Tailwind, no CSS modules).
 */

export const COLORS = {
  light: "#0357CA",
  dark: "#F1F5F9",
} as const;

export type LogoTheme = keyof typeof COLORS;

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
  const gap = cell * 0.18;
  const r = cell * 0.22;

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
