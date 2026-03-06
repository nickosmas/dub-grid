// src/app/icon.tsx
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const navy = "#1a35a0";
const blue = "#3b82f6";

// 3×3 grid: cell=8px, gap=2px, pad=2px
// col offsets: 0→2, 1→12, 2→22
// row offsets: 0→2, 1→12, 2→22
const cells: { x: number; y: number; color: string }[] = [
  // Navy: left column + center (D's vertical bar + interior)
  { x: 2, y: 2, color: navy },
  { x: 2, y: 12, color: navy },
  { x: 2, y: 22, color: navy },
  { x: 12, y: 12, color: navy },
  // Blue: D's arch
  { x: 12, y: 2, color: blue },
  { x: 22, y: 2, color: blue },
  { x: 22, y: 12, color: blue },
  { x: 12, y: 22, color: blue },
  { x: 22, y: 22, color: blue },
];

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        display: "flex",
        position: "relative",
        background: "white",
        borderRadius: 7,
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: cell.x,
            top: cell.y,
            width: 8,
            height: 8,
            borderRadius: 2,
            background: cell.color,
          }}
        />
      ))}
    </div>,
    { ...size },
  );
}
